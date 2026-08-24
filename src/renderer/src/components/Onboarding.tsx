import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { v4 as uuidv4 } from 'uuid'
import SharedFolderEditor from './SharedFolderEditor'
import type { AppConfig, SharedFolder } from '../types'

function formatPairingCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean
}

export default function Onboarding({ onDone }: { onDone: (cfg: AppConfig) => void }): JSX.Element {
  const [name, setName] = useState('')
  const [nameLoaded, setNameLoaded] = useState(false)
  const [folders, setFolders] = useState<SharedFolder[]>([])
  const [myCode, setMyCode] = useState('')
  const [connectCode, setConnectCode] = useState('')
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
            : [{ id: uuidv4(), name: primary.name, path: primary.path, allowBrowse: true, allowUpload: true, allowDownload: true }]
        )
      }
    })
    window.api.getConfig().then((cfg) => {
      if (cfg.relay.pairId) {
        setMyCode(cfg.relay.pairId)
      } else {
        window.api.relaySetEnabled({ enabled: true, url: cfg.relay.url }).then((relay) => setMyCode(relay.pairId))
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
    if (connectCode.trim()) {
      try {
        await window.api.relayPair({ code: connectCode })
      } catch {
        // The other device might not be online yet, or declined — either
        // way, this is optional at onboarding time. It can always be
        // retried from Settings afterward.
      }
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
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>Welcome to Beamzy</h1>
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
          Choose which folders your other devices can access. They&apos;ll only ever see these.
          &quot;Browsable&quot;: others can look through it and pull files from it. &quot;Accepts
          uploads&quot;: others can send files here.
        </p>
        <div style={{ marginTop: 10 }}>
          <SharedFolderEditor folders={folders} onChange={setFolders} />
        </div>

        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'block', marginTop: 20 }}>
          Your code
        </label>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.5, margin: '4px 0 0' }}>
          This is permanent and stays yours. Share it with another device (from its Settings) so it can connect
          to you for remote access, even off your local network.
        </p>
        <input
          className="input"
          readOnly
          style={{
            width: '100%',
            marginTop: 8,
            fontFamily: 'monospace',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 2,
            textAlign: 'center'
          }}
          value={myCode}
          placeholder={myCode ? '' : 'Generating…'}
        />

        <label style={{ fontSize: 13, color: 'var(--text-dim)', display: 'block', marginTop: 20 }}>
          Connect to a device (optional)
        </label>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.5, margin: '4px 0 0' }}>
          Already set up another Beamzy device? Type its code here and it'll get a request to approve you. You
          can always do this later from Settings instead.
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
          placeholder="XXX-XXX"
          value={connectCode}
          maxLength={7}
          onChange={(e) => setConnectCode(formatPairingCode(e.target.value))}
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
