// Minimal relay for SwiftSend remote transfers.
//
// A "pairId" is a short random code shared between exactly your own devices
// (you copy it from one device's Settings into the other's). The relay only
// ever forwards messages between sockets that presented the same pairId —
// it never inspects file contents, it just pipes JSON frames between two of
// your own devices. Deploy this anywhere reachable over the internet (a
// small VPS, Render, Railway, Fly.io, ...) and point both SwiftSend apps at
// its wss:// URL.
//
// Because the pairing code is short (easy to type by hand) rather than a
// long UUID, this file also rate-limits new connection attempts per IP —
// see `connectionAttempts` below — to keep brute-forcing a room impractical.

const http = require('http')
const { WebSocketServer } = require('ws')

const PORT = process.env.PORT || 8787
const MAX_PAYLOAD = 2 * 1024 * 1024 // 2MB per frame (chunks are sent as ~256KB base64)
const MIN_PAIR_ID_LENGTH = 5 // e.g. "AB3-K9Q" without the dash is 6 chars
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 20 // new connection attempts per IP per window

// pairId -> Map<deviceId, { ws, name }>
const rooms = new Map()

// ip -> timestamps[] of recent connection attempts
const connectionAttempts = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const attempts = (connectionAttempts.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  attempts.push(now)
  connectionAttempts.set(ip, attempts)
  return attempts.length > RATE_LIMIT_MAX_ATTEMPTS
}

function roomFor(pairId) {
  let room = rooms.get(pairId)
  if (!room) {
    room = new Map()
    rooms.set(pairId, room)
  }
  return room
}

function broadcastPresence(pairId) {
  const room = rooms.get(pairId)
  if (!room) return
  const peers = Array.from(room.entries()).map(([deviceId, info]) => ({
    deviceId,
    name: info.name,
    platform: info.platform
  }))
  for (const [deviceId, info] of room.entries()) {
    const others = peers.filter((p) => p.deviceId !== deviceId)
    send(info.ws, { type: 'presence', peers: others })
  }
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj))
  }
}

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('SwiftSend relay OK\n')
})

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_PAYLOAD, path: '/ws' })

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown'
  if (isRateLimited(ip)) {
    ws.close(4029, 'too many connection attempts, slow down')
    return
  }

  const url = new URL(req.url, 'http://localhost')
  const pairId = url.searchParams.get('pairId')
  const deviceId = url.searchParams.get('deviceId')
  const name = url.searchParams.get('name') || 'Unknown device'
  const platform = url.searchParams.get('platform') || ''

  if (!pairId || pairId.length < MIN_PAIR_ID_LENGTH || !deviceId) {
    ws.close(4000, 'missing or weak pairId/deviceId')
    return
  }

  const room = roomFor(pairId)
  room.set(deviceId, { ws, name, platform })
  broadcastPresence(pairId)

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (msg.type !== 'relay' || typeof msg.to !== 'string') return
    const target = room.get(msg.to)
    if (!target) {
      send(ws, { type: 'error', message: `peer ${msg.to} is not online` })
      return
    }
    send(target.ws, { type: 'relay', from: deviceId, payload: msg.payload })
  })

  ws.on('close', () => {
    room.delete(deviceId)
    if (room.size === 0) rooms.delete(pairId)
    else broadcastPresence(pairId)
  })
})

httpServer.listen(PORT, () => {
  console.log(`SwiftSend relay listening on :${PORT}`)
})
