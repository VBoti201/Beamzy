import { AnimatePresence, motion } from 'framer-motion'
import type { UpdateStatus } from '../types'

export default function UpdateBanner({ status }: { status: UpdateStatus | null }): JSX.Element | null {
  if (!status) return null
  if (status.state !== 'downloading' && status.state !== 'downloaded') return null

  const install = (): void => {
    window.api.installUpdate()
  }

  return (
    <AnimatePresence>
      <motion.div
        key={status.state}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="card"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 20,
          transform: 'translateX(-50%)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 60,
          fontSize: 13
        }}
      >
        {status.state === 'downloading' && (
          <>
            <span>Downloading update{status.version ? ` v${status.version}` : ''}…</span>
            <div className="progress-track" style={{ width: 100 }}>
              <motion.div className="progress-fill" animate={{ width: `${status.percent || 0}%` }} />
            </div>
            <span style={{ color: 'var(--text-dim)' }}>{status.percent || 0}%</span>
          </>
        )}
        {status.state === 'downloaded' && (
          <>
            <span>
              Update{status.version ? ` v${status.version}` : ''} ready to install
            </span>
            <button className="btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={install}>
              Restart &amp; install
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
