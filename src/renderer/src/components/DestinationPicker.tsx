import { useState } from 'react'
import { motion } from 'framer-motion'
import type { PeerInfo, RemoteEntry } from '../types'
import { folderIconFor } from '../folderIcon'
import { CloseIcon } from '../icons'

interface Target {
  id: string
  name: string
}

export default function DestinationPicker({
  peer,
  targets,
  onPick,
  onClose
}: {
  peer: PeerInfo
  targets: Target[]
  onPick: (folderId: string, relPath: string, label: string) => void
  onClose: () => void
}): JSX.Element {
  const [folderId, setFolderId] = useState<string | null>(null)
  const [rootName, setRootName] = useState('')
  const [relPath, setRelPath] = useState('')
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (fId: string, path: string): Promise<void> => {
    setLoading(true)
    try {
      const list =
        peer.transport === 'relay'
          ? await window.api.relayList({ peerId: peer.id, folderId: fId, path })
          : await window.api.remoteList({ host: peer.host!, port: peer.port!, folderId: fId, path })
      setEntries(list.filter((e) => e.isDir))
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  const openRoot = (t: Target): void => {
    setFolderId(t.id)
    setRootName(t.name)
    setRelPath('')
    load(t.id, '')
  }

  const openSub = (name: string): void => {
    if (!folderId) return
    const next = relPath ? `${relPath}/${name}` : name
    setRelPath(next)
    load(folderId, next)
  }

  const goUp = (): void => {
    if (!relPath) {
      setFolderId(null)
      setEntries([])
      return
    }
    const parts = relPath.split('/').filter(Boolean)
    parts.pop()
    const next = parts.join('/')
    setRelPath(next)
    load(folderId!, next)
  }

  const currentLabel = folderId ? [rootName, ...relPath.split('/').filter(Boolean)].join(' / ') : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="card"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 6,
        padding: 10,
        zIndex: 20,
        maxHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)' }}>
        {folderId && (
          <button className="btn secondary" style={{ padding: '3px 8px', fontSize: 12 }} onClick={goUp}>
            ← Back
          </button>
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folderId ? currentLabel : 'Choose a shared folder'}
        </span>
        <button className="btn secondary" style={{ padding: '4px 6px' }} onClick={onClose}>
          <CloseIcon size={12} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 40 }}>
        {loading && <div style={{ padding: 8, color: 'var(--text-dim)', fontSize: 12 }}>Loading…</div>}
        {!loading &&
          !folderId &&
          targets.map((t) => (
            <div
              key={t.id}
              onClick={() => openRoot(t)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}
            >
              <img src={folderIconFor(t.name, true)} alt="" style={{ width: 18, height: 18 }} />
              {t.name}
            </div>
          ))}
        {!loading &&
          folderId &&
          entries.map((e) => (
            <div
              key={e.path}
              onClick={() => openSub(e.name)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}
            >
              <img src={folderIconFor(e.name)} alt="" style={{ width: 18, height: 18 }} />
              {e.name}
            </div>
          ))}
        {!loading && folderId && entries.length === 0 && (
          <div style={{ padding: 8, color: 'var(--text-dim)', fontSize: 12 }}>No subfolders here.</div>
        )}
      </div>

      {folderId && (
        <button className="btn" style={{ fontSize: 13 }} onClick={() => onPick(folderId, relPath, currentLabel)}>
          Send here
        </button>
      )}
    </motion.div>
  )
}
