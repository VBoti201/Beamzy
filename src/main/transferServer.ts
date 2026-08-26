import http from 'http'
import fs from 'fs'
import path from 'path'
import { getConfig, effectivePermission } from './config'
import { isLanDeviceApproved, getIncomingSecret, bindIncomingSecret } from './lanTrust'
import { verifyLanAuth } from './lanAuth'

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

// Denies outright unless requesterId is both present and an explicitly
// approved LAN device — a missing/unrecognized/unapproved requesterId used
// to silently fall back to the folder's own (often wide-open) default,
// which meant any unauthenticated client on the network could hit these
// endpoints directly without ever going through the pairing-approval modal.
// isLanDeviceApproved is the actual gate; effectivePermission only resolves
// *which* permissions an already-approved device has. requesterId here is
// always the result of authenticate() below — never taken raw off the
// request — so it's already proven, not just asserted.
function permissionFor(
  cfg: ReturnType<typeof getConfig>,
  requesterId: string | null,
  folderId: string
): { allowBrowse: boolean; allowUpload: boolean; allowDownload: boolean } | null {
  if (!requesterId || !isLanDeviceApproved(requesterId)) return null
  return effectivePermission(cfg, requesterId, folderId)
}

// Verifies the request actually proves possession of the secret bound to
// the deviceId it claims — the claim alone (e.g. a requesterId query
// param) is worthless since deviceId is broadcast in cleartext over mDNS.
function authenticate(req: http.IncomingMessage, url: URL): string | null {
  return verifyLanAuth(req.headers, req.method || 'GET', url.pathname, getIncomingSecret)
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

      if (url.pathname === '/api/lan-pair' && req.method === 'POST') return handleLanPair(req, res)
      if (url.pathname === '/api/list' && req.method === 'GET') return handleList(url, req, res)
      if (url.pathname === '/api/targets' && req.method === 'GET') return handleTargets(url, req, res)
      if (url.pathname === '/api/download' && req.method === 'GET') return handleDownload(url, req, res)
      if (url.pathname === '/api/upload' && req.method === 'POST') return handleUpload(url, req, res, events)
      if (url.pathname === '/api/history-delete' && req.method === 'POST') return handleHistoryDelete(url, req, res, events)

      res.writeHead(404)
      res.end('not found')
    } catch (err) {
      res.writeHead(400)
      res.end(err instanceof Error ? err.message : 'error')
    }
  })

  function handleList(url: URL, req: http.IncomingMessage, res: http.ServerResponse): void {
    const folderId = url.searchParams.get('folderId')
    const relPath = url.searchParams.get('path') || ''
    const requesterId = authenticate(req, url)
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

  function handleTargets(url: URL, req: http.IncomingMessage, res: http.ServerResponse): void {
    const requesterId = authenticate(req, url)
    const cfg = getConfig()
    const targets = cfg.sharedFolders
      .filter((f) => permissionFor(cfg, requesterId, f.id)?.allowUpload)
      .map((f) => ({ id: f.id, name: f.name }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(targets))
  }

  function handleDownload(url: URL, req: http.IncomingMessage, res: http.ServerResponse): void {
    const folderId = url.searchParams.get('folderId')
    const relPath = url.searchParams.get('path') || ''
    const requesterId = authenticate(req, url)
    const cfg = getConfig()
    const folder = cfg.sharedFolders.find((f) => f.id === folderId)
    if (!folder || !permissionFor(cfg, requesterId, folderId || '')?.allowDownload) {
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

  function handleHistoryDelete(url: URL, req: http.IncomingMessage, res: http.ServerResponse, events: ServerEvents): void {
    const transferId = url.searchParams.get('transferId')
    const requesterId = authenticate(req, url)
    // This didn't check approval at all — any device on the network that
    // knew (or previously legitimately received) a transferId could delete
    // that history entry, and for a 'received' entry that means the actual
    // file on disk (see applyHistoryDelete in index.ts). Same class of gap
    // as the other endpoints, just not caught earlier since it doesn't
    // hand back file contents.
    if (!requesterId || !isLanDeviceApproved(requesterId)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    if (transferId) events.onHistoryDeleteRequest?.(transferId)
    res.writeHead(200)
    res.end('ok')
  }

  // Bootstraps trust: when a device approves a newly-discovered peer, it
  // generates a random secret and POSTs it here so the peer can verify
  // future requests claiming to be that device (see lanTrust.ts/lanAuth.ts).
  // Necessarily unauthenticated — it's the trust root, not something built
  // on top of one — so it's rate-limited per IP and the payload is capped
  // and format-checked to keep it from being useful as anything but a
  // legitimate 32-byte secret handoff.
  const lanPairAttempts = new Map<string, number[]>()
  const LAN_PAIR_WINDOW_MS = 60 * 1000
  const LAN_PAIR_MAX_ATTEMPTS = 20

  function lanPairRateLimited(ip: string): boolean {
    const now = Date.now()
    const attempts = (lanPairAttempts.get(ip) || []).filter((t) => now - t < LAN_PAIR_WINDOW_MS)
    attempts.push(now)
    lanPairAttempts.set(ip, attempts)
    return attempts.length > LAN_PAIR_MAX_ATTEMPTS
  }

  function handleLanPair(req: http.IncomingMessage, res: http.ServerResponse): void {
    const ip = req.socket.remoteAddress || ''
    if (lanPairRateLimited(ip)) {
      res.writeHead(429)
      res.end('rate limited')
      return
    }
    let body = ''
    let tooBig = false
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
      if (body.length > 2048) {
        tooBig = true
        req.destroy()
      }
    })
    req.on('end', () => {
      if (tooBig) return
      try {
        const payload = JSON.parse(body) as { deviceId?: unknown; secret?: unknown }
        const deviceId = String(payload.deviceId || '')
        const secret = String(payload.secret || '')
        // randomBytes(32).toString('base64') is always exactly this shape —
        // reject anything else outright rather than bind garbage as if it
        // were a real secret.
        if (!deviceId || !/^[A-Za-z0-9+/]{43}=$/.test(secret)) {
          res.writeHead(400)
          res.end('bad request')
          return
        }
        bindIncomingSecret(deviceId, secret)
        res.writeHead(200)
        res.end('ok')
      } catch {
        res.writeHead(400)
        res.end('bad request')
      }
    })
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
    const requesterId = authenticate(req, url)
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
      // A peer with genuine upload permission could still (bug or malice)
      // stream past what it declared in Content-Length — cut it off rather
      // than let it fill the disk unbounded, and drop the partial file
      // since it can never match what the sender's own transferId expects.
      if (totalBytes > 0 && bytesTransferred > totalBytes) {
        activeIncoming.delete(transferId)
        req.destroy()
        writeStream.destroy()
        fs.unlink(destFile, () => {})
        if (!res.headersSent) {
          res.writeHead(413)
          res.end('payload exceeded declared size')
        }
        return
      }
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
