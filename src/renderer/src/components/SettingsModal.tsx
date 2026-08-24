import { useState } from 'react'
import { motion } from 'framer-motion'
import SharedFolderEditor from './SharedFolderEditor'
import RelaySettings from './RelaySettings'
import UpdateSection from './UpdateSection'
import type { AppConfig, RelayStatus, UpdateStatus } from '../types'
import { isWindows } from '../platform'

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
  const [theme, setTheme] = useState(config.theme)
  const [saving, setSaving] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  // Only previews live (so you can see it while picking) — not persisted
  // until Save, same as name/folders below, so closing without saving can
  // cleanly revert it.
  const changeTheme = (t: typeof theme): void => {
    setTheme(t)
    document.documentElement.dataset.theme = t
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    const updated = await window.api.updateConfig({ deviceName: name.trim(), sharedFolders: folders, theme })
    onSaved({ ...updated, relay })
    setSaving(false)
    onClose()
  }

  // Relay changes apply immediately as you make them, but appearance, name,
  // and folders only take effect on Save — closing without saving would
  // silently throw those away, so ask first.
  const isDirty =
    theme !== config.theme ||
    name.trim() !== config.deviceName ||
    JSON.stringify(folders) !== JSON.stringify(config.sharedFolders)

  const discardAndClose = (): void => {
    document.documentElement.dataset.theme = config.theme
    onClose()
  }

  const requestClose = (): void => {
    if (isDirty) {
      setConfirmingDiscard(true)
      return
    }
    discardAndClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-backdrop-strong)',
        ...(isWindows ? {} : { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100
      }}
      onClick={requestClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card"
        style={{ width: 560, padding: 24, maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Settings</h2>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>Appearance</label>
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: 'var(--overlay-05)',
              border: '1px solid var(--card-border)',
              borderRadius: 10,
              padding: 3
            }}
          >
            <button
              className={`btn tab-pill${theme === 'dark' ? ' active' : ''}`}
              style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={() => changeTheme('dark')}
            >
              Dark
            </button>
            <button
              className={`btn tab-pill${theme === 'light' ? ' active' : ''}`}
              style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={() => changeTheme('light')}
            >
              Light
            </button>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--card-border)', margin: '0 0 16px' }} />

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
          <button className="btn secondary" onClick={requestClose}>
            Cancel
          </button>
          <button className="btn" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {confirmingDiscard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--modal-backdrop-strong)',
              borderRadius: 'var(--radius)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="card"
              style={{ padding: 20, width: 320, textAlign: 'center' }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Discard unsaved changes?</div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 18 }}>
                Your appearance, name, or shared-folder edits haven&apos;t been saved yet.
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                <button className="btn secondary" onClick={() => setConfirmingDiscard(false)}>
                  Keep editing
                </button>
                <button className="btn" onClick={discardAndClose}>
                  Discard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
