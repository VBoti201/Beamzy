import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

// Proves a LAN transfer-server request actually comes from the deviceId it
// claims to — without this, `requesterId` was just a string the caller
// typed into a query param, and deviceId itself is broadcast in cleartext
// over mDNS to every device on the network (see lanTrust.ts), so it was
// never secret enough to serve as a credential by itself. Every signed
// request proves possession of the secret bound to that id instead. This
// covers method+path+timestamp+nonce, not the request body — enough to
// close spoofed-identity requests, not a substitute for transport
// encryption against an on-path attacker tampering with an otherwise
// legitimate request in flight.
const ID_HEADER = 'x-beamzy-id'
const TS_HEADER = 'x-beamzy-ts'
const NONCE_HEADER = 'x-beamzy-nonce'
const SIG_HEADER = 'x-beamzy-sig'
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

export type LanAuthHeaders = Record<string, string>

function sign(secret: string, method: string, pathname: string, ts: string, nonce: string): string {
  return createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(`${method}\n${pathname}\n${ts}\n${nonce}`)
    .digest('base64')
}

export function buildLanAuthHeaders(deviceId: string, secret: string, method: string, pathname: string): LanAuthHeaders {
  const ts = String(Date.now())
  const nonce = randomBytes(12).toString('base64')
  return {
    [ID_HEADER]: deviceId,
    [TS_HEADER]: ts,
    [NONCE_HEADER]: nonce,
    [SIG_HEADER]: sign(secret, method, pathname, ts, nonce)
  }
}

// claimed deviceId -> nonce -> timestamp, so an intercepted request can't
// simply be resent verbatim within the timestamp window.
const seenNonces = new Map<string, number>()

function pruneNonces(now: number): void {
  for (const [key, ts] of seenNonces) {
    if (now - ts > MAX_CLOCK_SKEW_MS) seenNonces.delete(key)
  }
}

// Returns the authenticated deviceId on success, or null if the request
// doesn't carry a valid, fresh, unreplayed signature.
export function verifyLanAuth(
  headers: Record<string, string | string[] | undefined>,
  method: string,
  pathname: string,
  getSecret: (deviceId: string) => string | undefined
): string | null {
  const id = headers[ID_HEADER]
  const ts = headers[TS_HEADER]
  const nonce = headers[NONCE_HEADER]
  const sig = headers[SIG_HEADER]
  if (typeof id !== 'string' || typeof ts !== 'string' || typeof nonce !== 'string' || typeof sig !== 'string') return null
  const tsNum = Number(ts)
  const now = Date.now()
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > MAX_CLOCK_SKEW_MS) return null
  const secret = getSecret(id)
  if (!secret) return null
  let expectedBuf: Buffer
  let sigBuf: Buffer
  try {
    expectedBuf = Buffer.from(sign(secret, method, pathname, ts, nonce))
    sigBuf = Buffer.from(sig)
  } catch {
    return null
  }
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null
  pruneNonces(now)
  const nonceKey = `${id}:${nonce}`
  if (seenNonces.has(nonceKey)) return null
  seenNonces.set(nonceKey, now)
  return id
}
