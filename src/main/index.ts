import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import {
  getConfig,
  updateConfig,
  SharedFolder,
  RelayConfig,
  effectivePermission,
  setDevicePermission,
  clearDevicePermission
} from './config'
import { Discovery, PeerInfo } from './discovery'
import { startTransferServer, cancelIncomingTransfer } from './transferServer'
import { pushFile, pullFile, fetchJson, notifyHistoryDelete, cancelLanTransfer } from './transferClient'
import { getDrives } from './drives'
import { RelayClient } from './relayClient'
import { startAutoUpdater, checkForUpdatesNow, installUpdateNow } from './updater'
import { generateUniquePairingCode } from './constants'
import { getHistory, addHistoryEntry, findHistoryEntryByTransferId, removeHistoryEntryByTransferId } from './history'
import { isLanDeviceApproved, approveLanDevice, forgetLanDevice } from './lanTrust'

// bonjour-service's mDNS multicast socket lives deep inside a dependency
// (multicast-dns -> dgram) where we can't attach our own 'error' listener
// at the source. A network interface dropping mid-send (sleep/wake, WiFi
// switching, VPN toggling — including right as the app quits for an
// update) surfaces here as an uncaught exception that would otherwise take
// the whole app down. It's transient and harmless to the rest of the app,
// so swallow just this known class and let anything else crash normally
// (re-throwing from inside this handler is itself fatal, same as if we'd
// never registered one).
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err?.code === 'EADDRNOTAVAIL' || err?.code === 'ENETUNREACH' || err?.code === 'EHOSTUNREACH') {
    console.error('[mDNS] transient network error, continuing:', err.message)
    return
  }
  throw err
})

function getFriendlySystemName(): string {
  if (process.platform === 'darwin') {
    try {
      const name = execSync('scutil --get ComputerName', { timeout: 3000 }).toString().trim()
      if (name) return name
    } catch {
      // fall through to hostname
    }
  }
  return os.hostname().replace(/\.local$/i, '')
}

app.setName('SwiftSend')

let mainWindow: BrowserWindow | null = null
let discovery: Discovery | null = null
let currentPeers: PeerInfo[] = []
let closeServer: (() => void) | null = null
let lastRawLanPeers: PeerInfo[] = []
const pendingLanApprovals = new Set<string>()
const rejectedLanDevices = new Set<string>()

// LAN peers don't need a pairing code (mDNS just finds them), but a never-
// approved deviceId still shouldn't be usable until the user explicitly
// accepts it — otherwise anyone else on the same WiFi/router running
// SwiftSend would show up with zero confirmation.
function refreshLanPeers(): void {
  for (const p of lastRawLanPeers) {
    if (!isLanDeviceApproved(p.id) && !pendingLanApprovals.has(p.id) && !rejectedLanDevices.has(p.id)) {
      pendingLanApprovals.add(p.id)
      sendToWindow('relay:pairing-request', { requestId: p.id, deviceId: p.id, name: p.name, platform: p.platform, source: 'lan' })
    }
  }
  currentPeers = lastRawLanPeers.filter((p) => isLanDeviceApproved(p.id))
  sendToWindow('peers:update', currentPeers)
}

// mainWindow can be non-null but already destroyed during app quit (e.g.
// relayClient.disconnect() firing from `before-quit` after the window is
// torn down) — webContents.send on a destroyed window throws.
function sendToWindow(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function recordHistory(entry: Parameters<typeof addHistoryEntry>[0]): void {
  const entries = addHistoryEntry(entry)
  sendToWindow('history:update', entries)
}

// Deleting a "received" copy actually removes the file (it's a landed
// duplicate); deleting a "sent" record never touches the original source
// file, only the log entry. Applied independently on whichever device
// this runs on, so the same transferId resolves correctly on both sides
// regardless of which one asked to delete first.
function applyHistoryDelete(transferId: string): void {
  const entry = findHistoryEntryByTransferId(transferId)
  if (entry && entry.direction === 'received') {
    try {
      fs.unlinkSync(entry.filePath)
    } catch {
      // Already gone, or inaccessible — nothing more we can do about it.
    }
  }
  const entries = removeHistoryEntryByTransferId(transferId)
  sendToWindow('history:update', entries)
}

const relayClient = new RelayClient({
  onPeers: (peers) => sendToWindow('relay:peers-update', peers),
  onStatus: (status) => sendToWindow('relay:status-update', status),
  onProgress: (p) => sendToWindow('transfer:progress', p),
  onHistory: (e) => recordHistory({ ...e, transport: 'relay' }),
  onPairingRequest: (req) => sendToWindow('relay:pairing-request', { ...req, source: 'relay' }),
  onHistoryDeleteRequest: (transferId) => applyHistoryDelete(transferId)
})

function syncRelayClient(cfg: ReturnType<typeof getConfig>): void {
  relayClient.configure({
    enabled: cfg.relay.enabled,
    url: cfg.relay.url,
    pairId: cfg.relay.pairId,
    deviceId: cfg.deviceId,
    deviceName: cfg.deviceName || getFriendlySystemName()
  })
}

function createWindow(): void {
  const isWin = process.platform === 'win32'
  mainWindow = new BrowserWindow({
    title: 'SwiftSend',
    width: isWin ? 1200 : 1080,
    height: isWin ? 780 : 720,
    minWidth: 860,
    minHeight: 560,
    show: false,
    backgroundColor: '#08080a',
    icon: path.join(__dirname, '../../build/icon_512.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.platform !== 'darwin') mainWindow.removeMenu()

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  const { port, close } = await startTransferServer({
    onIncomingProgress: (e) => {
      const remote = e.remoteAddress.replace(/^::ffff:/, '')
      const peer = currentPeers.find((p) => p.addresses?.includes(remote))
      sendToWindow('transfer:progress', {
        transferId: e.id,
        fileName: e.fileName,
        bytesTransferred: e.bytesTransferred,
        totalBytes: e.totalBytes,
        // This is always data landing on this device (someone pushed to
        // us), regardless of the HTTP verb involved — show it as incoming.
        direction: 'pull',
        done: e.totalBytes > 0 && e.bytesTransferred >= e.totalBytes,
        error: e.error,
        peerId: peer?.id || remote
      })
    },
    onIncomingDone: (e) => {
      const remote = e.remoteAddress.replace(/^::ffff:/, '')
      const peer = currentPeers.find((p) => p.addresses?.includes(remote))
      recordHistory({
        transferId: e.transferId,
        transport: 'lan',
        fileName: e.fileName,
        filePath: e.filePath,
        direction: 'received',
        peerId: peer?.id || remote,
        peerName: peer?.name || remote,
        size: e.size
      })
    },
    onHistoryDeleteRequest: (transferId) => applyHistoryDelete(transferId)
  })
  closeServer = close

  const cfg = getConfig()
  discovery = new Discovery((peers) => {
    lastRawLanPeers = peers
    refreshLanPeers()
  })
  discovery.start(cfg.deviceId, cfg.deviceName || getFriendlySystemName(), port)

  syncRelayClient(cfg)

  sendToWindow('app:ready', { port })

  startAutoUpdater(() => mainWindow)
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && !app.isPackaged) {
    const devIcon = nativeImage.createFromPath(path.join(__dirname, '../../build/icon_512.png'))
    if (!devIcon.isEmpty()) app.dock?.setIcon(devIcon)
  }
  createWindow()
  mainWindow?.webContents.once('did-finish-load', () => {
    bootstrap()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function cleanupBeforeQuit(): void {
  discovery?.stop()
  closeServer?.()
  relayClient.disconnect()
}

app.on('before-quit', cleanupBeforeQuit)

ipcMain.handle('config:get', () => getConfig())

ipcMain.handle('update:install', () => {
  // quitAndInstall's quit path doesn't reliably wait for 'before-quit' to
  // finish (the installer can launch and the process exit almost
  // simultaneously on Windows) — disconnect explicitly first so the relay
  // sees a clean close and the other device's peer list updates right
  // away, instead of only after a stale-connection timeout. The short
  // delay gives the WebSocket close frame a moment to actually leave the
  // machine before the process (and its sockets) get torn down for real.
  cleanupBeforeQuit()
  setTimeout(() => installUpdateNow(), 300)
})

ipcMain.handle('update:check', () => checkForUpdatesNow())

ipcMain.handle('update:get-version', () => app.getVersion())

ipcMain.handle('system:hostname', () => getFriendlySystemName())

ipcMain.handle('system:drives', () => getDrives())

ipcMain.handle(
  'config:update',
  (_e, partial: Partial<{ deviceName: string; sharedFolders: SharedFolder[]; onboarded: boolean; relay: RelayConfig }>) => {
    const updated = updateConfig(partial)
    if (partial.deviceName && discovery) discovery.updateName(partial.deviceName)
    if (partial.deviceName || partial.relay) syncRelayClient(updated)
    return updated
  }
)

ipcMain.handle('relay:set-enabled', async (_e, args: { enabled: boolean; url: string }) => {
  const cfg = getConfig()
  const url = args.url.trim()
  const pairId = cfg.relay.pairId || (await generateUniquePairingCode(url))
  const updated = updateConfig({ relay: { enabled: args.enabled, url, pairId } })
  syncRelayClient(updated)
  return updated.relay
})

ipcMain.handle('relay:regenerate-code', async () => {
  const cfg = getConfig()
  const pairId = await generateUniquePairingCode(cfg.relay.url)
  const updated = updateConfig({ relay: { ...cfg.relay, pairId } })
  syncRelayClient(updated)
  return updated.relay
})

ipcMain.handle('relay:pairing-approve', (_e, args: { requestId: string }) => relayClient.approvePairing(args.requestId))

ipcMain.handle('relay:pairing-reject', (_e, args: { requestId: string }) => relayClient.rejectPairing(args.requestId))

ipcMain.handle('relay:kick-device', (_e, args: { deviceId: string }) => relayClient.kickDevice(args.deviceId))

ipcMain.handle('lan:approve-device', (_e, args: { deviceId: string }) => {
  approveLanDevice(args.deviceId)
  pendingLanApprovals.delete(args.deviceId)
  refreshLanPeers()
})

ipcMain.handle('lan:reject-device', (_e, args: { deviceId: string }) => {
  pendingLanApprovals.delete(args.deviceId)
  rejectedLanDevices.add(args.deviceId)
  refreshLanPeers()
})

ipcMain.handle('lan:forget-device', (_e, args: { deviceId: string }) => {
  forgetLanDevice(args.deviceId)
  refreshLanPeers()
})

ipcMain.handle('relay:pair', (_e, args: { code: string }) => {
  const cfg = getConfig()
  const code = args.code.trim().toUpperCase()
  const updated = updateConfig({ relay: { ...cfg.relay, enabled: true, pairId: code } })
  syncRelayClient(updated)
  return updated.relay
})

ipcMain.handle('relay:list', (_e, args: { peerId: string; folderId: string | null; path: string }) =>
  relayClient.listFolder(args.peerId, args.folderId, args.path)
)

ipcMain.handle('relay:targets', (_e, args: { peerId: string }) => relayClient.getTargets(args.peerId))

ipcMain.handle(
  'relay:push',
  (_e, args: { peerId: string; folderId: string; destRelPath: string; localFilePaths: string[] }) =>
    relayClient.push(args.peerId, args.folderId, args.destRelPath || '', args.localFilePaths)
)

ipcMain.handle(
  'relay:pull',
  (_e, args: { peerId: string; folderId: string; remoteRelPath: string; destFolderId: string }) => {
    const cfg = getConfig()
    const destFolder = cfg.sharedFolders.find((f) => f.id === args.destFolderId)
    if (!destFolder) throw new Error('Unknown destination folder')
    return relayClient.pullFile(args.peerId, args.folderId, args.remoteRelPath, destFolder.path)
  }
)

ipcMain.handle('dialog:chooseFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('dialog:pickFiles', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
  if (result.canceled) return []
  return result.filePaths
})

ipcMain.handle('peers:get', () => currentPeers)

ipcMain.handle('remote:list', (_e, args: { host: string; port: number; folderId: string | null; path: string }) => {
  const params = new URLSearchParams({ requesterId: getConfig().deviceId })
  if (args.folderId) {
    params.set('folderId', args.folderId)
    params.set('path', args.path || '')
  }
  return fetchJson(args.host, args.port, `/api/list?${params.toString()}`)
})

ipcMain.handle('remote:targets', (_e, args: { host: string; port: number }) =>
  fetchJson(args.host, args.port, `/api/targets?requesterId=${encodeURIComponent(getConfig().deviceId)}`)
)

ipcMain.handle(
  'transfer:push',
  async (_e, args: { host: string; port: number; folderId: string; destRelPath: string; localFilePaths: string[] }) => {
    const peer = currentPeers.find((p) => p.host === args.host && p.port === args.port)
    const peerId = peer?.id || args.host
    for (const filePath of args.localFilePaths) {
      const transferId = randomUUID()
      try {
        await pushFile(args.host, args.port, args.folderId, args.destRelPath || '', filePath, transferId, getConfig().deviceId, (p) =>
          sendToWindow('transfer:progress', { ...p, peerId })
        )
        recordHistory({
          transferId,
          transport: 'lan',
          fileName: path.basename(filePath),
          filePath,
          direction: 'sent',
          peerId,
          peerName: peer?.name || args.host,
          size: fs.statSync(filePath).size
        })
      } catch (err) {
        sendToWindow('transfer:progress', {
          transferId,
          fileName: path.basename(filePath),
          bytesTransferred: 0,
          totalBytes: 0,
          direction: 'push',
          error: err instanceof Error ? err.message : 'Unknown error',
          peerId
        })
      }
    }
    return true
  }
)

ipcMain.handle(
  'transfer:pull',
  async (_e, args: { host: string; port: number; folderId: string; remoteRelPath: string; destFolderId: string }) => {
    const cfg = getConfig()
    const destFolder = cfg.sharedFolders.find((f) => f.id === args.destFolderId)
    if (!destFolder) throw new Error('Unknown destination folder')
    const transferId = randomUUID()
    const peer = currentPeers.find((p) => p.host === args.host && p.port === args.port)
    const peerId = peer?.id || args.host
    const result = await pullFile(args.host, args.port, args.folderId, args.remoteRelPath, destFolder.path, transferId, cfg.deviceId, (p) =>
      sendToWindow('transfer:progress', { ...p, peerId })
    )
    recordHistory({
      transferId,
      transport: 'lan',
      fileName: result.fileName,
      filePath: result.destFile,
      direction: 'received',
      peerId,
      peerName: peer?.name || args.host,
      size: result.size
    })
    return true
  }
)

ipcMain.handle('history:get', () => getHistory())

ipcMain.handle('history:remove', (_e, args: { id: string }) => {
  const entry = getHistory().find((e) => e.id === args.id)
  if (!entry) return getHistory()
  applyHistoryDelete(entry.transferId)
  if (entry.transport === 'relay') {
    relayClient.notifyHistoryDelete(entry.peerId, entry.transferId)
  } else {
    const peer = currentPeers.find((p) => p.id === entry.peerId)
    if (peer) notifyHistoryDelete(peer.host, peer.port, entry.transferId)
  }
  return getHistory()
})

ipcMain.handle('history:open', (_e, args: { filePath: string }) => shell.openPath(args.filePath))

ipcMain.handle('transfer:cancel', (_e, args: { transferId: string }) => {
  // Try every transport's cancel — whichever one actually has this
  // transferId active will do something, the rest are harmless no-ops.
  cancelLanTransfer(args.transferId)
  cancelIncomingTransfer(args.transferId)
  relayClient.cancelPull(args.transferId)
})

ipcMain.handle('permissions:get', (_e, args: { deviceId: string }) => {
  const cfg = getConfig()
  return cfg.sharedFolders.map((f) => {
    const override = cfg.devicePermissions.find((p) => p.deviceId === args.deviceId && p.folderId === f.id)
    const perm = effectivePermission(cfg, args.deviceId, f.id)!
    return {
      folderId: f.id,
      folderName: f.name,
      allowBrowse: perm.allowBrowse,
      allowUpload: perm.allowUpload,
      isCustom: !!override
    }
  })
})

ipcMain.handle('permissions:set', (_e, args: { deviceId: string; folderId: string; allowBrowse: boolean; allowUpload: boolean }) => {
  setDevicePermission(args.deviceId, args.folderId, args.allowBrowse, args.allowUpload)
})

ipcMain.handle('permissions:clear', (_e, args: { deviceId: string; folderId: string }) => {
  clearDevicePermission(args.deviceId, args.folderId)
})
