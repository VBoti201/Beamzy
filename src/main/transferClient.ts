import http from 'http'
import fs from 'fs'
import path from 'path'
import { buildLanAuthHeaders } from './lanAuth'

export interface TransferProgress {
  transferId: string
  fileName: string
  bytesTransferred: number
  totalBytes: number
  direction: 'push' | 'pull'
  done?: boolean
  error?: string
  peerId?: string
}

type ProgressCb = (p: TransferProgress) => void

interface ActivePull {
  res: http.IncomingMessage
  writeStream: fs.WriteStream
  reject: (e: Error) => void
  onProgress: ProgressCb
  fileName: string
  totalBytes: number
}

const activePulls = new Map<string, ActivePull>()

// Only pulls (downloads) are cancellable — that's the direction a user can
// actually be staring at and want to stop; a push already has the source
// file safely on this device regardless.
export function cancelLanTransfer(transferId: string): boolean {
  const active = activePulls.get(transferId)
  if (!active) return false
  activePulls.delete(transferId)
  active.res.destroy()
  active.writeStream.destroy()
  active.onProgress({
    transferId,
    fileName: active.fileName,
    bytesTransferred: 0,
    totalBytes: active.totalBytes,
    direction: 'pull',
    error: 'Cancelled'
  })
  active.reject(new Error('Cancelled'))
  return true
}

// fs.mkdirSync(dir, { recursive: true }) throws EPERM (not EEXIST) on Windows
// when `dir` is a drive root like "D:\" that already exists — only create it
// when it's actually missing.
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function pushFile(
  host: string,
  port: number,
  folderId: string,
  destRelPath: string,
  localFilePath: string,
  transferId: string,
  requesterId: string,
  secret: string,
  onProgress: ProgressCb
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(localFilePath)
    const baseName = path.basename(localFilePath)
    const qs = `folderId=${encodeURIComponent(folderId)}&path=${encodeURIComponent(destRelPath)}&fileName=${encodeURIComponent(baseName)}&transferId=${encodeURIComponent(transferId)}`
    const reqPath = `/api/upload?${qs}`
    const req = http.request(
      {
        host,
        port,
        path: reqPath,
        method: 'POST',
        headers: {
          'Content-Length': stat.size,
          'Content-Type': 'application/octet-stream',
          ...buildLanAuthHeaders(requesterId, secret, 'POST', '/api/upload')
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Upload failed: ${res.statusCode}`))
          return
        }
        res.on('data', () => {})
        res.on('end', () => {
          onProgress({ transferId, fileName: baseName, bytesTransferred: stat.size, totalBytes: stat.size, direction: 'push', done: true })
          resolve()
        })
      }
    )
    req.on('error', (err) => {
      onProgress({ transferId, fileName: baseName, bytesTransferred: 0, totalBytes: stat.size, direction: 'push', error: err.message })
      reject(err)
    })
    const readStream = fs.createReadStream(localFilePath)
    let bytesTransferred = 0
    readStream.on('data', (chunk: string | Buffer) => {
      bytesTransferred += chunk.length
      onProgress({ transferId, fileName: baseName, bytesTransferred, totalBytes: stat.size, direction: 'push' })
    })
    readStream.pipe(req)
  })
}

export function pullFile(
  host: string,
  port: number,
  folderId: string,
  remoteRelPath: string,
  destDirPath: string,
  transferId: string,
  requesterId: string,
  secret: string,
  onProgress: ProgressCb
): Promise<{ fileName: string; destFile: string; size: number }> {
  return new Promise((resolve, reject) => {
    const qs = `folderId=${encodeURIComponent(folderId)}&path=${encodeURIComponent(remoteRelPath)}`
    http
      .get(
        {
          host,
          port,
          path: `/api/download?${qs}`,
          headers: buildLanAuthHeaders(requesterId, secret, 'GET', '/api/download')
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: ${res.statusCode}`))
            return
          }
          const totalBytes = Number(res.headers['content-length'] || 0)
          const fileNameHeader = res.headers['x-file-name'] as string | undefined
          const fileName = fileNameHeader ? decodeURIComponent(fileNameHeader) : path.basename(remoteRelPath)
          ensureDir(destDirPath)
          const destFile = path.join(destDirPath, fileName)
          const writeStream = fs.createWriteStream(destFile)
          activePulls.set(transferId, { res, writeStream, reject, onProgress, fileName, totalBytes })
          let bytesTransferred = 0
          res.on('data', (chunk: Buffer) => {
            bytesTransferred += chunk.length
            onProgress({ transferId, fileName, bytesTransferred, totalBytes, direction: 'pull' })
          })
          res.pipe(writeStream)
          writeStream.on('finish', () => {
            activePulls.delete(transferId)
            onProgress({ transferId, fileName, bytesTransferred: totalBytes, totalBytes, direction: 'pull', done: true })
            resolve({ fileName, destFile, size: totalBytes })
          })
          writeStream.on('error', (err) => {
            if (!activePulls.has(transferId)) return // already handled by cancelLanTransfer
            activePulls.delete(transferId)
            onProgress({ transferId, fileName, bytesTransferred, totalBytes, direction: 'pull', error: err.message })
            reject(err)
          })
        }
      )
      .on('error', reject)
  })
}

export function notifyHistoryDelete(host: string, port: number, transferId: string, requesterId: string, secret: string): void {
  // Best-effort — the peer may be offline right now, in which case there's
  // nothing more to do than let this fail silently.
  const reqPath = `/api/history-delete?transferId=${encodeURIComponent(transferId)}`
  const req = http.request({
    host,
    port,
    path: reqPath,
    method: 'POST',
    headers: buildLanAuthHeaders(requesterId, secret, 'POST', '/api/history-delete')
  })
  req.on('error', () => {})
  req.end()
}

// Fire-and-forget handoff of the secret we want a peer to use when
// verifying our future requests (see lanTrust.ts/lanAuth.ts) — deliberately
// unauthenticated on the receiving end since it's the trust bootstrap
// itself, not something layered on top of existing trust. Resolves once
// the attempt is done either way so a caller pairing for the first time
// can wait for it before immediately following up with a signed request.
export function sendLanPair(host: string, port: number, deviceId: string, secret: string): Promise<void> {
  return new Promise((resolve) => {
    const req = http.request(
      { host, port, path: '/api/lan-pair', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      () => resolve()
    )
    req.on('error', () => resolve())
    req.end(JSON.stringify({ deviceId, secret }))
  })
}

export function fetchJson<T>(host: string, port: number, pathAndQuery: string, headers?: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    http
      .get({ host, port, path: pathAndQuery, headers }, (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      })
      .on('error', reject)
  })
}
