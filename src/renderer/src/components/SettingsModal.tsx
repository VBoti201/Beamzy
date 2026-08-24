import { useState } from 'react'
import { motion } from 'framer-motion'
import SharedFolderEditor from './SharedFolderEditor'
import RelaySettings from './RelaySettings'
import UpdateSection from './UpdateSection'
import type { AppConfig, RelayStatus, UpdateStatus } from '../types'

export default function SettingsModal({
  config,
  relayStatus,
  updateStatus,
  onClose,
  onSaved
}: {
  config: AppConfig
  relayStatus: RelayStatus
  updateStatus: UpdateStatus | null
  onClose: () => void
  onSaved: (c: AppConfig) => void
}): JSX.Element {
  const [name, setName] = useState(config.deviceName)
  const [folders, setFolders] = useState(config.sharedFolders)
  const [relay, setRelay] = useState(config.relay)
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    const updated = await window.api.updateConfig({ deviceName: name.trim(), sharedFolders: folders })
    onSaved({ ...updated, relay })
    setSaving(false)
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card"
        style={{ width: 560, padding: 24, maxHeight: '85vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>Device name</label>
        <input className="input" style={{ width: '100%', margin: '6px 0 16px' }} value={name} onChange={(e) => setName(e.target.value)} />
        <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>Shared folders</label>
        <div style={{ marginTop: 6 }}>
          <SharedFolderEditor folders={folders} onChange={setFolders} />
        </div>

        <div style={{ height: 1, background: 'var(--card-border)', margin: '20px 0' }} />

        <RelaySettings relay={relay} relayStatus={relayStatus} onChange={setRelay} />

        <div style={{ height: 1, background: 'var(--card-border)', margin: '20px 0' }} />

        <UpdateSection updateStatus={updateStatus} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
          <button className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
