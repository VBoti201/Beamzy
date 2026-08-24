import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TransferProgress } from '../types'

const AUTO_DISMISS_MS = 5000
const STALL_TIMEOUT_MS = 20000
const STALL_CHECK_INTERVAL_MS = 4000

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

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `~${Math.round(seconds)}s left`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `~${mins}m ${Math.round(seconds % 60)}s left`
  const hours = Math.floor(mins / 60)
  return `~${hours}h ${mins % 60}m left`
}

export default function TransferTray({
  transfers,
  onSelectPeer
}: {
  transfers: TransferProgress[]
  onSelectPeer?: (peerId: string) => void
}): JSX.Element | null {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const rateTrackers = useRef<Map<string, { lastBytes: number; lastTime: number; bps: number }>>(new Map())

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

  // If an active (incoming) transfer stops making progress for a while —
  // the sender vanished, the connection died silently — cancel it so it
  // surfaces as a real error instead of sitting at some % forever.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      for (const t of transfers) {
        if (t.done || t.error) continue
        const tracker = rateTrackers.current.get(t.transferId)
        if (tracker && now - tracker.lastTime > STALL_TIMEOUT_MS) {
          window.api.transferCancel({ transferId: t.transferId })
        }
      }
    }, STALL_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [transfers])

  const toggleErrorDetail = (id: string): void => {
    setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const estimateEta = (t: TransferProgress): string => {
    if (t.done || t.error || !t.totalBytes) return ''
    const now = Date.now()
    const prev = rateTrackers.current.get(t.transferId)
    if (!prev) {
      rateTrackers.current.set(t.transferId, { lastBytes: t.bytesTransferred, lastTime: now, bps: 0 })
      return ''
    }
    const db = t.bytesTransferred - prev.lastBytes
    // Only refresh lastTime when bytes actually moved — this is exactly
    // the signal the stall watchdog below needs to notice a transfer that
    // stopped making progress, which an unconditional timestamp bump
    // (from unrelated re-renders) would otherwise mask.
    if (db > 0) {
      const dt = (now - prev.lastTime) / 1000
      const instBps = dt > 0 ? db / dt : prev.bps
      const bps = prev.bps ? prev.bps * 0.7 + instBps * 0.3 : instBps
      rateTrackers.current.set(t.transferId, { lastBytes: t.bytesTransferred, lastTime: now, bps })
      return bps > 0 ? formatEta((t.totalBytes - t.bytesTransferred) / bps) : ''
    }
    return prev.bps > 0 ? formatEta((t.totalBytes - t.bytesTransferred) / prev.bps) : ''
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
          const eta = estimateEta(t)
          const clickable = !!(onSelectPeer && t.peerId)
          return (
            <motion.div
              key={t.transferId}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.85 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 340, damping: 24 }}
              className="card"
              style={{ padding: 12, cursor: clickable ? 'pointer' : undefined }}
              onMouseEnter={() => {
                setHoveredId(t.transferId)
                cancelDismiss(t.transferId)
              }}
              onMouseLeave={() => {
                setHoveredId((cur) => (cur === t.transferId ? null : cur))
                if (t.done || t.error) scheduleDismiss(t.transferId)
              }}
              onClick={() => clickable && onSelectPeer!(t.peerId!)}
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
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleErrorDetail(t.transferId)
                    }}
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    marginTop: 4
                  }}
                >
                  <span>
                    {formatBytes(t.bytesTransferred)} / {formatBytes(t.totalBytes)}
                    {eta ? ` · ${eta}` : ''}
                  </span>
                  {t.direction === 'pull' && (
                    <button
                      className="btn secondary"
                      style={{ padding: '1px 8px', fontSize: 11, flexShrink: 0 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        window.api.transferCancel({ transferId: t.transferId })
                      }}
                    >
                      Cancel
                    </button>
                  )}
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
