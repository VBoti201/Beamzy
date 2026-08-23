import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TransferProgress } from '../types'

const AUTO_DISMISS_MS = 5000

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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const scheduleDismiss = (id: string): void => {
    const existing = timers.current.get(id)
    if (existing) clearTimeout(existing)
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id)
        setDismissed((prev) => new Set(prev).add(id))
      }, AUTO_DISMISS_MS)
    )
  }

  const cancelDismiss = (id: string): void => {
    const existing = timers.current.get(id)
    if (existing) {
      clearTimeout(existing)
      timers.current.delete(id)
    }
  }

  useEffect(() => {
    for (const t of transfers) {
      if ((t.done || t.error) && t.transferId !== hoveredId && !timers.current.has(t.transferId) && !dismissed.has(t.transferId)) {
        scheduleDismiss(t.transferId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfers, hoveredId])

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer)
    }
  }, [])

  const toggleErrorDetail = (id: string): void => {
    setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visible = transfers.filter((t) => !dismissed.has(t.transferId))
  const active = visible.filter((t) => !t.done && !t.error).slice(-5)
  const recent = visible.filter((t) => t.done || t.error).slice(-3)
  const shown = [...active, ...recent]
  if (shown.length === 0) return null

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, width: 300, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 50 }}>
      <AnimatePresence>
        {shown.map((t) => {
          const pct = t.totalBytes ? Math.min(100, (t.bytesTransferred / t.totalBytes) * 100) : 0
          const errorOpen = expandedErrors.has(t.transferId)
          return (
            <motion.div
              key={t.transferId}
              layout
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className="card"
              style={{ padding: 12 }}
              onMouseEnter={() => {
                setHoveredId(t.transferId)
                cancelDismiss(t.transferId)
              }}
              onMouseLeave={() => {
                setHoveredId((cur) => (cur === t.transferId ? null : cur))
                if (t.done || t.error) scheduleDismiss(t.transferId)
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: t.error ? 140 : 180
                  }}
                >
                  {t.direction === 'push' ? '↑' : '↓'} {t.fileName}
                </span>
                {t.error ? (
                  <button
                    onClick={() => toggleErrorDetail(t.transferId)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--danger)',
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    Error {errorOpen ? '▲' : '▼'}
                  </button>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>{t.done ? 'Done' : `${pct.toFixed(0)}%`}</span>
                )}
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
              {t.error && errorOpen && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    marginTop: 6,
                    padding: 8,
                    borderRadius: 8,
                    background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.25)',
                    wordBreak: 'break-word'
                  }}
                >
                  {t.error}
                </div>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
