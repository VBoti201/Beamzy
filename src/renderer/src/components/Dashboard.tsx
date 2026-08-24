import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import PeerList from './PeerList'
import DeviceView from './DeviceView'
import TransferTray from './TransferTray'
import RecentActivity from './RecentActivity'
import SettingsModal from './SettingsModal'
import { DiskIcon, GearIcon, RadarIcon, SidebarToggleIcon } from '../icons'
import type { AppConfig, PeerInfo, RelayStatus, TransferProgress, UpdateStatus } from '../types'

function formatBytes(n: number): string {
  if (!n) return '0 GB'
  const gb = n / 1024 ** 3
  return gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`
}

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
  const [diskSpace, setDiskSpace] = useState<{ free: number; total: number } | null>(null)

  useEffect(() => {
    const load = (): void => {
      window.api.getDiskSpace().then(setDiskSpace)
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const SIDEBAR_WIDTH = 280
  const RAIL_WIDTH = 16
  const TOGGLE_SIZE = 26

  const sidebarContent = (
    <>
      <div className="titlebar-spacer" />
      <div style={{ padding: '0 16px 12px', minWidth: 0 }}>
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
      <PeerList peers={peers} selectedId={selectedPeerId} onSelect={setSelectedPeerId} />
      <RecentActivity />
      <div style={{ padding: 12, borderTop: '1px solid var(--card-border)', display: 'flex', gap: 8, flexShrink: 0 }}>
        <div
          className="btn secondary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'default' }}
        >
          <DiskIcon size={16} />
          <span style={{ fontSize: 13 }}>{diskSpace ? `${formatBytes(diskSpace.free)} free` : '…'}</span>
        </div>
        <button className="btn secondary" style={{ padding: '8px 10px', flexShrink: 0 }} onClick={() => setSettingsOpen(true)}>
          <GearIcon size={16} />
        </button>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      <button
        className="card"
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onClick={() => {
          setSidebarCollapsed((c) => !c)
          setHoverPeek(false)
        }}
        style={{
          position: 'absolute',
          top: 48,
          left: (sidebarCollapsed ? RAIL_WIDTH : SIDEBAR_WIDTH) - TOGGLE_SIZE / 2,
          width: TOGGLE_SIZE,
          height: TOGGLE_SIZE,
          borderRadius: 10,
          background: 'var(--bg)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          zIndex: 50,
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)'
        }}
      >
        <motion.span
          style={{ display: 'flex' }}
          animate={{ rotate: sidebarCollapsed ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <SidebarToggleIcon size={14} />
        </motion.span>
      </button>

      {!sidebarCollapsed && (
        <div
          style={{
            width: SIDEBAR_WIDTH,
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
            width: RAIL_WIDTH,
            flexShrink: 0,
            borderRight: '1px solid var(--card-border)',
            cursor: 'pointer'
          }}
        >
          <div className="titlebar-spacer" />
          <AnimatePresence>
            {hoverPeek && (
              <motion.div
                initial={{ x: -SIDEBAR_WIDTH, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -SIDEBAR_WIDTH, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="card"
                style={{
                  position: 'absolute',
                  // Clears both the native window controls and the
                  // floating sidebar-toggle button (top: 48, ~26px tall)
                  // that floats above this panel — it was overlapping both.
                  top: 78,
                  left: RAIL_WIDTH,
                  bottom: 10,
                  width: SIDEBAR_WIDTH,
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 40,
                  borderRadius: 'var(--radius)',
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
      <TransferTray transfers={transfers} onSelectPeer={setSelectedPeerId} />
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
