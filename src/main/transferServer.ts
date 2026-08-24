import http from 'http'
import fs from 'fs'
import path from 'path'
import { getConfig, effectivePermission } from './config'

export interface IncomingProgressEvent {
  direction: 'up'
  id: string
  fileName: string
  bytesTransferred: number
  totalBytes: number
  remoteAddress: string
  error?: string
}

export interface IncomingDoneEvent {
  transferId: string
  fileName: string
  filePath: string
  size: number
  remoteAddress: string
}

interface ServerEvents {
  onIncomingProgress?: (e: IncomingProgressEvent) => void
  onIncomingDone?: (e: IncomingDoneEvent) => void
  onHistoryDeleteRequest?: (transferId: string) => void
}

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

// Falls back to the folder's own default when the caller didn't report a
// requesterId (an older client build) — otherwise resolves the requesting
// device's own per-device override.
function permissionFor(
  cfg: ReturnType<typeof getConfig>,
  requesterId: string,
  folderId: string
): { allowBrowse: boolean; allowUpload: boolean } | null {
  if (!requesterId) {
    const folder = cfg.sharedFolders.find((f) => f.id === folderId)
    return folder ? { allowBrowse: folder.allowBrowse, allowUpload: folder.allowUpload } : null
  }
  return effectivePermission(cfg, requesterId, folderId)
}

interface ActiveIncoming {
  req: http.IncomingMessage
  writeStream: fs.WriteStream
  onIncomingProgress?: (e: IncomingProgressEvent) => void
  fileName: string
  totalBytes: number
  remoteAddress: string
}

const activeIncoming = new Map<string, ActiveIncoming>()

// A device pushing to us is still something the receiving side should be
// able to stop mid-transfer, same as a self-initiated pull.
export function cancelIncomingTransfer(transferId: string): boolean {
  const active = activeIncoming.get(transferId)
  if (!active) return false
  activeIncoming.delete(transferId)
  active.req.destroy()
  active.writeStream.destroy()
  active.onIncomingProgress?.({
    direction: 'up',
    id: transferId,
    fileName: active.fileName,
    bytesTransferred: 0,
    totalBytes: active.totalBytes,
    remoteAddress: active.remoteAddress,
    error: 'Cancelled'
  })
  return true
}

export function startTransferServer(events: ServerEvents = {}): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '', 'http://localhost')
      res.setHeader('Access-Control-Allow-Origin', '*')

      if (url.pathname === '/api/list' && req.method === 'GET') return handleList(url, res)
      if (url.pathname === '/api/targets' && req.method === 'GET') return handleTargets(url, res)
      if (url.pathname === '/api/download' && req.method === 'GET') return handleDownload(url, res)
      if (url.pathname === '/api/upload' && req.method === 'POST') return handleUpload(url, req, res, events)
      if (url.pathname === '/api/history-delete' && req.method === 'POST') return handleHistoryDelete(url, res, events)

      res.writeHead(404)
      res.end('not found')
    } catch (err) {
      res.writeHead(400)
      res.end(err instanceof Error ? err.message : 'error')
    }
  })

  function handleList(url: URL, res: http.ServerResponse): void {
    const folderId = url.searchParams.get('folderId')
    const relPath = url.searchParams.get('path') || ''
    const requesterId = url.searchParams.get('requesterId') || ''
    const cfg = getConfig()

    if (!folderId) {
      const roots = cfg.sharedFolders
        .filter((f) => permissionFor(cfg, requesterId, f.id)?.allowBrowse)
        .map((f) => ({ id: f.id, name: f.name, path: '', isDir: true, isRoot: true, size: 0 }))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(roots))
      return
    }

    const folder = cfg.sharedFolders.find((f) => f.id === folderId)
    if (!folder || !permissionFor(cfg, requesterId, folderId || '')?.allowBrowse) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    const target = safeResolve(folder.path, relPath)
    const dirents = fs.readdirSync(target, { withFileTypes: true })
    const list = dirents
      .filter((e) => !e.name.startsWith('.'))
      .map((e) => {
        const entryRel = relPath ? `${relPath}/${e.name}` : e.name
        const full = path.join(target, e.name)
        let size = 0
        try {
          size = e.isFile() ? fs.statSync(full).size : 0
        } catch {
          size = 0
        }
        return { name: e.name, path: entryRel, isDir: e.isDirectory(), size }
      })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(list))
  }

  function handleTargets(url: URL, res: http.ServerResponse): void {
    const requesterId = url.searchParams.get('requesterId') || ''
    const cfg = getConfig()
    const targets = cfg.sharedFolders
      .filter((f) => permissionFor(cfg, requesterId, f.id)?.allowUpload)
      .map((f) => ({ id: f.id, name: f.name }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(targets))
  }

  function handleDownload(url: URL, res: http.ServerResponse): void {
    const folderId = url.searchParams.get('folderId')
    const relPath = url.searchParams.get('path') || ''
    const requesterId = url.searchParams.get('requesterId') || ''
    const cfg = getConfig()
    const folder = cfg.sharedFolders.find((f) => f.id === folderId)
    if (!folder || !permissionFor(cfg, requesterId, folderId || '')?.allowBrowse) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    const target = safeResolve(folder.path, relPath)
    const stat = fs.statSync(target)
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'X-File-Name': encodeURIComponent(path.basename(target))
    })
    fs.createReadStream(target).pipe(res)
  }

  function handleHistoryDelete(url: URL, res: http.ServerResponse, events: ServerEvents): void {
    const transferId = url.searchParams.get('transferId')
    if (transferId) events.onHistoryDeleteRequest?.(transferId)
    res.writeHead(200)
    res.end('ok')
  }

  function handleUpload(
    url: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    events: ServerEvents
  ): void {
    const folderId = url.searchParams.get('folderId')
    const relPath = url.searchParams.get('path') || ''
    const fileName = decodeURIComponent(url.searchParams.get('fileName') || 'file')
    const transferId = url.searchParams.get('transferId') || ''
    const requesterId = url.searchParams.get('requesterId') || ''
    const totalBytes = Number(req.headers['content-length'] || 0)
    const cfg = getConfig()
    const folder = cfg.sharedFolders.find((f) => f.id === folderId)
    if (!folder || !permissionFor(cfg, requesterId, folderId || '')?.allowUpload) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    let destDir: string
    let destFile: string
    try {
      destDir = safeResolve(folder.path, relPath)
      ensureDir(destDir)
      destFile = safeResolve(destDir, path.basename(fileName))
    } catch (err) {
      res.writeHead(400)
      res.end(err instanceof Error ? err.message : 'bad path')
      return
    }
    const writeStream = fs.createWriteStream(destFile)
    const remoteAddress = req.socket.remoteAddress || ''
    if (transferId) {
      activeIncoming.set(transferId, { req, writeStream, onIncomingProgress: events.onIncomingProgress, fileName, totalBytes, remoteAddress })
    }
    let bytesTransferred = 0
    req.on('data', (chunk: Buffer) => {
      bytesTransferred += chunk.length
      events.onIncomingProgress?.({
        direction: 'up',
        id: transferId || destFile,
        fileName,
        bytesTransferred,
        totalBytes,
        remoteAddress
      })
    })
    req.pipe(writeStream)
    writeStream.on('finish', () => {
      activeIncoming.delete(transferId)
      res.writeHead(200)
      res.end('ok')
      events.onIncomingDone?.({
        transferId,
        fileName: path.basename(destFile),
        filePath: destFile,
        size: totalBytes,
        remoteAddress: req.socket.remoteAddress || ''
      })
    })
    writeStream.on('error', (err) => {
      if (!activeIncoming.has(transferId)) return // already handled by cancelIncomingTransfer
      activeIncoming.delete(transferId)
      if (!res.headersSent) {
        res.writeHead(500)
        res.end(err.message)
      }
    })
  }

  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({ port, close: () => server.close() })
    })
  })
}
