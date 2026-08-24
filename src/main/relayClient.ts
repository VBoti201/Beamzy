import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { getConfig } from './config'

export interface RelayPeer {
  deviceId: string
  name: string
  platform?: string
}

export interface RelayTransferProgress {
  transferId: string
  fileName: string
  bytesTransferred: number
  totalBytes: number
  direction: 'push' | 'pull'
  done?: boolean
  error?: string
}

interface RemoteEntryLike {
  name: string
  path: string
  isDir: boolean
  size: number
  id?: string
  isRoot?: boolean
}

const CHUNK_SIZE = 256 * 1024
const REQUEST_TIMEOUT_MS = 10000

function safeResolve(root: string, relPath: string): string {
  const normalizedRoot = path.normalize(root)
  const resolved = path.normalize(path.join(normalizedRoot, relPath || ''))
  // A drive root like "D:\" already ends in the separator — appending
  // another one before checking startsWith would require a doubled
  // separator that never actually occurs, incorrectly blocking every file
  // directly inside a whole-drive shared folder.
  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep
  if (resolved !== normalizedRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error('Path traversal blocked')
  }
  return resolved
}

// fs.mkdirSync(dir, { recursive: true }) throws EPERM (not EEXIST) on Windows
// when `dir` is a drive root like "D:\" that already exists — only create it
// when it's actually missing.
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

interface PendingRequest {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

interface PendingPull {
  destDirPath: string
  fileName: string
  resolve: () => void
  reject: (e: Error) => void
}

interface IncomingWrite {
  stream: fs.WriteStream
  destFile: string
  fileName: string
  totalBytes: number
  bytesTransferred: number
  fromPeerId: string
}

export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface RelayHistoryEvent {
  transferId: string
  fileName: string
  filePath: string
  direction: 'sent' | 'received'
  peerId: string
  peerName: string
  size: number
}

export interface PairingRequest {
  requestId: string
  deviceId: string
  name: string
  platform?: string
}

interface RelayClientCallbacks {
  onPeers: (peers: RelayPeer[]) => void
  onProgress: (p: RelayTransferProgress) => void
  onStatus: (status: RelayStatus) => void
  onHistory: (e: RelayHistoryEvent) => void
  onPairingRequest: (req: PairingRequest) => void
  onHistoryDeleteRequest: (transferId: string) => void
}

export class RelayClient {
  private ws: WebSocket | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private pendingPulls = new Map<string, PendingPull>()
  private incomingWrites = new Map<string, IncomingWrite>()
  private outgoingPushes = new Map<string, { fileName: string; totalBytes: number }>()
  private knownPeers = new Map<string, RelayPeer>()
  private url = ''
  private pairId = ''
  private deviceId = ''
  private deviceName = ''
  private enabled = false

  constructor(private callbacks: RelayClientCallbacks) {}

  configure(opts: { enabled: boolean; url: string; pairId: string; deviceId: string; deviceName: string }): void {
    const changed =
      this.url !== opts.url || this.pairId !== opts.pairId || this.enabled !== opts.enabled || this.deviceName !== opts.deviceName
    this.url = opts.url
    this.pairId = opts.pairId
    this.deviceId = opts.deviceId
    this.deviceName = opts.deviceName
    this.enabled = opts.enabled

    if (!changed) return
    this.disconnect()
    if (this.enabled && this.url && this.pairId) this.connect()
  }

  private connect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    let target: string
    try {
      const base = this.url.replace(/\/+$/, '')
      const qs = `pairId=${encodeURIComponent(this.pairId)}&deviceId=${encodeURIComponent(this.deviceId)}&name=${encodeURIComponent(this.deviceName)}&platform=${encodeURIComponent(process.platform)}`
      target = `${base}/ws?${qs}`
    } catch {
      this.callbacks.onStatus('error')
      return
    }

    this.callbacks.onStatus('connecting')
    const ws = new WebSocket(target)
    this.ws = ws

    // The socket is open, but not yet admitted to the room — a brand new
    // device may need another admitted device to approve it first. Status
    // flips to 'connected' only once the server sends 'pairing-admitted'.
    ws.on('open', () => this.callbacks.onStatus('connecting'))
    ws.on('message', (data) => this.handleMessage(data.toString()))
    ws.on('close', () => {
      this.callbacks.onStatus('disconnected')
      this.callbacks.onPeers([])
      this.scheduleReconnect()
    })
    ws.on('error', () => {
      this.callbacks.onStatus('error')
    })
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.enabled) this.connect()
    }, 4000)
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.removeAllListeners()
    this.ws?.close()
    this.ws = null
    this.callbacks.onStatus('disconnected')
  }

  private sendRelay(to: string, payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'relay', to, payload }))
  }

  private request<T>(to: string, payload: Record<string, unknown>): Promise<T> {
    const requestId = randomUUID()
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('Remote device did not respond in time'))
      }, REQUEST_TIMEOUT_MS)
      this.pendingRequests.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.sendRelay(to, { ...payload, requestId })
    })
  }

  private handleMessage(raw: string): void {
    let msg: {
      type: string
      peers?: RelayPeer[]
      from?: string
      message?: string
      payload?: Record<string, unknown>
      requestId?: string
      deviceId?: string
      name?: string
      platform?: string
    }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (msg.type === 'presence') {
      const peers = msg.peers || []
      this.knownPeers.clear()
      for (const p of peers) this.knownPeers.set(p.deviceId, p)
      this.callbacks.onPeers(peers)
      return
    }
    if (msg.type === 'error') {
      return
    }
    if (msg.type === 'pairing-admitted') {
      this.callbacks.onStatus('connected')
      return
    }
    if (msg.type === 'pairing-pending') {
      this.callbacks.onStatus('connecting')
      return
    }
    if (msg.type === 'pairing-request' && msg.requestId && msg.deviceId) {
      this.callbacks.onPairingRequest({
        requestId: msg.requestId,
        deviceId: msg.deviceId,
        name: msg.name || 'Unknown device',
        platform: msg.platform
      })
      return
    }
    if (msg.type === 'pairing-timeout') {
      // Nobody happened to be around to approve this time — a plain
      // reconnect attempt in a few seconds gives another chance rather
      // than requiring the user to notice and manually retry.
      this.callbacks.onStatus('error')
      return
    }
    if (msg.type === 'pairing-rejected' || msg.type === 'kicked') {
      // A deliberate reject/kick from another device — auto-reconnecting
      // every few seconds would just spam that device with the same
      // approval prompt again and again. Stop until the user explicitly
      // re-enables remote access or re-pairs. disconnect() removes this
      // socket's listeners before closing it, so the normal
      // ws.on('close') reconnect path never fires for this case.
      this.disconnect()
      return
    }
    if (msg.type !== 'relay' || !msg.from || !msg.payload) return

    const from = msg.from
    const payload = msg.payload
    const kind = payload.kind as string

    switch (kind) {
      case 'targets-request':
        this.respondTargets(from, payload.requestId as string)
        return
      case 'targets-response':
      case 'list-response':
        this.resolvePending(payload.requestId as string, payload)
        return
      case 'error-response':
        this.rejectPending(payload.requestId as string, String(payload.message || 'Remote error'))
        return
      case 'list-request':
        this.respondList(from, payload)
        return
      case 'upload-start':
        this.handleUploadStart(from, payload)
        return
      case 'history-delete':
        this.callbacks.onHistoryDeleteRequest(payload.transferId as string)
        return
      case 'upload-chunk':
        this.handleUploadChunk(payload)
        return
      case 'upload-end':
        this.handleUploadEnd(payload)
        return
      case 'upload-error':
        this.handleUploadError(payload)
        return
      case 'download-request':
        this.respondDownload(from, payload)
        return
    }
  }

  private resolvePending(requestId: string, value: unknown): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingRequests.delete(requestId)
    pending.resolve(value)
  }

  private rejectPending(requestId: string, message: string): void {
    const pending = this.pendingRequests.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingRequests.delete(requestId)
    pending.reject(new Error(message))
  }

  private respondTargets(from: string, requestId: string): void {
    const cfg = getConfig()
    const targets = cfg.sharedFolders.filter((f) => f.allowUpload).map((f) => ({ id: f.id, name: f.name }))
    this.sendRelay(from, { kind: 'targets-response', requestId, targets })
  }

  private respondList(from: string, payload: Record<string, unknown>): void {
    const requestId = payload.requestId as string
    const folderId = (payload.folderId as string) || null
    const relPath = (payload.path as string) || ''
    const cfg = getConfig()

    try {
      if (!folderId) {
        const roots = cfg.sharedFolders
          .filter((f) => f.allowBrowse)
          .map((f) => ({ id: f.id, name: f.name, path: '', isDir: true, isRoot: true, size: 0 }))
        this.sendRelay(from, { kind: 'list-response', requestId, entries: roots })
        return
      }
      const folder = cfg.sharedFolders.find((f) => f.id === folderId && f.allowBrowse)
      if (!folder) throw new Error('Folder not shared')
      const target = safeResolve(folder.path, relPath)
      const dirents = fs.readdirSync(target, { withFileTypes: true })
      const entries: RemoteEntryLike[] = dirents
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => {
          const entryRel = relPath ? `${relPath}/${e.name}` : e.name
          let size = 0
          try {
            size = e.isFile() ? fs.statSync(path.join(target, e.name)).size : 0
          } catch {
            size = 0
          }
          return { name: e.name, path: entryRel, isDir: e.isDirectory(), size }
        })
      this.sendRelay(from, { kind: 'list-response', requestId, entries })
    } catch (err) {
      this.sendRelay(from, { kind: 'error-response', requestId, message: err instanceof Error ? err.message : 'List failed' })
    }
  }

  private handleUploadStart(from: string, payload: Record<string, unknown>): void {
    const transferId = payload.transferId as string
    const fileName = payload.fileName as string
    const totalBytes = Number(payload.totalBytes || 0)

    const pull = this.pendingPulls.get(transferId)
    if (pull) {
      try {
        ensureDir(pull.destDirPath)
        const destFile = path.join(pull.destDirPath, fileName)
        const stream = fs.createWriteStream(destFile)
        // createWriteStream doesn't throw synchronously for a bad
        // destination (e.g. a read-only filesystem) — the open() failure
        // arrives later as an async 'error' event. Without a listener
        // attached up front, Node treats that as an uncaught exception and
        // crashes the whole main process.
        stream.on('error', (streamErr) => {
          this.incomingWrites.delete(transferId)
          const pending = this.pendingPulls.get(transferId)
          if (pending) {
            pending.reject(streamErr)
            this.pendingPulls.delete(transferId)
          }
          this.callbacks.onProgress({
            transferId,
            fileName,
            bytesTransferred: 0,
            totalBytes,
            direction: 'pull',
            error: streamErr.message
          })
        })
        this.incomingWrites.set(transferId, { stream, destFile, fileName, totalBytes, bytesTransferred: 0, fromPeerId: from })
      } catch (err) {
        pull.reject(err instanceof Error ? err : new Error('Failed to start download'))
        this.pendingPulls.delete(transferId)
      }
      return
    }

    const folderId = payload.folderId as string
    const relPath = (payload.path as string) || ''
    const cfg = getConfig()
    const folder = cfg.sharedFolders.find((f) => f.id === folderId && f.allowUpload)
    if (!folder) {
      this.sendRelay(from, { kind: 'upload-error', transferId, message: 'Destination folder not shared for upload' })
      return
    }
    try {
      const destDir = safeResolve(folder.path, relPath)
      ensureDir(destDir)
      const destFile = safeResolve(destDir, path.basename(fileName))
      const stream = fs.createWriteStream(destFile)
      // See the matching comment in the pull branch above — createWriteStream
      // failures are async, so this listener must be attached synchronously
      // or an EROFS/EACCES here crashes the whole main process.
      stream.on('error', (streamErr) => {
        this.incomingWrites.delete(transferId)
        this.sendRelay(from, { kind: 'upload-error', transferId, message: streamErr.message })
      })
      this.incomingWrites.set(transferId, { stream, destFile, fileName, totalBytes, bytesTransferred: 0, fromPeerId: from })
    } catch (err) {
      this.sendRelay(from, { kind: 'upload-error', transferId, message: err instanceof Error ? err.message : 'Failed to receive file' })
    }
  }

  private handleUploadChunk(payload: Record<string, unknown>): void {
    const transferId = payload.transferId as string
    const data = payload.data as string
    const write = this.incomingWrites.get(transferId)
    if (!write) return
    const buf = Buffer.from(data, 'base64')
    write.stream.write(buf)
    write.bytesTransferred += buf.length
    this.callbacks.onProgress({
      transferId,
      fileName: write.fileName,
      bytesTransferred: write.bytesTransferred,
      totalBytes: write.totalBytes,
      // incomingWrites always means data landing on this device, whether
      // we're on the receiving end of someone else's push or of our own
      // pull — show it as incoming either way.
      direction: 'pull'
    })
  }

  private handleUploadEnd(payload: Record<string, unknown>): void {
    const transferId = payload.transferId as string
    const write = this.incomingWrites.get(transferId)
    if (!write) return
    write.stream.end(() => {
      this.callbacks.onProgress({
        transferId,
        fileName: write.fileName,
        bytesTransferred: write.totalBytes,
        totalBytes: write.totalBytes,
        direction: 'pull',
        done: true
      })
      const pull = this.pendingPulls.get(transferId)
      if (pull) {
        pull.resolve()
        this.pendingPulls.delete(transferId)
      }
      const fromPeer = this.knownPeers.get(write.fromPeerId)
      this.callbacks.onHistory({
        transferId,
        fileName: write.fileName,
        filePath: write.destFile,
        direction: 'received',
        peerId: write.fromPeerId,
        peerName: fromPeer?.name || write.fromPeerId,
        size: write.totalBytes
      })
      this.incomingWrites.delete(transferId)
    })
  }

  private handleUploadError(payload: Record<string, unknown>): void {
    const transferId = payload.transferId as string
    const message = String(payload.message || 'Transfer failed')
    const write = this.incomingWrites.get(transferId)
    if (write) {
      write.stream.destroy()
      this.incomingWrites.delete(transferId)
    }
    const pull = this.pendingPulls.get(transferId)
    if (pull) {
      pull.reject(new Error(message))
      this.pendingPulls.delete(transferId)
    }
    const outgoingPush = this.outgoingPushes.get(transferId)
    this.outgoingPushes.delete(transferId)
    this.callbacks.onProgress({
      transferId,
      fileName: write?.fileName || pull?.fileName || outgoingPush?.fileName || 'file',
      bytesTransferred: write?.bytesTransferred || 0,
      totalBytes: write?.totalBytes || outgoingPush?.totalBytes || 0,
      direction: write || pull ? 'pull' : 'push',
      error: message
    })
  }

  private respondDownload(from: string, payload: Record<string, unknown>): void {
    const transferId = payload.transferId as string
    const folderId = payload.folderId as string
    const relPath = (payload.path as string) || ''
    const cfg = getConfig()
    const folder = cfg.sharedFolders.find((f) => f.id === folderId && f.allowBrowse)
    if (!folder) {
      this.sendRelay(from, { kind: 'upload-error', transferId, message: 'Folder not shared' })
      return
    }
    let filePath: string
    let size: number
    try {
      filePath = safeResolve(folder.path, relPath)
      size = fs.statSync(filePath).size
    } catch (err) {
      this.sendRelay(from, { kind: 'upload-error', transferId, message: err instanceof Error ? err.message : 'File not found' })
      return
    }
    const fileName = path.basename(filePath)
    this.streamFileTo(from, transferId, filePath, fileName, size, '', '')
  }

  private async streamFileTo(
    to: string,
    transferId: string,
    filePath: string,
    fileName: string,
    totalBytes: number,
    destFolderId: string,
    destRelPath: string
  ): Promise<void> {
    this.sendRelay(to, { kind: 'upload-start', transferId, folderId: destFolderId, path: destRelPath, fileName, totalBytes })
    let bytesTransferred = 0
    await new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE })
      stream.on('data', (chunk: string | Buffer) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
        bytesTransferred += buf.length
        this.sendRelay(to, { kind: 'upload-chunk', transferId, data: buf.toString('base64') })
        // streamFileTo always means this device is sending bytes out —
        // whether because it initiated a push or is serving someone else's
        // pull request — so this is always outgoing from here.
        this.callbacks.onProgress({ transferId, fileName, bytesTransferred, totalBytes, direction: 'push' })
      })
      stream.on('end', () => {
        this.sendRelay(to, { kind: 'upload-end', transferId })
        this.callbacks.onProgress({ transferId, fileName, bytesTransferred: totalBytes, totalBytes, direction: 'push', done: true })
        const toPeer = this.knownPeers.get(to)
        this.callbacks.onHistory({
          transferId,
          fileName,
          filePath,
          direction: 'sent',
          peerId: to,
          peerName: toPeer?.name || to,
          size: totalBytes
        })
        resolve()
      })
      stream.on('error', (err) => {
        this.sendRelay(to, { kind: 'upload-error', transferId, message: err.message })
        reject(err)
      })
    })
  }

  isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN
  }

  getTargets(peerId: string): Promise<{ id: string; name: string }[]> {
    return this.request<{ targets: { id: string; name: string }[] }>(peerId, { kind: 'targets-request' }).then((r) => r.targets)
  }

  listFolder(peerId: string, folderId: string | null, relPath: string): Promise<RemoteEntryLike[]> {
    return this.request<{ entries: RemoteEntryLike[] }>(peerId, { kind: 'list-request', folderId, path: relPath }).then((r) => r.entries)
  }

  async push(peerId: string, folderId: string, destRelPath: string, localFilePaths: string[]): Promise<void> {
    for (const filePath of localFilePaths) {
      const transferId = randomUUID()
      const stat = fs.statSync(filePath)
      const fileName = path.basename(filePath)
      // Tracked so handleUploadError can report the right file name if the
      // *receiver* rejects the transfer (e.g. destination not writable) —
      // that arrives asynchronously, decoupled from streamFileTo's own
      // promise, which only resolves/rejects based on the local read side.
      this.outgoingPushes.set(transferId, { fileName, totalBytes: stat.size })
      try {
        await this.streamFileTo(peerId, transferId, filePath, fileName, stat.size, folderId, destRelPath)
        // Local streaming finished, but the receiver acks failure (not
        // success) asynchronously — keep the lookup around briefly in case
        // a delayed upload-error is still on its way, then let it go.
        setTimeout(() => this.outgoingPushes.delete(transferId), REQUEST_TIMEOUT_MS)
      } catch (err) {
        this.outgoingPushes.delete(transferId)
        this.callbacks.onProgress({
          transferId,
          fileName,
          bytesTransferred: 0,
          totalBytes: stat.size,
          direction: 'push',
          error: err instanceof Error ? err.message : 'Send failed'
        })
      }
    }
  }

  pullFile(peerId: string, folderId: string, remoteRelPath: string, destDirPath: string): Promise<void> {
    const transferId = randomUUID()
    return new Promise<void>((resolve, reject) => {
      this.pendingPulls.set(transferId, { destDirPath, fileName: path.basename(remoteRelPath), resolve, reject })
      this.sendRelay(peerId, { kind: 'download-request', transferId, folderId, path: remoteRelPath })
      setTimeout(() => {
        if (this.pendingPulls.has(transferId)) {
          this.pendingPulls.delete(transferId)
          reject(new Error('Remote device did not respond in time'))
        }
      }, 15000)
    })
  }

  private sendControl(obj: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(obj))
  }

  approvePairing(requestId: string): void {
    this.sendControl({ type: 'pairing-approve', requestId })
  }

  rejectPairing(requestId: string): void {
    this.sendControl({ type: 'pairing-reject', requestId })
  }

  kickDevice(deviceId: string): void {
    this.sendControl({ type: 'kick', deviceId })
  }

  notifyHistoryDelete(peerId: string, transferId: string): void {
    this.sendRelay(peerId, { kind: 'history-delete', transferId })
  }
}
