import { useState } from 'react'
import { motion } from 'framer-motion'
import SendPanel from './SendPanel'
import BrowsePanel from './BrowsePanel'
import History from './History'
import type { AppConfig, PeerInfo } from '../types'

export default function DeviceView({ peer, config }: { peer: PeerInfo; config: AppConfig }): JSX.Element {
  const [tab, setTab] = useState<'send' | 'browse' | 'history'>('send')
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px 24px', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{peer.name}</h2>
        <div
          style={{
            display: 'flex',
            gap: 6,
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: 10,
            padding: 4
          }}
        >
          {(['send', 'browse', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="btn"
              style={{
                background: tab === t ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'transparent',
                color: tab === t ? 'var(--on-accent)' : 'var(--text-dim)',
                padding: '6px 14px',
                fontSize: 13
              }}
            >
              {t === 'send' ? 'Send' : t === 'browse' ? 'Browse / pull' : 'History'}
            </button>
          ))}
        </div>
      </div>
      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ flex: 1, minHeight: 0 }}>
        {tab === 'send' && <SendPanel peer={peer} />}
        {tab === 'browse' && <BrowsePanel peer={peer} config={config} />}
        {tab === 'history' && <History peerId={peer.id} />}
      </motion.div>
    </div>
  )
}
