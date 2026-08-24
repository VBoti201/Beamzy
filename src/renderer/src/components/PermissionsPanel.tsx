import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DevicePermissionView } from '../types'

export default function PermissionsPanel({ deviceId }: { deviceId: string }): JSX.Element {
  const [entries, setEntries] = useState<DevicePermissionView[]>([])
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    setEntries(await window.api.permissionsGet({ deviceId }))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  const update = async (folderId: string, allowBrowse: boolean, allowUpload: boolean): Promise<void> => {
    await window.api.permissionsSet({ deviceId, folderId, allowBrowse, allowUpload })
    load()
  }

  const reset = async (folderId: string): Promise<void> => {
    await window.api.permissionsClear({ deviceId, folderId })
    load()
  }

  if (loading) return <div style={{ padding: 16, color: 'var(--text-dim)' }}>Loading…</div>

  if (entries.length === 0) {
    return (
      <div
        className="card"
        style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}
      >
        No shared folders to set permissions for yet.
      </div>
    )
  }

  return (
    <div className="card" style={{ height: '100%', overflowY: 'auto', padding: 8 }}>
      <AnimatePresence>
        {entries.map((e) => (
          <motion.div
            key={e.folderId}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 10px',
              borderRadius: 8,
              marginBottom: 4
            }}
          >
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.folderName}
            </div>
            {e.isCustom && <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>Custom</span>}
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={e.allowBrowse}
                onChange={(ev) => update(e.folderId, ev.target.checked, e.allowUpload)}
              />
              Browse
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={e.allowUpload}
                onChange={(ev) => update(e.folderId, e.allowBrowse, ev.target.checked)}
              />
              Upload
            </label>
            {e.isCustom && (
              <button className="btn secondary" style={{ padding: '3px 8px', fontSize: 11, flexShrink: 0 }} onClick={() => reset(e.folderId)}>
                Reset
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
