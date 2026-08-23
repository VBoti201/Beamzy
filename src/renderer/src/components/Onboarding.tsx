import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { v4 as uuidv4 } from 'uuid'
import SharedFolderEditor from './SharedFolderEditor'
import logo from '../assets/logo-dark-bg.svg'
import type { AppConfig, SharedFolder } from '../types'

export default function Onboarding({ onDone }: { onDone: (cfg: AppConfig) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [nameLoaded, setNameLoaded] = useState(false)
  const [folders, setFolders] = useState<SharedFolder[]>([])
  const [pairCode, setPairCode] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.getHostname().then((hostname) => {
      setName(hostname)
      setNameLoaded(true)
    })
    window.api.getDrives().then((drives) => {
      const primary = drives.find((d) => d.isPrimary)
      if (primary) {
        setFolders((prev) =>
          prev.length > 0
            ? prev
            : [{ id: uuidv4(), name: primary.name, path: primary.path, allowBrowse: true, allowUpload: true }]
        )
      }
    })
    window.api.getConfig().then((cfg) => {
      if (cfg.relay.pairId) {
        setPairCode(cfg.relay.pairId)
      } else {
        window.api.relaySetEnabled({ enabled: true, url: cfg.relay.url }).then((relay) => setPairCode(relay.pairId))
      }
    })
  }, [])

  const finish = async (): Promise<void> => {
    setSaving(true)
    const cfg = await window.api.updateConfig({
      deviceName: name.trim() || 'Unnamed device',
      sharedFolders: folders,
      onboarded: true
    })
    if (pairCode.trim()) {
      const relay = await window.api.relayPair({ code: pairCode })
      cfg.relay = relay
    }
    onDone(cfg)
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32
      }}
    >
      <motion.div
        className="card"
        style={{ width: 560, padding: 32 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <motion.img
            src={logo}
            alt=""
            style={{ width: 30, height: 30 }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
          />
          <h1 style={{ margin: 0, fontSize: 22 }}>Welcome to SwiftSend</h1>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.5 }}>
          Ultra-fast file transfer between the Mac and Windows machines on your local network.
        </p>

        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'block', marginTop: 18 }}>
          This device&apos;s name (read from the system, feel free to rename it)
        </label>
        <input
          className="input"
          style={{ width: '100%', marginTop: 6 }}
          value={name}
          placeholder={nameLoaded ? '' : 'Loading…'}
          onChange={(e) => setName(e.target.value)}
        />

        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'block', marginTop: 20 }}>
          Share folders
        </label>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.5, margin: '4px 0 0' }}>
          Choose which folders your other devices can access — they&apos;ll only ever see these.
          &quot;Browsable&quot;: others can look through it and pull files from it. &quot;Accepts
          uploads&quot;: others can send files here.
        </p>
        <div style={{ marginTop: 10 }}>
          <SharedFolderEditor folders={folders} onChange={setFolders} />
        </div>

        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'block', marginTop: 20 }}>
          Pairing code — links your devices for remote access
        </label>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.5, margin: '4px 0 0' }}>
          Setting up your <strong>first</strong> SwiftSend device? Just leave this code as-is. Setting up a{' '}
          <strong>second</strong> device to pair with one you already set up? Replace it with the code shown on
          that device (Settings). Devices with the same code can send files to each other even off your local
          network.
        </p>
        <input
          className="input"
          style={{
            width: '100%',
            marginTop: 8,
            fontFamily: 'monospace',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 2,
            textAlign: 'center'
          }}
          value={pairCode}
          placeholder={pairCode ? '' : 'Generating…'}
          onChange={(e) => setPairCode(e.target.value.toUpperCase())}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn" disabled={!name.trim() || folders.length === 0 || saving} onClick={finish}>
            {saving ? 'Saving…' : "Let's go!"}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
