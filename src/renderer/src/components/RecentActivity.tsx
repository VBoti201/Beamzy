import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { HistoryEntry } from '../types'

function formatWhen(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function RecentActivity(): JSX.Element | null {
  const [entries, setEntries] = useState<HistoryEntry[]>([])

  useEffect(() => {
    window.api.historyGet().then(setEntries)
    return window.api.onHistoryUpdate(setEntries)
  }, [])

  if (entries.length === 0) return null
  const recent = entries.slice(0, 8)

  return (
    <div style={{ padding: '4px 16px 12px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6, marginTop: 4 }}>
        Recent activity
      </div>
      <AnimatePresence>
        {recent.map((e) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}
          >
            <span style={{ color: e.error ? 'var(--danger)' : 'var(--text-dim)', fontWeight: 700, width: 10, flexShrink: 0 }}>
              {e.direction === 'sent' ? '↑' : '↓'}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--text-dim)'
              }}
              title={e.fileName}
            >
              {e.fileName}
            </span>
            <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{formatWhen(e.timestamp)}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
