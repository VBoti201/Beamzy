import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DevicePermissionView } from '../types'

function EyeIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function DownloadIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function UploadIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function PermPill({
  icon,
  label,
  active,
  onClick
}: {
  icon: JSX.Element
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 10px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        border: active ? 'none' : '1px solid var(--card-border)',
        background: active ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'transparent',
        color: active ? 'var(--on-accent)' : 'var(--text-dim)',
        cursor: 'pointer',
        transition: 'transform 0.15s ease, background 0.15s ease, border-color 0.15s ease',
        flexShrink: 0
      }}
      onMouseEnter={(ev) => {
        if (!active) ev.currentTarget.style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={(ev) => {
        if (!active) ev.currentTarget.style.borderColor = 'var(--card-border)'
      }}
    >
      {icon}
      {label}
    </button>
  )
}

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

  const update = async (
    folderId: string,
    allowBrowse: boolean,
    allowUpload: boolean,
    allowDownload: boolean
  ): Promise<void> => {
    await window.api.permissionsSet({ deviceId, folderId, allowBrowse, allowUpload, allowDownload })
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
              gap: 8,
              padding: '10px 10px',
              borderRadius: 8,
              marginBottom: 4
            }}
          >
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.folderName}
            </div>
            {e.isCustom && <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>Custom</span>}
            <PermPill
              icon={<EyeIcon />}
              label="Browse"
              active={e.allowBrowse}
              onClick={() => update(e.folderId, !e.allowBrowse, e.allowUpload, e.allowDownload)}
            />
            <PermPill
              icon={<DownloadIcon />}
              label="Download"
              active={e.allowDownload}
              onClick={() => update(e.folderId, e.allowBrowse, e.allowUpload, !e.allowDownload)}
            />
            <PermPill
              icon={<UploadIcon />}
              label="Upload"
              active={e.allowUpload}
              onClick={() => update(e.folderId, e.allowBrowse, !e.allowUpload, e.allowDownload)}
            />
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
