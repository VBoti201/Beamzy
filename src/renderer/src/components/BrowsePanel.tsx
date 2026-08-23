import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AppConfig, PeerInfo, RemoteEntry } from '../types'
import { folderIconFor } from '../folderIcon'
import { FileIcon } from '../icons'
import FolderDropdown from './FolderDropdown'

export default function BrowsePanel({ peer, config }: { peer: PeerInfo; config: AppConfig }): JSX.Element {
  const [folderId, setFolderId] = useState<string | null>(null)
  const [relPath, setRelPath] = useState('')
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [destId, setDestId] = useState(config.sharedFolders[0]?.id || '')
  const [pulling, setPulling] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (fId: string | null, p: string): Promise<void> => {
    setLoading(true)
    try {
      const list =
        peer.transport === 'relay'
          ? await window.api.relayList({ peerId: peer.id, folderId: fId, path: p })
          : await window.api.remoteList({ host: peer.host!, port: peer.port!, folderId: fId, path: p })
      setEntries(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setFolderId(null)
    setRelPath('')
    load(null, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer])

  const openEntry = (e: RemoteEntry): void => {
    if (e.isRoot) {
      setFolderId(e.id!)
      setRelPath('')
      load(e.id!, '')
      return
    }
    if (e.isDir) {
      setRelPath(e.path)
      load(folderId, e.path)
    }
  }

  const goUp = (): void => {
    if (!relPath) {
      setFolderId(null)
      load(null, '')
      return
    }
    const parts = relPath.split('/').filter(Boolean)
    parts.pop()
    const np = parts.join('/')
    setRelPath(np)
    load(folderId, np)
  }

  const pull = async (e: RemoteEntry): Promise<void> => {
    if (!destId || !folderId) return
    setPulling(e.path)
    try {
      if (peer.transport === 'relay') {
        await window.api.relayPull({ peerId: peer.id, folderId, remoteRelPath: e.path, destFolderId: destId })
      } else {
        await window.api.pullFile({ host: peer.host!, port: peer.port!, folderId, remoteRelPath: e.path, destFolderId: destId })
      }
    } finally {
      setPulling(null)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Save to:</span>
        <FolderDropdown options={config.sharedFolders} value={destId} onChange={setDestId} />
      </div>
      <div className="card" style={{ flex: 1, overflowY: 'auto', padding: 8, minHeight: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px 10px',
            color: 'var(--text-dim)',
            fontSize: 13
          }}
        >
          {folderId && (
            <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={goUp}>
              ← Back
            </button>
          )}
          <span>{folderId ? relPath || '/' : 'Shared folders'}</span>
        </div>
        {loading && <div style={{ padding: 16, color: 'var(--text-dim)' }}>Loading…</div>}
        <AnimatePresence>
          {!loading &&
            entries.map((e, i) => (
              <motion.div
                key={e.path + e.name}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: e.isDir ? 'pointer' : 'default'
                }}
                whileHover={{ background: 'rgba(255,255,255,0.05)' }}
                onClick={() => e.isDir && openEntry(e)}
              >
                {e.isDir ? (
                  <motion.img
                    src={folderIconFor(e.name, !!e.isRoot)}
                    alt=""
                    style={{ width: 20, height: 20 }}
                    whileHover={{ scale: 1.12 }}
                  />
                ) : (
                  <FileIcon size={18} />
                )}
                <span style={{ flex: 1 }}>{e.name}</span>
                {!e.isDir && (
                  <button
                    className="btn secondary"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    disabled={pulling === e.path}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      pull(e)
                    }}
                  >
                    {pulling === e.path ? 'Pulling…' : 'Pull here'}
                  </button>
                )}
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
