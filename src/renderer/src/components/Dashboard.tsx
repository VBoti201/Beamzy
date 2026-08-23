import { useState } from 'react'
import { motion } from 'framer-motion'
import PeerList from './PeerList'
import DeviceView from './DeviceView'
import TransferTray from './TransferTray'
import SettingsModal from './SettingsModal'
import { GearIcon, RadarIcon } from '../icons'
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
  const selectedPeer = peers.find((p) => p.id === selectedPeerId) || null

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 280, borderRight: '1px solid var(--card-border)', display: 'flex', flexDirection: 'column' }}>
        <div className="titlebar-spacer" />
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{config.deviceName}</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>This device</div>
          </div>
          <button className="btn secondary" style={{ padding: '6px 10px' }} onClick={() => setSettingsOpen(true)}>
            <GearIcon size={16} />
          </button>
        </div>
        <PeerList peers={peers} selectedId={selectedPeerId} onSelect={setSelectedPeerId} />
      </div>
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
