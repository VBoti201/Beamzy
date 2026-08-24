import { useEffect, useState, useCallback, DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PeerInfo } from '../types'
import sendIcon from '../assets/btn-send.svg'
import { folderIconFor } from '../folderIcon'
import { CloseIcon } from '../icons'
import DestinationPicker from './DestinationPicker'

interface Target {
  id: string
  name: string
}

export default function SendPanel({ peer }: { peer: PeerInfo }): JSX.Element {
  const [targets, setTargets] = useState<Target[]>([])
  const [targetsError, setTargetsError] = useState(false)
  const [destFolderId, setDestFolderId] = useState('')
  const [destRelPath, setDestRelPath] = useState('')
  const [destLabel, setDestLabel] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setFiles([])
    setPickerOpen(false)
    setTargetsError(false)
    const fetchTargets =
      peer.transport === 'relay'
        ? window.api.relayTargets({ peerId: peer.id })
        : window.api.remoteTargets({ host: peer.host!, port: peer.port! })
    fetchTargets
      .then((t) => {
        setTargets(t)
        setDestFolderId(t[0]?.id || '')
        setDestRelPath('')
        setDestLabel(t[0]?.name || '')
      })
      .catch(() => {
        setTargets([])
        setTargetsError(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.id])

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

  const removeFile = (index: number): void => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const send = async (): Promise<void> => {
    if (!files.length || !destFolderId) return
    setSending(true)
    if (peer.transport === 'relay') {
      await window.api.relayPush({ peerId: peer.id, folderId: destFolderId, destRelPath, localFilePaths: files })
    } else {
      await window.api.pushFiles({ host: peer.host!, port: peer.port!, folderId: destFolderId, destRelPath, localFilePaths: files })
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
          position: 'relative',
          overflow: 'hidden',
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
        <AnimatePresence>
          {sending && (
            <motion.div
              key="hyperspeed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              {Array.from({ length: 7 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ x: '-40%', opacity: 0 }}
                  animate={{ x: '140%', opacity: [0, 1, 0] }}
                  transition={{ duration: 0.45, repeat: Infinity, delay: i * 0.08, ease: 'easeIn' }}
                  style={{
                    position: 'absolute',
                    top: `${8 + i * 12}%`,
                    left: 0,
                    width: '35%',
                    height: 2,
                    borderRadius: 2,
                    background: 'linear-gradient(90deg, transparent, var(--accent), transparent)'
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.img
          src={sendIcon}
          alt=""
          animate={{ y: dragOver ? -6 : 0, scale: sending ? 1.15 : dragOver ? 1.08 : 1 }}
          style={{ width: 48, height: 48 }}
        />
        <div style={{ fontWeight: 600 }}>Drag files here, or click to browse</div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          Sending to {peer.name}
          {peer.transport === 'relay' ? ' (via relay)' : ''}
        </div>
        {files.length > 0 && (
          <div
            style={{ marginTop: 8, maxWidth: '90%', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {files.map((f, i) => (
              <div
                key={i}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 6px 5px 10px',
                  border: '1px solid var(--accent)',
                  background: 'rgba(255,214,10,0.1)',
                  maxWidth: 220
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--accent)',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {f.split(/[\\/]/).pop()}
                </span>
                <button
                  className="btn secondary"
                  style={{ padding: '2px 5px', flexShrink: 0 }}
                  title="Remove"
                  onClick={() => removeFile(i)}
                >
                  <CloseIcon size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            className="input"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textAlign: 'left',
              cursor: targets.length ? 'pointer' : 'default'
            }}
            disabled={!targets.length}
            onClick={() => setPickerOpen((v) => !v)}
          >
            {destLabel ? (
              <>
                <img src={folderIconFor(destLabel, true)} alt="" style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {destLabel}
                </span>
              </>
            ) : (
              <span style={{ color: targetsError ? 'var(--danger)' : 'var(--text-dim)' }}>
                {targetsError
                  ? "Couldn't reach the other device — try again"
                  : 'The target device has no folder that accepts uploads'}
              </span>
            )}
            {targets.length > 0 && <span style={{ color: 'var(--text-dim)' }}>▾</span>}
          </button>
          <AnimatePresence>
            {pickerOpen && (
              <DestinationPicker
                peer={peer}
                targets={targets}
                onClose={() => setPickerOpen(false)}
                onPick={(folderId, relPath, label) => {
                  setDestFolderId(folderId)
                  setDestRelPath(relPath)
                  setDestLabel(label)
                  setPickerOpen(false)
                }}
              />
            )}
          </AnimatePresence>
        </div>
        <button className="btn" disabled={!files.length || !destFolderId || sending} onClick={send}>
          {sending ? 'Sending…' : files.length ? `Send (${files.length})` : 'Send'}
        </button>
      </div>
    </div>
  )
}
