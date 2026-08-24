import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { v4 as uuidv4 } from 'uuid'
import type { DriveInfo, SharedFolder } from '../types'
import { folderIconFor } from '../folderIcon'
import { CloseIcon } from '../icons'

export default function SharedFolderEditor({
  folders,
  onChange
}: {
  folders: SharedFolder[]
  onChange: (f: SharedFolder[]) => void
}): JSX.Element {
  const [drives, setDrives] = useState<DriveInfo[]>([])

  useEffect(() => {
    window.api.getDrives().then(setDrives)
  }, [])

  const addFolder = async (): Promise<void> => {
    const picked = await window.api.chooseFolder()
    if (!picked) return
    const name = picked.split(/[\\/]/).pop() || picked
    const folder: SharedFolder = {
      id: uuidv4(),
      name,
      path: picked,
      allowBrowse: true,
      allowUpload: true,
      allowDownload: true
    }
    onChange([...folders, folder])
  }

  const addDrive = (drive: DriveInfo): void => {
    const folder: SharedFolder = {
      id: uuidv4(),
      name: drive.name,
      path: drive.path,
      allowBrowse: true,
      allowUpload: true,
      allowDownload: true
    }
    onChange([...folders, folder])
  }

  const update = (id: string, patch: Partial<SharedFolder>): void => {
    onChange(folders.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  const remove = (id: string): void => onChange(folders.filter((f) => f.id !== id))

  const addedPaths = new Set(folders.map((f) => f.path))
  const availableDrives = drives.filter((d) => !addedPaths.has(d.path))

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
        <AnimatePresence>
          {folders.map((f) => (
            <motion.div
              key={f.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="card"
              style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img
                  src={folderIconFor(f.name, drives.some((d) => d.path === f.path))}
                  alt=""
                  style={{ width: 24, height: 24, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {f.name}
                  </div>
                  <div
                    style={{
                      color: 'var(--text-dim)',
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {f.path}
                  </div>
                </div>
                <button className="btn secondary" style={{ padding: '6px 10px', flexShrink: 0 }} onClick={() => remove(f.id)}>
                  <CloseIcon size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginLeft: 34 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
                  <input
                    type="checkbox"
                    checked={f.allowBrowse}
                    onChange={(e) => update(f.id, { allowBrowse: e.target.checked })}
                  />
                  Browsable
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
                  <input
                    type="checkbox"
                    checked={f.allowUpload}
                    onChange={(e) => update(f.id, { allowUpload: e.target.checked })}
                  />
                  Accepts uploads
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-dim)' }}>
                  <input
                    type="checkbox"
                    checked={f.allowDownload !== false}
                    onChange={(e) => update(f.id, { allowDownload: e.target.checked })}
                  />
                  Downloadable
                </label>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {availableDrives.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>Drives</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {availableDrives.map((d) => (
              <button
                key={d.path}
                className="btn secondary"
                style={{ padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => addDrive(d)}
              >
                <img src={folderIconFor(d.name, true)} alt="" style={{ width: 16, height: 16 }} />
                {d.name}
                {d.isPrimary ? ' (default)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="btn secondary" style={{ marginTop: 10 }} onClick={addFolder}>
        + Custom folder
      </button>
    </div>
  )
}
