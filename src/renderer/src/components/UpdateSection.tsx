import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../types'

function describe(status: UpdateStatus | null): { text: string; color: string } {
  if (!status) return { text: '', color: 'var(--text-dim)' }
  switch (status.state) {
    case 'checking':
      return { text: 'Checking for updates…', color: 'var(--text-dim)' }
    case 'available':
      return { text: `Update v${status.version} found, starting download…`, color: 'var(--accent-2)' }
    case 'downloading':
      return { text: `Downloading v${status.version || ''}… ${status.percent || 0}%`, color: 'var(--accent-2)' }
    case 'downloaded':
      return { text: `Update v${status.version} downloaded, restart to install`, color: 'var(--success)' }
    case 'not-available':
      return { text: "You're on the latest version.", color: 'var(--success)' }
    case 'error':
      return { text: status.message || 'Could not check for updates.', color: 'var(--danger)' }
    default:
      return { text: '', color: 'var(--text-dim)' }
  }
}

export default function UpdateSection({ updateStatus }: { updateStatus: UpdateStatus | null }): JSX.Element {
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  useEffect(() => {
    if (updateStatus && updateStatus.state !== 'checking') setChecking(false)
  }, [updateStatus])

  const check = async (): Promise<void> => {
    setChecking(true)
    await window.api.checkForUpdates()
  }

  const install = (): void => {
    window.api.installUpdate()
  }

  const info = describe(updateStatus)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Software update</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
            Beamzy {version ? `v${version}` : ''}
          </div>
        </div>
        {updateStatus?.state === 'downloaded' ? (
          <button className="btn" style={{ padding: '6px 12px', fontSize: 13 }} onClick={install}>
            Restart &amp; install
          </button>
        ) : (
          <button className="btn secondary" style={{ padding: '6px 12px', fontSize: 13 }} disabled={checking} onClick={check}>
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
        )}
      </div>
      {info.text && (
        <div style={{ fontSize: 12, color: info.color, marginTop: 8 }}>{info.text}</div>
      )}
    </div>
  )
}
