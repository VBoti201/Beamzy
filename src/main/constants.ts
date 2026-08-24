import { randomInt } from 'crypto'
import http from 'http'
import https from 'https'

// Baked-in default for the relay server URL — set this once to your own
// deployed relay (see relay/DEPLOY.md), then rebuild the app. Every device
// you install Beamzy on will already have it pre-filled in Settings, so
// pairing is just: flip the toggle, share the pairing code, done.
export const DEFAULT_RELAY_URL = 'wss://swiftsend-cfxh.onrender.com'

// Short, easy-to-read-aloud/type pairing code alphabet — excludes visually
// ambiguous characters (0/O, 1/I/L).
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generatePairingCode(): string {
  const part = (len: number): string =>
    Array.from({ length: len }, () => PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)]).join('')
  return `${part(3)}-${part(3)}`
}

function checkPairInUse(relayUrl: string, code: string): Promise<boolean> {
  return new Promise((resolve) => {
    let target: URL
    try {
      const base = relayUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
      target = new URL(`/check-pair?code=${encodeURIComponent(code)}`, base)
    } catch {
      resolve(false)
      return
    }
    const client = target.protocol === 'https:' ? https : http
    const req = client.get(target, { timeout: 4000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(!!(JSON.parse(data) as { inUse?: boolean }).inUse)
        } catch {
          resolve(false)
        }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

// Two unrelated device pairs could in principle land on the exact same
// short code. Ask the relay whether a freshly generated code is currently
// in use by someone else before handing it out; fails open (assumes fine)
// if the relay can't be reached, since generating *a* code should never
// be blocked by that.
export async function generateUniquePairingCode(relayUrl: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generatePairingCode()
    if (!(await checkPairInUse(relayUrl, code))) return code
  }
  return generatePairingCode()
}
