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
  Theme,
  effectivePermission,
  setDevicePermission,
  clearDevicePermission
} from './config'
import { Discovery, PeerInfo } from './discovery'
import { startTransferServer, cancelIncomingTransfer } from './transferServer'
import { pushFile, pullFile, fetchJson, notifyHistoryDelete, sendLanPair, cancelLanTransfer } from './transferClient'
import { buildLanAuthHeaders } from './lanAuth'
import { getDrives, getPrimaryDiskSpace } from './drives'
import { RelayClient } from './relayClient'
import { startAutoUpdater, checkForUpdatesNow, installUpdateNow } from './updater'
import { generateUniquePairingCode } from './constants'
import { getHistory, addHistoryEntry, findHistoryEntryByTransferId, removeHistoryEntryByTransferId } from './history'
import { isLanDeviceApproved, approveLanDevice, forgetLanDevice, ensureOutgoingSecret } from './lanTrust'
import { needsRelayCodeMigration, markRelayCodeMigrated } from './migrations'
import { zipDirectory } from './zip'

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

app.setName('Beamzy')

function iconPathFor(theme: Theme): string {
  const filename = theme === 'light' ? 'icon-light_512.png' : 'icon_512.png'
  // build/ isn't part of the packaged app (only out/**/* is) — extraResources
  // copies both icon PNGs into resourcesPath so the runtime theme-swap below
  // can still find them once installed, not just in dev.
  return app.isPackaged ? path.join(process.resourcesPath, filename) : path.join(__dirname, '../../build', filename)
}

// The installed app's Dock/taskbar icon (Info.plist / .exe resource) is
// baked in at build time and can't change — but while the app is actually
// running, both the Dock icon (macOS) and each window's own icon (Windows/
// Linux taskbar) can be swapped live, so a theme toggle can feel instant.
function applyThemeIcon(theme: Theme): void {
  const image = nativeImage.createFromPath(iconPathFor(theme))
  if (image.isEmpty()) return
  if (process.platform === 'darwin') app.dock?.setIcon(image)
  for (const win of BrowserWindow.getAllWindows()) win.setIcon(image)
}

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
// Beamzy would show up with zero confirmation.
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

// A peer can only verify our requests if it has actually received the
// secret we sign them with (see lanTrust.ts/lanAuth.ts) — sent once per
// app session per peer so a first pairing (or a peer that lost its old
// binding, e.g. across an upgrade from before this existed) self-heals the
// next time we're about to talk to them, without any extra user action.
const securedPeersThisSession = new Set<string>()

async function ensurePairedWithPeer(peerId: string, host: string, port: number): Promise<string> {
  const secret = ensureOutgoingSecret(peerId)
  if (!securedPeersThisSession.has(peerId)) {
    securedPeersThisSession.add(peerId)
    await sendLanPair(host, port, getConfig().deviceId, secret)
  }
  return secret
}

// mainWindow can be non-null but already destroyed during app quit (e.g.
// relayClient.disconnect() firing from `before-quit` after the window is
// torn down) — webContents.send on a destroyed window throws.
function sendToWindow(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

const PROGRESS_THROTTLE_MS = 120
const lastProgressSentAt = new Map<string, number>()

// A fast LAN transfer can emit a progress event per ~64KB chunk — for a
// large file that's easily hundreds/thousands a second, each one forcing an
// IPC round-trip and a React re-render. That doesn't stall the actual file
// I/O (it's on a separate stream in the main process), but it can make the
// whole renderer feel janky/unresponsive for as long as the transfer runs.
// Rate-limit updates per transfer; always let the terminal (done/error)
// event through immediately so completion is never delayed or dropped.
function sendProgress(p: Record<string, unknown> & { transferId: string; done?: boolean; error?: string }): void {
  const isTerminal = Boolean(p.done || p.error)
  const now = Date.now()
  const last = lastProgressSentAt.get(p.transferId)
  if (!isTerminal && last !== undefined && now - last < PROGRESS_THROTTLE_MS) return
  if (isTerminal) lastProgressSentAt.delete(p.transferId)
  else lastProgressSentAt.set(p.transferId, now)
  sendToWindow('transfer:progress', p)
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
  onProgress: (p) => sendProgress({ ...p }),
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
    title: 'Beamzy',
    width: isWin ? 1200 : 1080,
    height: isWin ? 780 : 720,
    minWidth: 860,
    minHeight: 560,
    show: false,
    backgroundColor: getConfig().theme === 'light' ? '#f5ecd8' : '#08080a',
    icon: iconPathFor(getConfig().theme),
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
      sendProgress({
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

  let cfg = getConfig()

  // Devices that paired under the old shared-code model both have the
  // same pairId stored — under the new per-device model that's an
  // identity collision waiting to happen. Mint a fresh one, once, before
  // ever connecting to the relay with it.
  if (needsRelayCodeMigration()) {
    markRelayCodeMigrated()
    if (cfg.relay.pairId) {
      const freshCode = await generateUniquePairingCode(cfg.relay.url)
      cfg = updateConfig({ relay: { ...cfg.relay, pairId: freshCode } })
    }
  }

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
  if (process.platform === 'darwin') applyThemeIcon(getConfig().theme)
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

// The renderer needs the persisted theme before its very first paint (the
// splash screen included) to avoid a dark->light flash on launch — a
// synchronous call is the only way to get that in before React mounts.
ipcMain.on('config:get-theme-sync', (event) => {
  event.returnValue = getConfig().theme
})

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

ipcMain.handle('system:disk-space', () => getPrimaryDiskSpace())

ipcMain.handle(
  'config:update',
  (
    _e,
    partial: Partial<{
      deviceName: string
      sharedFolders: SharedFolder[]
      onboarded: boolean
      relay: RelayConfig
      theme: Theme
    }>
  ) => {
    const updated = updateConfig(partial)
    if (partial.deviceName && discovery) discovery.updateName(partial.deviceName)
    if (partial.deviceName || partial.relay) syncRelayClient(updated)
    if (partial.theme) applyThemeIcon(partial.theme)
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

// Unlike the old model, this never changes our own identity/code — it
// just asks the relay to link us with whoever currently holds the code
// the user typed in. Resolves once they approve, rejects if they're
// offline, decline, or don't answer in time.
ipcMain.handle('relay:pair', (_e, args: { code: string }) => relayClient.requestConnect(args.code.trim()))

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

ipcMain.handle('fs:is-directory', (_e, args: { path: string }) => {
  try {
    return fs.statSync(args.path).isDirectory()
  } catch {
    return false
  }
})

ipcMain.handle('fs:zip-directory', (_e, args: { path: string }) => zipDirectory(args.path))

ipcMain.handle('fs:delete-file', (_e, args: { path: string }) => {
  // Scoped to the app's own temp dir (where zipDirectory writes) so this
  // can't be turned into an arbitrary-file-delete primitive.
  const tempRoot = path.join(app.getPath('temp'), path.sep)
  const resolved = path.resolve(args.path)
  if (!resolved.startsWith(tempRoot)) return
  try {
    fs.unlinkSync(resolved)
  } catch {
    // already gone or never existed — nothing to clean up
  }
})

ipcMain.handle('dialog:pickFiles', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
  if (result.canceled) return []
  return result.filePaths
})

ipcMain.handle('peers:get', () => currentPeers)

ipcMain.handle('remote:list', async (_e, args: { host: string; port: number; folderId: string | null; path: string }) => {
  const peerId = currentPeers.find((p) => p.host === args.host && p.port === args.port)?.id || args.host
  const secret = await ensurePairedWithPeer(peerId, args.host, args.port)
  const params = new URLSearchParams()
  if (args.folderId) {
    params.set('folderId', args.folderId)
    params.set('path', args.path || '')
  }
  const qs = params.toString()
  const reqPath = qs ? `/api/list?${qs}` : '/api/list'
  return fetchJson(args.host, args.port, reqPath, buildLanAuthHeaders(getConfig().deviceId, secret, 'GET', '/api/list'))
})

ipcMain.handle('remote:targets', async (_e, args: { host: string; port: number }) => {
  const peerId = currentPeers.find((p) => p.host === args.host && p.port === args.port)?.id || args.host
  const secret = await ensurePairedWithPeer(peerId, args.host, args.port)
  return fetchJson(args.host, args.port, '/api/targets', buildLanAuthHeaders(getConfig().deviceId, secret, 'GET', '/api/targets'))
})

ipcMain.handle(
  'transfer:push',
  async (_e, args: { host: string; port: number; folderId: string; destRelPath: string; localFilePaths: string[] }) => {
    const peer = currentPeers.find((p) => p.host === args.host && p.port === args.port)
    const peerId = peer?.id || args.host
    const secret = await ensurePairedWithPeer(peerId, args.host, args.port)
    for (const filePath of args.localFilePaths) {
      const transferId = randomUUID()
      try {
        await pushFile(
          args.host,
          args.port,
          args.folderId,
          args.destRelPath || '',
          filePath,
          transferId,
          getConfig().deviceId,
          secret,
          (p) => sendProgress({ ...p, peerId })
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
        sendProgress({
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
    const secret = await ensurePairedWithPeer(peerId, args.host, args.port)
    const result = await pullFile(
      args.host,
      args.port,
      args.folderId,
      args.remoteRelPath,
      destFolder.path,
      transferId,
      cfg.deviceId,
      secret,
      (p) => sendProgress({ ...p, peerId })
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

ipcMain.handle('history:remove', async (_e, args: { id: string }) => {
  const entry = getHistory().find((e) => e.id === args.id)
  if (!entry) return getHistory()
  applyHistoryDelete(entry.transferId)
  if (entry.transport === 'relay') {
    relayClient.notifyHistoryDelete(entry.peerId, entry.transferId)
  } else {
    const peer = currentPeers.find((p) => p.id === entry.peerId)
    if (peer) {
      const secret = await ensurePairedWithPeer(peer.id, peer.host, peer.port)
      notifyHistoryDelete(peer.host, peer.port, entry.transferId, getConfig().deviceId, secret)
    }
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
      allowDownload: perm.allowDownload,
      isCustom: !!override
    }
  })
})

ipcMain.handle(
  'permissions:set',
  (_e, args: { deviceId: string; folderId: string; allowBrowse: boolean; allowUpload: boolean; allowDownload: boolean }) => {
    setDevicePermission(args.deviceId, args.folderId, args.allowBrowse, args.allowUpload, args.allowDownload)
  }
)

ipcMain.handle('permissions:clear', (_e, args: { deviceId: string; folderId: string }) => {
  clearDevicePermission(args.deviceId, args.folderId)
})
