import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PeerInfo } from '../types'
import { GlobeIcon, TrashIcon } from '../icons'
import macIcon from '../assets/platform/mac.svg'
import windowsIcon from '../assets/platform/windows.svg'

function platformIcon(platform?: string): string | null {
  if (platform === 'darwin') return macIcon
  if (platform === 'win32') return windowsIcon
  return null
}

const EMPTY_MESSAGES = ['Searching your network…', 'Open Beamzy on the other device', 'Or pair with a code in Settings']

function EmptyStateMessage(): JSX.Element {
  const [i, setI] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setI((n) => (n + 1) % EMPTY_MESSAGES.length), 2800)
    return () => clearInterval(interval)
  }, [])
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={i}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.3 }}
        style={{ display: 'block' }}
      >
        {EMPTY_MESSAGES[i]}
      </motion.span>
    </AnimatePresence>
  )
}

export default function PeerList({
  peers,
  selectedId,
  onSelect
}: {
  peers: PeerInfo[]
  selectedId: string | null
  onSelect: (id: string) => void
}): JSX.Element {
  return (
    <div style={{ flexShrink: 0, maxHeight: '50%', overflowY: 'auto', padding: '0 8px' }}>
      <AnimatePresence>
        {peers.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}
          >
            <EmptyStateMessage />
          </motion.div>
        )}
        {peers.map((p) => (
          <motion.div
            key={p.id}
            layout
            role="button"
            tabIndex={0}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            onClick={() => onSelect(p.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(p.id)}
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: 12,
              marginBottom: 8,
              border: selectedId === p.id ? '1px solid var(--accent)' : '1px solid var(--card-border)',
              background: selectedId === p.id ? 'rgba(255,214,10,0.1)' : 'var(--card)',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            {platformIcon(p.platform) ? (
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #2a2a2e, #070708)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <img src={platformIcon(p.platform)!} alt="" style={{ width: 14, height: 14 }} />
              </span>
            ) : (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--success)',
                  boxShadow: '0 0 8px var(--success)',
                  flexShrink: 0
                }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'inline-block',
                  maxWidth: '100%',
                  padding: '3px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--accent)',
                  background: 'rgba(255,214,10,0.12)',
                  color: 'var(--accent)',
                  fontWeight: 700,
                  fontSize: 15,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {p.name}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                {p.transport === 'relay' ? (
                  <>
                    <GlobeIcon size={11} /> Remote
                  </>
                ) : (
                  p.host
                )}
              </div>
            </div>
            <button
              className="btn secondary"
              style={{ padding: '4px 6px', flexShrink: 0, marginLeft: 'auto' }}
              title="Disconnect this device"
              onClick={(e) => {
                e.stopPropagation()
                if (p.transport === 'relay') window.api.relayKickDevice({ deviceId: p.id })
                else window.api.lanForgetDevice({ deviceId: p.id })
              }}
            >
              <TrashIcon size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
