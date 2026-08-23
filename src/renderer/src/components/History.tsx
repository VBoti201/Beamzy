import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { HistoryEntry } from '../types'
import { FileIcon, TrashIcon } from '../icons'

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

function formatWhen(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function History({ peerId }: { peerId: string }): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([])

  useEffect(() => {
    window.api.historyGet().then(setEntries)
    return window.api.onHistoryUpdate(setEntries)
  }, [])

  const filtered = entries.filter((e) => e.peerId === peerId)

  const remove = async (id: string): Promise<void> => {
    setEntries(await window.api.historyRemove({ id }))
  }

  if (filtered.length === 0) {
    return (
      <div
        className="card"
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-dim)'
        }}
      >
        No transfers with this device yet.
      </div>
    )
  }

  return (
    <div className="card" style={{ height: '100%', overflowY: 'auto', padding: 8 }}>
      <AnimatePresence>
        {filtered.map((e) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8 }}
            whileHover={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <span style={{ color: e.error ? 'var(--danger)' : 'var(--text-dim)', fontWeight: 700, width: 12 }}>
              {e.direction === 'sent' ? '↑' : '↓'}
            </span>
            <FileIcon size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.fileName}</div>
              <div style={{ fontSize: 11, color: e.error ? 'var(--danger)' : 'var(--text-dim)' }}>
                {e.error ? e.error : `${formatWhen(e.timestamp)} · ${formatBytes(e.size)}`}
              </div>
            </div>
            {!e.error && (
              <button
                className="btn secondary"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => window.api.historyOpen({ filePath: e.filePath })}
              >
                Open
              </button>
            )}
            <button
              className="btn secondary"
              style={{ padding: '4px 8px' }}
              title="Remove from history"
              onClick={() => remove(e.id)}
            >
              <TrashIcon size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
