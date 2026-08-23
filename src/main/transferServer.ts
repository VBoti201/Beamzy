import http from 'http'
import fs from 'fs'
import path from 'path'
import { getConfig } from './config'

export interface IncomingProgressEvent {
  direction: 'up'
  id: string
  fileName: string
  bytesTransferred: number
  totalBytes: number
}

interface ServerEvents {
  onIncomingProgress?: (e: IncomingProgressEvent) => void
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

export function startTransferServer(events: ServerEvents = {}): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '', 'http://localhost')
      res.setHeader('Access-Control-Allow-Origin', '*')

      if (url.pathname === '/api/list' && req.method === 'GET') return handleList(url, res)
      if (url.pathname === '/api/targets' && req.method === 'GET') return handleTargets(res)
      if (url.pathname === '/api/download' && req.method === 'GET') return handleDownload(url, res)
      if (url.pathname === '/api/upload' && req.method === 'POST') return handleUpload(url, req, res, events)

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
    const cfg = getConfig()

    if (!folderId) {
      const roots = cfg.sharedFolders
        .filter((f) => f.allowBrowse)
        .map((f) => ({ id: f.id, name: f.name, path: '', isDir: true, isRoot: true, size: 0 }))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(roots))
      return
    }

    const folder = cfg.sharedFolders.find((f) => f.id === folderId && f.allowBrowse)
    if (!folder) {
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

  function handleTargets(res: http.ServerResponse): void {
    const cfg = getConfig()
    const targets = cfg.sharedFolders.filter((f) => f.allowUpload).map((f) => ({ id: f.id, name: f.name }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(targets))
  }

  function handleDownload(url: URL, res: http.ServerResponse): void {
    const folderId = url.searchParams.get('folderId')
    const relPath = url.searchParams.get('path') || ''
    const cfg = getConfig()
    const folder = cfg.sharedFolders.find((f) => f.id === folderId && f.allowBrowse)
    if (!folder) {
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

  function handleUpload(
    url: URL,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    events: ServerEvents
  ): void {
    const folderId = url.searchParams.get('folderId')
    const relPath = url.searchParams.get('path') || ''
    const fileName = decodeURIComponent(url.searchParams.get('fileName') || 'file')
    const totalBytes = Number(req.headers['content-length'] || 0)
    const cfg = getConfig()
    const folder = cfg.sharedFolders.find((f) => f.id === folderId && f.allowUpload)
    if (!folder) {
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
    let bytesTransferred = 0
    req.on('data', (chunk: Buffer) => {
      bytesTransferred += chunk.length
      events.onIncomingProgress?.({ direction: 'up', id: destFile, fileName, bytesTransferred, totalBytes })
    })
    req.pipe(writeStream)
    writeStream.on('finish', () => {
      res.writeHead(200)
      res.end('ok')
    })
    writeStream.on('error', (err) => {
      res.writeHead(500)
      res.end(err.message)
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
