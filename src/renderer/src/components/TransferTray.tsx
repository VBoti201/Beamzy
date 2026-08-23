import { AnimatePresence, motion } from 'framer-motion'
import type { TransferProgress } from '../types'

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

export default function TransferTray({ transfers }: { transfers: TransferProgress[] }): JSX.Element | null {
  const active = transfers.filter((t) => !t.done && !t.error).slice(-5)
  const recent = transfers.filter((t) => t.done || t.error).slice(-3)
  const shown = [...active, ...recent]
  if (shown.length === 0) return null

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, width: 300, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 50 }}>
      <AnimatePresence>
        {shown.map((t) => {
          const pct = t.totalBytes ? Math.min(100, (t.bytesTransferred / t.totalBytes) * 100) : 0
          return (
            <motion.div
              key={t.transferId}
              layout
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className="card"
              style={{ padding: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 180
                  }}
                >
                  {t.direction === 'push' ? '↑' : '↓'} {t.fileName}
                </span>
                <span style={{ color: t.error ? 'var(--danger)' : 'var(--text-dim)' }}>
                  {t.error ? 'Error' : t.done ? 'Done' : `${pct.toFixed(0)}%`}
                </span>
              </div>
              <div className="progress-track">
                <motion.div
                  className="progress-fill"
                  animate={{ width: `${t.error ? 100 : pct}%` }}
                  style={{ background: t.error ? 'var(--danger)' : undefined }}
                />
              </div>
              {!t.error && !t.done && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  {formatBytes(t.bytesTransferred)} / {formatBytes(t.totalBytes)}
                </div>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
