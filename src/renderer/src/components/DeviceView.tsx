import { useState } from 'react'
import { motion } from 'framer-motion'
import SendPanel from './SendPanel'
import BrowsePanel from './BrowsePanel'
import History from './History'
import PermissionsPanel from './PermissionsPanel'
import type { AppConfig, PeerInfo } from '../types'

const TABS = ['send', 'browse', 'history', 'permissions'] as const
type Tab = (typeof TABS)[number]

const TAB_LABEL: Record<Tab, string> = {
  send: 'Send',
  browse: 'Browse / pull',
  history: 'History',
  permissions: 'Permissions'
}

export default function DeviceView({ peer, config }: { peer: PeerInfo; config: AppConfig }): JSX.Element {
  const [tab, setTab] = useState<Tab>('send')
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
          {TABS.map((t) => (
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
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ flex: 1, minHeight: 0 }}>
        {tab === 'send' && <SendPanel peer={peer} />}
        {tab === 'browse' && <BrowsePanel peer={peer} config={config} />}
        {tab === 'history' && <History peerId={peer.id} />}
        {tab === 'permissions' && <PermissionsPanel deviceId={peer.id} />}
      </motion.div>
    </div>
  )
}
