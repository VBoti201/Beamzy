import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import PeerList from './PeerList'
import DeviceView from './DeviceView'
import TransferTray from './TransferTray'
import SettingsModal from './SettingsModal'
import { GearIcon, RadarIcon, ChevronIcon } from '../icons'
import type { AppConfig, PeerInfo, RelayStatus, TransferProgress, UpdateStatus } from '../types'

export default function Dashboard({
  config,
  setConfig,
  peers,
  transfers,
  relayStatus,
  updateStatus
}: {
  config: AppConfig
  setConfig: (c: AppConfig) => void
  peers: PeerInfo[]
  transfers: TransferProgress[]
  relayStatus: RelayStatus
  updateStatus: UpdateStatus | null
}): JSX.Element {
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [hoverPeek, setHoverPeek] = useState(false)
  const selectedPeer = peers.find((p) => p.id === selectedPeerId) || null

  const sidebarContent = (
    <>
      <div className="titlebar-spacer" />
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {config.deviceName}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>This device</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn secondary" style={{ padding: '6px 10px' }} onClick={() => setSettingsOpen(true)}>
            <GearIcon size={16} />
          </button>
          <button
            className="btn secondary"
            style={{ padding: '6px 10px' }}
            title="Collapse sidebar"
            onClick={() => {
              setSidebarCollapsed(true)
              setHoverPeek(false)
            }}
          >
            <ChevronIcon size={14} direction="left" />
          </button>
        </div>
      </div>
      <PeerList peers={peers} selectedId={selectedPeerId} onSelect={setSelectedPeerId} />
    </>
  )

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {!sidebarCollapsed && (
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: '1px solid var(--card-border)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {sidebarContent}
        </div>
      )}

      {sidebarCollapsed && (
        <div
          onMouseEnter={() => setHoverPeek(true)}
          onMouseLeave={() => setHoverPeek(false)}
          style={{
            position: 'relative',
            width: 16,
            flexShrink: 0,
            borderRight: '1px solid var(--card-border)',
            cursor: 'pointer'
          }}
        >
          <div className="titlebar-spacer" />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6, color: 'var(--text-dim)' }}>
            <ChevronIcon size={12} direction="right" />
          </div>
          <AnimatePresence>
            {hoverPeek && (
              <motion.div
                initial={{ x: -280, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -280, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="card"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 16,
                  bottom: 0,
                  width: 280,
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 40,
                  borderRadius: 0,
                  boxShadow: '8px 0 30px rgba(0,0,0,0.5)'
                }}
              >
                {sidebarContent}
                <div style={{ padding: 12 }}>
                  <button
                    className="btn secondary"
                    style={{ width: '100%', fontSize: 12 }}
                    onClick={() => {
                      setSidebarCollapsed(false)
                      setHoverPeek(false)
                    }}
                  >
                    Pin sidebar open
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="titlebar-spacer" />
        {selectedPeer ? (
          <DeviceView key={selectedPeer.id} peer={selectedPeer} config={config} />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-dim)',
              flexDirection: 'column',
              gap: 8
            }}
          >
            <RadarIcon size={48} />
            <div>Choose a device to get started</div>
          </motion.div>
        )}
      </div>
      <TransferTray transfers={transfers} />
      {settingsOpen && (
        <SettingsModal
          config={config}
          relayStatus={relayStatus}
          updateStatus={updateStatus}
          onClose={() => setSettingsOpen(false)}
          onSaved={setConfig}
        />
      )}
    </div>
  )
}
