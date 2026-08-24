import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Splash from './components/Splash'
import Onboarding from './components/Onboarding'
import Dashboard from './components/Dashboard'
import UpdateBanner from './components/UpdateBanner'
import UpdateReadyModal from './components/UpdateReadyModal'
import PairingRequestModal from './components/PairingRequestModal'
import type {
  AppConfig,
  LanPeer,
  PairingRequest,
  PeerInfo,
  RelayPeer,
  RelayStatus,
  TransferProgress,
  UpdateStatus
} from './types'

type Stage = 'loading' | 'onboarding' | 'app'

export default function App(): JSX.Element {
  const [stage, setStage] = useState<Stage>('loading')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [lanPeers, setLanPeers] = useState<LanPeer[]>([])
  const [relayPeers, setRelayPeers] = useState<RelayPeer[]>([])
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('disconnected')
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [pairingQueue, setPairingQueue] = useState<PairingRequest[]>([])
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const minSplash = new Promise((resolve) => setTimeout(resolve, 2000))
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

  useEffect(() => {
    return window.api.onPairingRequest((req) => setPairingQueue((prev) => [...prev, req]))
  }, [])

  const respondToPairing = (approve: boolean): void => {
    const current = pairingQueue[0]
    if (!current) return
    if (approve) window.api.relayApprovePairing({ requestId: current.requestId })
    else window.api.relayRejectPairing({ requestId: current.requestId })
    setPairingQueue((prev) => prev.slice(1))
  }

  const handleOnboarded = useCallback((cfg: AppConfig) => {
    setConfig(cfg)
    setStage('app')
  }, [])

  const peerMap = new Map<string, PeerInfo>()
  for (const p of relayPeers) {
    peerMap.set(p.deviceId, { id: p.deviceId, name: p.name, platform: p.platform, transport: 'relay' as const })
  }
  // Same physical device can be reachable via both LAN and relay at once
  // (e.g. paired devices on the same network) — prefer the direct LAN
  // entry over the relay one for a given deviceId rather than listing both.
  for (const p of lanPeers) {
    peerMap.set(p.id, { ...p, transport: 'lan' as const })
  }
  const peers: PeerInfo[] = Array.from(peerMap.values())

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
      <AnimatePresence>
        {pairingQueue[0] && (
          <PairingRequestModal
            key={pairingQueue[0].requestId}
            request={pairingQueue[0]}
            onApprove={() => respondToPairing(true)}
            onReject={() => respondToPairing(false)}
          />
        )}
        {stage === 'app' &&
          updateStatus?.state === 'downloaded' &&
          updateStatus.version !== dismissedUpdateVersion && (
            <UpdateReadyModal
              key="update-ready"
              status={updateStatus}
              onInstall={() => window.api.installUpdate()}
              onLater={() => setDismissedUpdateVersion(updateStatus.version || null)}
            />
          )}
      </AnimatePresence>
    </div>
  )
}
