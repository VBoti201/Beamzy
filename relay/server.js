// Minimal relay for Beamzy remote transfers.
//
// Every device keeps ONE permanent "code" (e.g. "2CC-NSW") as its identity —
// it never changes, by design, so a blocked device can't dodge a ban just by
// asking for a new one. To connect two devices, one types the other's code into
// "Connect to a device" and sends a request; the target has to approve it
// before either side can see the other or exchange files. Once approved,
// the link is remembered and both devices reconnect straight back into it
// without re-approving, until one of them removes the other (or an abuse
// report gets a code blocked — see /admin/block below).
//
// The relay only ever forwards JSON frames between two approved, currently-
// connected devices — it never inspects file contents, just pipes bytes.
// Deploy this anywhere reachable over the internet (a small VPS, Render,
// Railway, Fly.io, ...) and point both Beamzy apps at its wss:// URL.
//
// Because a code is short (easy to type by hand) rather than a long UUID,
// this file also rate-limits new connection attempts per IP — see
// `connectionAttempts` below — to keep brute-forcing someone else's code
// impractical.

const http = require('http')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { WebSocketServer } = require('ws')

const UPDATE_FEED_HOST = 'https://swiftsend-1.onrender.com'
const COUNTS_FILE = path.join(__dirname, 'download-counts.json')

// Best-effort landing-page download counter. In-memory, persisted to a
// local file so a plain process restart doesn't lose it — a full redeploy
// still resets it (Render's disk isn't durable across those). Not meant to
// be exact, just a rough "people have actually grabbed this" number.
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
const MIN_CODE_LENGTH = 5 // e.g. "AB3-K9Q" without the dash is 6 chars
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_ATTEMPTS = 20 // new connection attempts per IP per window
const PAIRING_REQUEST_TIMEOUT_MS = 60 * 1000

const BLOCKED_CODES_FILE = path.join(__dirname, 'blocked-pairids.json')
const BLOCKED_DEVICES_FILE = path.join(__dirname, 'blocked-device-ids.json')
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''

// Lets the operator cut off a specific device (e.g. after an abuse report)
// without touching anyone else's links or restarting the process.
// Persisted so a plain restart doesn't quietly un-block something. Blocking
// also captures the device's current internal id (if it's online at block
// time) so regenerating its code afterward doesn't undo the block.
let blockedCodes = new Set()
let blockedDeviceIds = new Set()
try {
  blockedCodes = new Set(JSON.parse(fs.readFileSync(BLOCKED_CODES_FILE, 'utf8')))
} catch {
  // no file yet, or unreadable — start with nothing blocked
}
try {
  blockedDeviceIds = new Set(JSON.parse(fs.readFileSync(BLOCKED_DEVICES_FILE, 'utf8')))
} catch {
  // no file yet, or unreadable
}
function saveBlockedCodes() {
  try {
    fs.writeFileSync(BLOCKED_CODES_FILE, JSON.stringify([...blockedCodes]))
  } catch {
    // best-effort only
  }
}
function saveBlockedDevices() {
  try {
    fs.writeFileSync(BLOCKED_DEVICES_FILE, JSON.stringify([...blockedDeviceIds]))
  } catch {
    // best-effort only
  }
}
function isAuthorized(req) {
  if (!ADMIN_TOKEN) return false // fail closed if no token is configured
  return req.headers.authorization === `Bearer ${ADMIN_TOKEN}`
}

// deviceId -> { ws, code, name, platform } — currently-connected devices,
// keyed by their stable internal id (never changes, unlike their code).
const onlineDevices = new Map()

// code -> deviceId — who currently holds a given code, so a connect
// request can find its target. Purely a discovery index; regenerating a
// code just moves this entry, it doesn't affect approvedLinks below.
const onlineByCode = new Map()

// deviceId -> Set<deviceId> — mutual, persistent-until-unlinked approval
// graph. In-memory only: a relay redeploy resets it, same trade-off this
// relay has always made (already-paired devices get a one-time
// re-approval prompt after a redeploy).
const approvedLinks = new Map()

// requestId -> { fromDeviceId, fromCorrelationId, toDeviceId, name, platform, timer }
const pendingConnects = new Map()

// ip -> timestamps[] of recent connection attempts
const connectionAttempts = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const attempts = (connectionAttempts.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  attempts.push(now)
  connectionAttempts.set(ip, attempts)
  return attempts.length > RATE_LIMIT_MAX_ATTEMPTS
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj))
  }
}

function linksFor(deviceId) {
  let links = approvedLinks.get(deviceId)
  if (!links) {
    links = new Set()
    approvedLinks.set(deviceId, links)
  }
  return links
}

function presencePeersFor(deviceId) {
  const links = approvedLinks.get(deviceId)
  if (!links) return []
  const peers = []
  for (const peerId of links) {
    const online = onlineDevices.get(peerId)
    if (online) peers.push({ deviceId: peerId, name: online.name, platform: online.platform })
  }
  return peers
}

function sendPresence(deviceId) {
  const online = onlineDevices.get(deviceId)
  if (online) send(online.ws, { type: 'presence', peers: presencePeersFor(deviceId) })
}

// Refreshes this device's own peer list, and everyone else's who has an
// approved link to it — call whenever a device's online status or link
// set changes.
function refreshPresenceForLinks(deviceId) {
  sendPresence(deviceId)
  const links = approvedLinks.get(deviceId)
  if (links) for (const peerId of links) sendPresence(peerId)
}

function addMutualLink(a, b) {
  linksFor(a).add(b)
  linksFor(b).add(a)
}

function removeMutualLink(a, b) {
  approvedLinks.get(a)?.delete(b)
  approvedLinks.get(b)?.delete(a)
}

function clearPendingInvolving(deviceId) {
  for (const [requestId, entry] of pendingConnects) {
    if (entry.fromDeviceId !== deviceId && entry.toDeviceId !== deviceId) continue
    clearTimeout(entry.timer)
    pendingConnects.delete(requestId)
    // Tell whichever side didn't just disconnect that this attempt is dead,
    // rather than leaving them hanging until the timeout fires.
    if (entry.fromDeviceId !== deviceId) {
      const requester = onlineDevices.get(entry.fromDeviceId)
      if (requester) send(requester.ws, { type: 'pairing-timeout', correlationId: entry.fromCorrelationId })
    }
  }
}

function handleConnectRequest(fromDeviceId, targetCode, correlationId) {
  const fromInfo = onlineDevices.get(fromDeviceId)
  if (!fromInfo) return
  const code = (targetCode || '').toUpperCase()

  if (code === fromInfo.code) {
    send(fromInfo.ws, { type: 'error', correlationId, message: "That's your own code" })
    return
  }

  const toDeviceId = onlineByCode.get(code)
  if (!toDeviceId) {
    send(fromInfo.ws, { type: 'error', correlationId, message: 'That device is not online right now' })
    return
  }

  if (approvedLinks.get(fromDeviceId)?.has(toDeviceId)) {
    // Already linked — nothing to approve, just make sure both sides see
    // each other (covers the case where a link existed from before either
    // device's most recent reconnect).
    refreshPresenceForLinks(fromDeviceId)
    send(fromInfo.ws, { type: 'pairing-admitted', correlationId })
    return
  }

  const toInfo = onlineDevices.get(toDeviceId)
  const requestId = randomUUID()
  const timer = setTimeout(() => {
    pendingConnects.delete(requestId)
    send(fromInfo.ws, { type: 'pairing-timeout', correlationId })
  }, PAIRING_REQUEST_TIMEOUT_MS)
  pendingConnects.set(requestId, {
    fromDeviceId,
    fromCorrelationId: correlationId,
    toDeviceId,
    name: fromInfo.name,
    platform: fromInfo.platform,
    timer
  })
  send(toInfo.ws, { type: 'pairing-request', requestId, deviceId: fromDeviceId, name: fromInfo.name, platform: fromInfo.platform })
  send(fromInfo.ws, { type: 'pairing-pending', correlationId })
}

// approverDeviceId must be the actual target of the request — otherwise
// any connected device could approve/reject a request it merely knows the
// (random) requestId of, without ever being the one asked.
function approvePending(requestId, approverDeviceId) {
  const entry = pendingConnects.get(requestId)
  if (!entry || entry.toDeviceId !== approverDeviceId) return
  clearTimeout(entry.timer)
  pendingConnects.delete(requestId)
  addMutualLink(entry.fromDeviceId, entry.toDeviceId)
  const requester = onlineDevices.get(entry.fromDeviceId)
  if (requester) send(requester.ws, { type: 'pairing-admitted', correlationId: entry.fromCorrelationId })
  refreshPresenceForLinks(entry.fromDeviceId)
  refreshPresenceForLinks(entry.toDeviceId)
}

function rejectPending(requestId, approverDeviceId, reason) {
  const entry = pendingConnects.get(requestId)
  if (!entry || entry.toDeviceId !== approverDeviceId) return
  clearTimeout(entry.timer)
  pendingConnects.delete(requestId)
  const requester = onlineDevices.get(entry.fromDeviceId)
  if (requester) send(requester.ws, { type: 'pairing-rejected', correlationId: entry.fromCorrelationId, message: reason })
}

function unlinkDevice(fromDeviceId, targetDeviceId) {
  removeMutualLink(fromDeviceId, targetDeviceId)
  const target = onlineDevices.get(targetDeviceId)
  if (target) send(target.ws, { type: 'kicked' })
  refreshPresenceForLinks(fromDeviceId)
  refreshPresenceForLinks(targetDeviceId)
}

function disconnectDevice(deviceId, code, closeCode, reason) {
  const info = onlineDevices.get(deviceId)
  onlineDevices.delete(deviceId)
  if (onlineByCode.get(code) === deviceId) onlineByCode.delete(code)
  clearPendingInvolving(deviceId)
  if (info) info.ws.close(closeCode, reason)
  refreshPresenceForLinks(deviceId)
}

// Cuts a code off from the relay entirely: if it's online right now, also
// blocks its underlying device id (so regenerating the code afterward
// doesn't quietly undo the block) and severs every approved link it has.
function blockCode(code) {
  blockedCodes.add(code)
  saveBlockedCodes()
  const deviceId = onlineByCode.get(code)
  if (!deviceId) return
  blockedDeviceIds.add(deviceId)
  saveBlockedDevices()
  const links = [...(approvedLinks.get(deviceId) || [])]
  for (const peerId of links) removeMutualLink(deviceId, peerId)
  for (const peerId of links) {
    const peer = onlineDevices.get(peerId)
    if (peer) send(peer.ws, { type: 'kicked' })
  }
  approvedLinks.delete(deviceId)
  disconnectDevice(deviceId, code, 4013, 'this code has been blocked')
}

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/check-pair') {
    // Lets a client avoid generating a code that's already someone else's
    // current identity on the relay.
    const code = (url.searchParams.get('code') || '').toUpperCase()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ inUse: onlineByCode.has(code) }))
    return
  }
  if (url.pathname === '/admin/block' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      res.writeHead(401)
      res.end('unauthorized')
      return
    }
    const code = (url.searchParams.get('pairId') || url.searchParams.get('code') || '').toUpperCase()
    if (!code) {
      res.writeHead(400)
      res.end('missing code')
      return
    }
    blockCode(code)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ blocked: code }))
    return
  }
  if (url.pathname === '/admin/unblock' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      res.writeHead(401)
      res.end('unauthorized')
      return
    }
    const code = (url.searchParams.get('pairId') || url.searchParams.get('code') || '').toUpperCase()
    blockedCodes.delete(code)
    saveBlockedCodes()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ unblocked: code }))
    return
  }
  if (url.pathname === '/admin/blocked' && req.method === 'GET') {
    if (!isAuthorized(req)) {
      res.writeHead(401)
      res.end('unauthorized')
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ codes: [...blockedCodes], deviceIds: [...blockedDeviceIds] }))
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
  const code = (url.searchParams.get('code') || '').toUpperCase()
  const deviceId = url.searchParams.get('deviceId')
  const name = url.searchParams.get('name') || 'Unknown device'
  const platform = url.searchParams.get('platform') || ''

  if (!code || code.length < MIN_CODE_LENGTH || !deviceId) {
    ws.close(4000, 'missing or weak code/deviceId')
    return
  }

  if (blockedCodes.has(code) || blockedDeviceIds.has(deviceId)) {
    ws.close(4013, 'this code has been blocked')
    return
  }

  const existingHolder = onlineByCode.get(code)
  if (existingHolder && existingHolder !== deviceId) {
    ws.close(4001, 'that code is currently in use by another device')
    return
  }

  onlineDevices.set(deviceId, { ws, code, name, platform })
  onlineByCode.set(code, deviceId)
  send(ws, { type: 'pairing-admitted' })
  refreshPresenceForLinks(deviceId)

  ws.on('message', (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    if (msg.type === 'relay' && typeof msg.to === 'string') {
      // onlineDevices is global, not scoped to a room like the old model —
      // without this check any connected device could target any other by
      // deviceId regardless of whether either side ever approved a link.
      if (!approvedLinks.get(deviceId)?.has(msg.to)) {
        send(ws, { type: 'error', message: `peer ${msg.to} is not online` })
        return
      }
      const target = onlineDevices.get(msg.to)
      if (!target) {
        send(ws, { type: 'error', message: `peer ${msg.to} is not online` })
        return
      }
      send(target.ws, { type: 'relay', from: deviceId, payload: msg.payload })
      return
    }
    if (msg.type === 'connect' && typeof msg.targetCode === 'string') {
      handleConnectRequest(deviceId, msg.targetCode, msg.correlationId)
      return
    }
    if (msg.type === 'pairing-approve' && typeof msg.requestId === 'string') {
      approvePending(msg.requestId, deviceId)
      return
    }
    if (msg.type === 'pairing-reject' && typeof msg.requestId === 'string') {
      rejectPending(msg.requestId, deviceId, 'Rejected by the other device')
      return
    }
    if (msg.type === 'kick' && typeof msg.deviceId === 'string') {
      unlinkDevice(deviceId, msg.deviceId)
      return
    }
  })

  ws.on('close', () => {
    if (onlineDevices.get(deviceId)?.ws !== ws) return // superseded by a newer connection for this device
    onlineDevices.delete(deviceId)
    if (onlineByCode.get(code) === deviceId) onlineByCode.delete(code)
    clearPendingInvolving(deviceId)
    refreshPresenceForLinks(deviceId)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Beamzy relay listening on :${PORT}`)
})
