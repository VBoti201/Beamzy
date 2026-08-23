import { randomInt } from 'crypto'

// Baked-in default for the relay server URL — set this once to your own
// deployed relay (see relay/DEPLOY.md), then rebuild the app. Every device
// you install SwiftSend on will already have it pre-filled in Settings, so
// pairing is just: flip the toggle, share the pairing code, done.
export const DEFAULT_RELAY_URL = 'wss://relay.yourdomain.com'

// Short, easy-to-read-aloud/type pairing code alphabet — excludes visually
// ambiguous characters (0/O, 1/I/L).
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generatePairingCode(): string {
  const part = (len: number): string =>
    Array.from({ length: len }, () => PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)]).join('')
  return `${part(3)}-${part(3)}`
}
