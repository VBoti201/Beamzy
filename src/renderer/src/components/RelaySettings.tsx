import { useState } from 'react'
import type { RelayConfig, RelayStatus } from '../types'

const statusLabel: Record<RelayStatus, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Connection error'
}

function formatPairingCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean
}

function cleanIpcError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
}

const statusColor: Record<RelayStatus, string> = {
  disconnected: 'var(--text-dim)',
  connecting: 'var(--accent-2)',
  connected: 'var(--success)',
  error: 'var(--danger)'
}

export default function RelaySettings({
  relay,
  relayStatus,
  onChange
}: {
  relay: RelayConfig
  relayStatus: RelayStatus
  onChange: (r: RelayConfig) => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [connectCode, setConnectCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [pairError, setPairError] = useState<string | null>(null)
  const [pairSuccess, setPairSuccess] = useState(false)

  const toggle = async (): Promise<void> => {
    setBusy(true)
    try {
      const updated = await window.api.relaySetEnabled({ enabled: !relay.enabled, url: relay.url })
      onChange(updated)
    } finally {
      setBusy(false)
    }
  }

  const copyCode = async (): Promise<void> => {
    await navigator.clipboard.writeText(relay.pairId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const pairWithCode = async (): Promise<void> => {
    setPairing(true)
    setPairError(null)
    setPairSuccess(false)
    try {
      await window.api.relayPair({ code: connectCode })
      setPairSuccess(true)
      setConnectCode('')
      setTimeout(() => setPairSuccess(false), 3000)
    } catch (err) {
      setPairError(cleanIpcError(err))
    } finally {
      setPairing(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Remote access</div>
        <input type="checkbox" checked={relay.enabled} disabled={busy} onChange={toggle} />
      </div>

      {relay.enabled && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Your code</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                className="input"
                readOnly
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textAlign: 'center'
                }}
                value={relay.pairId}
              />
              <button className="btn secondary" onClick={copyCode}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              This is permanent and stays yours. Share it with another device so it can connect to you.
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Connect to a device</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                className="input"
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textAlign: 'center'
                }}
                placeholder="XXX-XXX"
                value={connectCode}
                maxLength={7}
                onChange={(e) => setConnectCode(formatPairingCode(e.target.value))}
              />
              <button className="btn" disabled={pairing || !connectCode.trim()} onClick={pairWithCode}>
                {pairing ? 'Connecting…' : 'Pair'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              Type the other device&apos;s code and hit Pair. It'll need to approve you on its side.
            </div>
            {pairError && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{pairError}</div>}
            {pairSuccess && <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 6 }}>Connected!</div>}
          </div>

          <div style={{ fontSize: 12, color: statusColor[relayStatus], display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor[relayStatus] }} />
            {statusLabel[relayStatus]}
          </div>
        </div>
      )}
    </div>
  )
}
