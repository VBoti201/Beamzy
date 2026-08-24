import { useState } from 'react'

const SIZE_PRESETS_MB = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

function formatSize(mb: number): string {
  if (mb < 1000) return `${mb} MB`
  const gb = mb / 1000
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '—'
  if (seconds < 1) return '<1s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ${Math.round(seconds % 60)}s`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export default function SpeedTest(): JSX.Element {
  const [sizeIndex, setSizeIndex] = useState(4)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ downloadMbps: number; uploadMbps: number } | null>(null)
  const [error, setError] = useState(false)

  const sizeMB = SIZE_PRESETS_MB[sizeIndex]

  const run = async (): Promise<void> => {
    setRunning(true)
    setError(false)
    try {
      setResult(await window.api.speedTestRun())
    } catch {
      setError(true)
    } finally {
      setRunning(false)
    }
  }

  const sizeBytes = sizeMB * 1_000_000
  const sendSeconds = result ? (sizeBytes * 8) / (result.uploadMbps * 1_000_000) : 0
  const receiveSeconds = result ? (sizeBytes * 8) / (result.downloadMbps * 1_000_000) : 0

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>Speed test</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 4px' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>File size</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{formatSize(sizeMB)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={SIZE_PRESETS_MB.length - 1}
        step={1}
        value={sizeIndex}
        onChange={(e) => setSizeIndex(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
      <button className="btn secondary" style={{ marginTop: 12, width: '100%' }} disabled={running} onClick={run}>
        {running ? 'Testing…' : 'Run speed test'}
      </button>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>Couldn&apos;t reach the internet to test.</div>
      )}
      {result && !running && (
        <div className="card" style={{ marginTop: 12, padding: 12, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Upload / Download</span>
            <span>
              {result.uploadMbps.toFixed(1)} / {result.downloadMbps.toFixed(1)} Mbps
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Est. to send {formatSize(sizeMB)}</span>
            <span>{formatDuration(sendSeconds)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Est. to receive {formatSize(sizeMB)}</span>
            <span>{formatDuration(receiveSeconds)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
