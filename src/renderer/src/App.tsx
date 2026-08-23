import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Splash from './components/Splash'
import Onboarding from './components/Onboarding'
import Dashboard from './components/Dashboard'
import UpdateBanner from './components/UpdateBanner'
import type { AppConfig, LanPeer, PeerInfo, RelayPeer, RelayStatus, TransferProgress, UpdateStatus } from './types'

type Stage = 'loading' | 'onboarding' | 'app'

export default function App(): JSX.Element {
  const [stage, setStage] = useState<Stage>('loading')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [lanPeers, setLanPeers] = useState<LanPeer[]>([])
  const [relayPeers, setRelayPeers] = useState<RelayPeer[]>([])
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('disconnected')
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    let mounted = true
    const minSplash = new Promise((resolve) => setTimeout(resolve, 1100))
    const ready = new Promise<void>((resolve) => {
      const off = window.api.onAppReady(() => {
        off()
        resolve()
      })
    })
    Promise.all([minSplash, ready, window.api.getConfig()]).then(([, , cfg]) => {
      if (!mounted) return
      setConfig(cfg)
      setStage(cfg.onboarded ? 'app' : 'onboarding')
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const off = window.api.onPeersUpdate((p) => setLanPeers(p))
    window.api.getPeers().then(setLanPeers)
    return off
  }, [])

  useEffect(() => {
    const offPeers = window.api.onRelayPeersUpdate((p) => setRelayPeers(p))
    const offStatus = window.api.onRelayStatusUpdate((s) => setRelayStatus(s))
    return () => {
      offPeers()
      offStatus()
    }
  }, [])

  useEffect(() => {
    const off = window.api.onTransferProgress((p) => {
      setTransfers((prev) => {
        const idx = prev.findIndex((t) => t.transferId === p.transferId)
        if (idx === -1) return [...prev, p]
        const copy = [...prev]
        copy[idx] = p
        return copy
      })
    })
    return off
  }, [])

  useEffect(() => {
    return window.api.onUpdateStatus((s) => setUpdateStatus(s))
  }, [])

  const handleOnboarded = useCallback((cfg: AppConfig) => {
    setConfig(cfg)
    setStage('app')
  }, [])

  const peers: PeerInfo[] = [
    ...lanPeers.map((p) => ({ ...p, transport: 'lan' as const })),
    ...relayPeers.map((p) => ({ id: p.deviceId, name: p.name, transport: 'relay' as const }))
  ]

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait">
        {stage === 'loading' && <Splash key="splash" />}
        {stage === 'onboarding' && (
          <motion.div
            key="onboarding"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ height: '100%' }}
          >
            <Onboarding onDone={handleOnboarded} />
          </motion.div>
        )}
        {stage === 'app' && config && (
          <motion.div
            key="app"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ height: '100%' }}
          >
            <Dashboard
              config={config}
              setConfig={setConfig}
              peers={peers}
              transfers={transfers}
              relayStatus={relayStatus}
              updateStatus={updateStatus}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {stage === 'app' && <UpdateBanner status={updateStatus} />}
    </div>
  )
}
