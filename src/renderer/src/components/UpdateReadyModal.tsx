import { motion } from 'framer-motion'
import type { UpdateStatus } from '../types'
import { isWindows } from '../platform'

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function UpdateReadyModal({
  status,
  onInstall,
  onLater
}: {
  status: UpdateStatus
  onInstall: () => void
  onLater: () => void
}): JSX.Element {
  const releaseDate = formatDate(status.releaseDate)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        ...(isWindows ? {} : { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200
      }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card"
        style={{
          width: 380,
          maxHeight: '70vh',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>SwiftSend {status.version ? `v${status.version}` : ''} is ready</div>
          {releaseDate && <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>Released {releaseDate}</div>}
        </div>
        {status.releaseNotes && (
          <div
            className="card"
            style={{
              padding: 12,
              fontSize: 12,
              color: 'var(--text-dim)',
              lineHeight: 1.5,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              flex: 1,
              minHeight: 0
            }}
          >
            {status.releaseNotes}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn secondary" style={{ flex: 1 }} onClick={onLater}>
            Later
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={onInstall}>
            Restart &amp; Install
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
