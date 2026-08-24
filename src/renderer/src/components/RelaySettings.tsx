import { useState } from 'react'
import type { RelayConfig, RelayStatus } from '../types'

const statusLabel: Record<RelayStatus, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Connection error'
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
  const [codeInput, setCodeInput] = useState(relay.pairId)
  const [busy, setBusy] = useState(false)
  const [pairing, setPairing] = useState(false)
  const [copied, setCopied] = useState(false)

  const toggle = async (): Promise<void> => {
    setBusy(true)
    try {
      const updated = await window.api.relaySetEnabled({ enabled: !relay.enabled, url: relay.url })
      onChange(updated)
      setCodeInput(updated.pairId)
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async (): Promise<void> => {
    const updated = await window.api.relayRegenerateCode()
    onChange(updated)
    setCodeInput(updated.pairId)
  }

  const pairWithCode = async (): Promise<void> => {
    setPairing(true)
    try {
      const updated = await window.api.relayPair({ code: codeInput })
      onChange(updated)
      setCodeInput(updated.pairId)
    } finally {
      setPairing(false)
    }
  }

  const copyCode = async (): Promise<void> => {
    await navigator.clipboard.writeText(relay.pairId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const dirty = codeInput.trim().toUpperCase() !== relay.pairId.toUpperCase()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Remote access</div>
        <input type="checkbox" checked={relay.enabled} disabled={busy} onChange={toggle} />
      </div>

      {relay.enabled && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-dim)' }}>Pairing code</label>
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
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              />
              {dirty ? (
                <button className="btn" disabled={pairing || !codeInput.trim()} onClick={pairWithCode}>
                  {pairing ? 'Pairing…' : 'Pair'}
                </button>
              ) : (
                <button className="btn secondary" onClick={copyCode}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
              <button className="btn secondary" onClick={regenerate}>
                Regenerate
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              To pair, type the other device&apos;s code over this one and hit Pair. No need to clear it first.
            </div>
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
