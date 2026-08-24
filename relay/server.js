// Minimal relay for Beamzy remote transfers.
//
// A "pairId" is a short random code shared between exactly your own devices
// (you copy it from one device's Settings into the other's). The relay only
// ever forwards messages between sockets that presented the same pairId —
// it never inspects file contents, it just pipes JSON frames between two of
// your own devices. Deploy this anywhere reachable over the internet (a
// small VPS, Render, Railway, Fly.io, ...) and point both Beamzy apps at
// its wss:// URL.
//
// Because the pairing code is short (easy to type by hand) rather than a
// long UUID, this file also rate-limits new connection attempts per IP —
// see `connectionAttempts` below — to keep brute-forcing a room impractical.
//
// Trust model: the FIRST device to ever connect with a given pairId
// bootstraps that room and is auto-admitted (there's no one else to ask).
// Every device after that is held pending and announced to the
// already-connected member(s), who must explicitly approve or reject it
// before it can see peers or exchange files — typing the right code alone
// isn't enough. Once approved, a deviceId is remembered for the room and
// reconnects freely without being re-prompted, until an admitted device
// kicks it.

const http = require('http')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { WebSocketServer } = require('ws')

const UPDATE_FEED_HOST = 'https://swiftsend-1.onrender.com'
const COUNTS_FILE = path.join(__dirname, 'download-counts.json')

// Best-effort landing-page download counter. In-memory, persisted to a
// local file so a plain process restart doesn't lose it — a full redeploy
// still resets it (Render's disk isn't durable across those), same
// trade-off already accepted for `approvedDevices` below. Not meant to be
// exact, just a rough "people have actually grabbed this" number.
let downloadCounts = { mac: 0, win: 0 }
try {
  downloadCounts = { ...downloadCounts, ...JSON.parse(fs.readFileSync(COUNTS_FILE, 'utf8')) }
} catch {
  // no file yet, or unreadable — start from zero
}
function saveCounts() {
  try {
    fs.writeFileSync(COUNTS_FILE, JSON.stringify(downloadCounts))
  } catch {
    // best-effort only
  }
}

// The landing page links here instead of a versioned filename directly, so
// it never needs manual updating after a release — this always resolves
// whatever the update feed currently says is latest.
async function resolveDownloadUrl(platform) {
  const feedUrl = platform === 'mac' ? `${UPDATE_FEED_HOST}/latest-mac.yml` : `${UPDATE_FEED_HOST}/latest.yml`
  const res = await fetch(feedUrl)
  if (!res.ok) throw new Error(`update feed returned ${res.status}`)
  const yml = await res.text()
  const name =
    platform === 'mac'
      ? (yml.match(/url:\s*(.+\.dmg)\s*$/m) || yml.match(/^path:\s*(.+)$/m) || [])[1]
      : (yml.match(/^path:\s*(.+)$/m) || [])[1]
  if (!name) throw new Error('could not find a download in the update feed')
  return `${UPDATE_FEED_HOST}/${encodeURIComponent(name.trim())}`
}

const PORT = process.env.PORT || 8787
const MAX_PAYLOAD = 2 * 1024 * 1024 // 2MB per frame (chunks are sent as ~256KB base64)
const MIN_PAIR_ID_LENGTH = 5 // e.g. "AB3-K9Q" without the dash is 6 chars
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 20 // new connection attempts per IP per window
const PAIRING_REQUEST_TIMEOUT_MS = 60 * 1000

// pairId -> Map<deviceId, { ws, name, platform }> — currently-connected,
// admitted members only.
const rooms = new Map()

// pairId -> Set<deviceId> ever approved for this room. Kept separate from
// `rooms` so approval survives a lone device disconnecting/reconnecting.
const approvedDevices = new Map()

// pairId -> Map<requestId, { deviceId, name, platform, ws, timer }>
const pendingJoins = new Map()

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

function pendingJoinsFor(pairId) {
  let m = pendingJoins.get(pairId)
  if (!m) {
    m = new Map()
    pendingJoins.set(pairId, m)
  }
  return m
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

function admitDevice(pairId, deviceId, info) {
  const room = roomFor(pairId)
  room.set(deviceId, info)
  send(info.ws, { type: 'pairing-admitted' })
  broadcastPresence(pairId)

  info.ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (msg.type === 'relay' && typeof msg.to === 'string') {
      const target = room.get(msg.to)
      if (!target) {
        send(info.ws, { type: 'error', message: `peer ${msg.to} is not online` })
        return
      }
      send(target.ws, { type: 'relay', from: deviceId, payload: msg.payload })
      return
    }
    if (msg.type === 'pairing-approve' && typeof msg.requestId === 'string') {
      approvePending(pairId, msg.requestId)
      return
    }
    if (msg.type === 'pairing-reject' && typeof msg.requestId === 'string') {
      rejectPending(pairId, msg.requestId, 'Rejected by another device')
      return
    }
    if (msg.type === 'kick' && typeof msg.deviceId === 'string') {
      kickDevice(pairId, msg.deviceId)
      return
    }
  })

  info.ws.on('close', () => {
    room.delete(deviceId)
    if (room.size === 0) rooms.delete(pairId)
    else broadcastPresence(pairId)
  })
}

function approvePending(pairId, requestId) {
  const pending = pendingJoins.get(pairId)
  const entry = pending && pending.get(requestId)
  if (!entry) return
  clearTimeout(entry.timer)
  pending.delete(requestId)
  let approved = approvedDevices.get(pairId)
  if (!approved) {
    approved = new Set()
    approvedDevices.set(pairId, approved)
  }
  approved.add(entry.deviceId)
  admitDevice(pairId, entry.deviceId, { ws: entry.ws, name: entry.name, platform: entry.platform })
}

function rejectPending(pairId, requestId, reason) {
  const pending = pendingJoins.get(pairId)
  const entry = pending && pending.get(requestId)
  if (!entry) return
  clearTimeout(entry.timer)
  pending.delete(requestId)
  send(entry.ws, { type: 'pairing-rejected', message: reason })
  entry.ws.close(4009, reason)
}

function kickDevice(pairId, deviceId) {
  const approved = approvedDevices.get(pairId)
  if (approved) approved.delete(deviceId)
  const room = rooms.get(pairId)
  const info = room && room.get(deviceId)
  if (!info) return
  send(info.ws, { type: 'kicked' })
  room.delete(deviceId)
  if (room.size === 0) rooms.delete(pairId)
  else broadcastPresence(pairId)
  info.ws.close(4010, 'removed by another device')
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/check-pair') {
    // Lets a client avoid picking a pairing code that another, unrelated
    // pair of devices happens to be actively using right now. Not a full
    // uniqueness guarantee (a code only "exists" here while someone is
    // connected with it), but cuts the collision odds further for a code
    // that's about to be generated/shown to a user.
    const code = (url.searchParams.get('code') || '').toUpperCase()
    const room = rooms.get(code)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ inUse: !!room && room.size > 0 }))
    return
  }
  if (url.pathname === '/downloads/count') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ ...downloadCounts, total: downloadCounts.mac + downloadCounts.win }))
    return
  }
  if (url.pathname === '/downloads/mac' || url.pathname === '/downloads/win') {
    const platform = url.pathname === '/downloads/mac' ? 'mac' : 'win'
    downloadCounts[platform] += 1
    saveCounts()
    try {
      const target = await resolveDownloadUrl(platform)
      res.writeHead(302, { Location: target })
      res.end()
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'text/plain' })
      res.end(`Could not resolve the latest download right now: ${err.message}`)
    }
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Beamzy relay OK\n')
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

  const approved = approvedDevices.get(pairId)

  if (!approved) {
    // Nobody has ever paired on this code — this device bootstraps the
    // room, nothing to approve against.
    approvedDevices.set(pairId, new Set([deviceId]))
    admitDevice(pairId, deviceId, { ws, name, platform })
    return
  }

  if (approved.has(deviceId)) {
    admitDevice(pairId, deviceId, { ws, name, platform })
    return
  }

  const room = rooms.get(pairId)
  if (!room || room.size === 0) {
    // A previously-approved device set exists but nobody is online right
    // now to approve a new one — admit it rather than permanently locking
    // the pair out of their own room while every admitted device happens
    // to be offline at once.
    approved.add(deviceId)
    admitDevice(pairId, deviceId, { ws, name, platform })
    return
  }

  const requestId = randomUUID()
  const pending = pendingJoinsFor(pairId)
  const timer = setTimeout(() => {
    pending.delete(requestId)
    send(ws, { type: 'pairing-timeout' })
    ws.close(4008, 'pairing request timed out')
  }, PAIRING_REQUEST_TIMEOUT_MS)
  pending.set(requestId, { deviceId, name, platform, ws, timer })

  for (const info of room.values()) {
    send(info.ws, { type: 'pairing-request', requestId, deviceId, name, platform })
  }
  send(ws, { type: 'pairing-pending' })

  ws.on('close', () => {
    const p = pendingJoins.get(pairId)
    const entry = p && p.get(requestId)
    if (entry) {
      clearTimeout(entry.timer)
      p.delete(requestId)
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`Beamzy relay listening on :${PORT}`)
})
