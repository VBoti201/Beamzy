import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { getConfig, updateConfig, SharedFolder, RelayConfig } from './config'
import { Discovery, PeerInfo } from './discovery'
import { startTransferServer } from './transferServer'
import { pushFile, pullFile, fetchJson } from './transferClient'
import { getDrives } from './drives'
import { RelayClient } from './relayClient'
import { startAutoUpdater, checkForUpdatesNow, installUpdateNow } from './updater'
import { generateUniquePairingCode } from './constants'
import { getHistory, addHistoryEntry, removeHistoryEntry } from './history'

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

const relayClient = new RelayClient({
  onPeers: (peers) => sendToWindow('relay:peers-update', peers),
  onStatus: (status) => sendToWindow('relay:status-update', status),
  onProgress: (p) => sendToWindow('transfer:progress', p),
  onHistory: (e) => recordHistory(e)
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
    onIncomingProgress: (e) =>
      sendToWindow('transfer:progress', {
        transferId: e.id,
        fileName: e.fileName,
        bytesTransferred: e.bytesTransferred,
        totalBytes: e.totalBytes,
        direction: 'push',
        done: e.totalBytes > 0 && e.bytesTransferred >= e.totalBytes
      }),
    onIncomingDone: (e) => {
      const remote = e.remoteAddress.replace(/^::ffff:/, '')
      const peer = currentPeers.find((p) => p.addresses?.includes(remote))
      recordHistory({
        fileName: e.fileName,
        filePath: e.filePath,
        direction: 'received',
        peerId: peer?.id || remote,
        peerName: peer?.name || remote,
        size: e.size
      })
    }
  })
  closeServer = close

  const cfg = getConfig()
  discovery = new Discovery((peers) => {
    currentPeers = peers
    sendToWindow('peers:update', peers)
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

app.on('before-quit', () => {
  discovery?.stop()
  closeServer?.()
  relayClient.disconnect()
})

ipcMain.handle('config:get', () => getConfig())

ipcMain.handle('update:install', () => installUpdateNow())

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
  const qs = args.folderId ? `folderId=${encodeURIComponent(args.folderId)}&path=${encodeURIComponent(args.path || '')}` : ''
  return fetchJson(args.host, args.port, `/api/list${qs ? `?${qs}` : ''}`)
})

ipcMain.handle('remote:targets', (_e, args: { host: string; port: number }) =>
  fetchJson(args.host, args.port, '/api/targets')
)

ipcMain.handle(
  'transfer:push',
  async (_e, args: { host: string; port: number; folderId: string; destRelPath: string; localFilePaths: string[] }) => {
    for (const filePath of args.localFilePaths) {
      const transferId = randomUUID()
      try {
        await pushFile(args.host, args.port, args.folderId, args.destRelPath || '', filePath, transferId, (p) =>
          sendToWindow('transfer:progress', p)
        )
        const peer = currentPeers.find((p) => p.host === args.host && p.port === args.port)
        recordHistory({
          fileName: path.basename(filePath),
          filePath,
          direction: 'sent',
          peerId: peer?.id || args.host,
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
          error: err instanceof Error ? err.message : 'Unknown error'
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
    const result = await pullFile(args.host, args.port, args.folderId, args.remoteRelPath, destFolder.path, transferId, (p) =>
      sendToWindow('transfer:progress', p)
    )
    const peer = currentPeers.find((p) => p.host === args.host && p.port === args.port)
    recordHistory({
      fileName: result.fileName,
      filePath: result.destFile,
      direction: 'received',
      peerId: peer?.id || args.host,
      peerName: peer?.name || args.host,
      size: result.size
    })
    return true
  }
)

ipcMain.handle('history:get', () => getHistory())

ipcMain.handle('history:remove', (_e, args: { id: string }) => {
  const entries = removeHistoryEntry(args.id)
  sendToWindow('history:update', entries)
  return entries
})

ipcMain.handle('history:open', (_e, args: { filePath: string }) => shell.openPath(args.filePath))
