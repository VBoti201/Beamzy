import { AnimatePresence, motion } from 'framer-motion'
import type { UpdateStatus } from '../types'

export default function UpdateBanner({ status }: { status: UpdateStatus | null }): JSX.Element | null {
  if (!status) return null
  // 'downloaded' gets a full modal (UpdateReadyModal) instead of this
  // corner banner — it needs room for release notes and a real choice
  // between installing now or later, not just a passive notice.
  if (status.state !== 'downloading') return null

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
        <span>Downloading update{status.version ? ` v${status.version}` : ''}…</span>
        <div className="progress-track" style={{ width: 100 }}>
          <motion.div className="progress-fill" animate={{ width: `${status.percent || 0}%` }} />
        </div>
        <span style={{ color: 'var(--text-dim)' }}>{status.percent || 0}%</span>
      </motion.div>
    </AnimatePresence>
  )
}
