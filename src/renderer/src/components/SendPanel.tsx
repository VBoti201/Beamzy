import { useEffect, useState, useCallback, DragEvent } from 'react'
import { motion } from 'framer-motion'
import type { PeerInfo } from '../types'
import sendIcon from '../assets/btn-send.svg'

interface Target {
  id: string
  name: string
}

export default function SendPanel({ peer }: { peer: PeerInfo }): JSX.Element {
  const [targets, setTargets] = useState<Target[]>([])
  const [targetId, setTargetId] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setFiles([])
    const fetchTargets =
      peer.transport === 'relay'
        ? window.api.relayTargets({ peerId: peer.id })
        : window.api.remoteTargets({ host: peer.host!, port: peer.port! })
    fetchTargets
      .then((t) => {
        setTargets(t)
        setTargetId(t[0]?.id || '')
      })
      .catch(() => setTargets([]))
  }, [peer])

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const paths: string[] = []
    for (const file of Array.from(e.dataTransfer.files)) {
      const p = window.api.getPathForFile(file)
      if (p) paths.push(p)
    }
    if (paths.length) setFiles((prev) => [...prev, ...paths])
  }, [])

  const pickFiles = async (): Promise<void> => {
    const picked = await window.api.pickFiles()
    if (picked.length) setFiles((prev) => [...prev, ...picked])
  }

  const send = async (): Promise<void> => {
    if (!files.length || !targetId) return
    setSending(true)
    if (peer.transport === 'relay') {
      await window.api.relayPush({ peerId: peer.id, folderId: targetId, destRelPath: '', localFilePaths: files })
    } else {
      await window.api.pushFiles({ host: peer.host!, port: peer.port!, folderId: targetId, destRelPath: '', localFilePaths: files })
    }
    setSending(false)
    setFiles([])
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="card"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          border: dragOver ? '2px dashed var(--accent-2)' : '2px dashed var(--card-border)',
          transition: 'border-color .15s',
          cursor: 'pointer'
        }}
        onClick={pickFiles}
      >
        <motion.img
          src={sendIcon}
          alt=""
          animate={{ y: dragOver ? -6 : 0, scale: dragOver ? 1.08 : 1, rotate: sending ? 360 : 0 }}
          transition={sending ? { rotate: { duration: 1, repeat: Infinity, ease: 'linear' } } : undefined}
          style={{ width: 48, height: 48 }}
        />
        <div style={{ fontWeight: 600 }}>Drag files here, or click to browse</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Sending to {peer.name}
          {peer.transport === 'relay' ? ' (via relay)' : ''}
        </div>
        {files.length > 0 && (
          <div style={{ marginTop: 8, maxWidth: '80%', textAlign: 'left' }}>
            {files.map((f, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                • {f.split(/[\\/]/).pop()}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <select className="input" style={{ flex: 1 }} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          {targets.length === 0 && <option value="">The target device has no folder that accepts uploads</option>}
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn" disabled={!files.length || !targetId || sending} onClick={send}>
          {sending ? 'Sending…' : `Send (${files.length})`}
        </button>
      </div>
    </div>
  )
}
