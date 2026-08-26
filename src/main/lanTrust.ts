import Store from 'electron-store'
import { randomBytes } from 'crypto'

// Devices on the LAN don't need a pairing code — mDNS just finds them —
// but that also means anyone else on the same WiFi/router broadcasting the
// Beamzy discovery service would otherwise show up and be able to browse/upload
// with zero confirmation. `approved` tracks which discovered deviceIds have
// been explicitly accepted, independent of the relay's code-based trust.
//
// deviceId itself is broadcast in cleartext over mDNS, so it can never be
// used as a credential on its own — anyone on the LAN can read a target's
// deviceId and simply claim to be it. `incomingSecrets`/`outgoingSecrets`
// back every LAN HTTP request with an actual possession-proof (see
// lanAuth.ts): when we approve a peer we hand them a random secret
// (`outgoingSecrets`, keyed by their id) that we then sign our own requests
// to them with, and we separately remember whatever secret a peer hands us
// for themselves (`incomingSecrets`) to verify requests claiming to be them.
interface LanTrustState {
  approved: string[]
  incomingSecrets: Record<string, string>
  incomingSecretBoundAt: Record<string, number>
  outgoingSecrets: Record<string, string>
}

const store = new Store<LanTrustState>({
  name: 'lan-trust',
  defaults: { approved: [], incomingSecrets: {}, incomingSecretBoundAt: {}, outgoingSecrets: {} }
})

// How long an unclaimed (not-yet-approved) incoming secret binding may be
// overwritten by a different secret for the same deviceId. Bounds (without
// fully eliminating) the window in which a same-LAN attacker could squat a
// victim's deviceId — POSTing a bogus secret before the real device ever
// gets a chance to pair — since the real device's later attempt would
// otherwise be locked out forever. Once a device is actually approved, its
// bound secret is permanent and can only change via forgetLanDevice (an
// explicit user action), never by a later POST.
const PENDING_SECRET_TTL_MS = 10 * 60 * 1000

export function isLanDeviceApproved(deviceId: string): boolean {
  return store.get('approved').includes(deviceId)
}

export function getIncomingSecret(deviceId: string): string | undefined {
  return store.get('incomingSecrets')[deviceId]
}

export function bindIncomingSecret(deviceId: string, secret: string): boolean {
  const secrets = store.get('incomingSecrets')
  const boundAt = store.get('incomingSecretBoundAt')
  const existing = secrets[deviceId]
  if (existing && existing !== secret) {
    const stale = !isLanDeviceApproved(deviceId) && Date.now() - (boundAt[deviceId] || 0) > PENDING_SECRET_TTL_MS
    if (!stale) return false
  }
  store.set('incomingSecrets', { ...secrets, [deviceId]: secret })
  store.set('incomingSecretBoundAt', { ...boundAt, [deviceId]: Date.now() })
  return true
}

export function getOutgoingSecret(deviceId: string): string | undefined {
  return store.get('outgoingSecrets')[deviceId]
}

// Creates our secret for this peer the first time we need one (e.g. when
// approving them, or the first time we talk to them this session) and
// reuses it afterward — the peer needs a stable value to have bound.
export function ensureOutgoingSecret(deviceId: string): string {
  const existing = getOutgoingSecret(deviceId)
  if (existing) return existing
  const secret = randomBytes(32).toString('base64')
  store.set('outgoingSecrets', { ...store.get('outgoingSecrets'), [deviceId]: secret })
  return secret
}

export function approveLanDevice(deviceId: string): void {
  const approved = store.get('approved')
  if (!approved.includes(deviceId)) store.set('approved', [...approved, deviceId])
}

export function forgetLanDevice(deviceId: string): void {
  store.set(
    'approved',
    store.get('approved').filter((id) => id !== deviceId)
  )
  const incoming = { ...store.get('incomingSecrets') }
  delete incoming[deviceId]
  store.set('incomingSecrets', incoming)
  const boundAt = { ...store.get('incomingSecretBoundAt') }
  delete boundAt[deviceId]
  store.set('incomingSecretBoundAt', boundAt)
  const outgoing = { ...store.get('outgoingSecrets') }
  delete outgoing[deviceId]
  store.set('outgoingSecrets', outgoing)
}
