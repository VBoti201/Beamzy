import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { HistoryEntry } from '../types'
import { ChevronIcon } from '../icons'

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

export default function RecentActivity(): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    window.api.historyGet().then(setEntries)
    return window.api.onHistoryUpdate(setEntries)
  }, [])

  const recent = entries.slice(0, 8)

  // Always renders (even empty) and keeps flex:1 so this reserves the
  // remaining sidebar space — otherwise the bottom bar (Profile/Settings)
  // would ride up right under the peer list whenever there's no history
  // yet, instead of staying pinned to the bottom of the sidebar.
  return (
    <div style={{ padding: '4px 16px 12px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
      {recent.length > 0 && (
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginBottom: 6,
            marginTop: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            color: 'var(--text-dim)'
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>Recent activity</span>
          <ChevronIcon size={10} style={{ transform: `rotate(${collapsed ? 90 : -90}deg)` }} />
        </button>
      )}
      <AnimatePresence>
        {!collapsed &&
          recent.map((e) => (
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
