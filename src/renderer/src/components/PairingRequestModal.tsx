import { motion } from 'framer-motion'
import type { PairingRequest } from '../types'
import macIcon from '../assets/platform/mac.svg'
import windowsIcon from '../assets/platform/windows.svg'
import { isWindows } from '../platform'

function platformIcon(platform?: string): string | null {
  if (platform === 'darwin') return macIcon
  if (platform === 'win32') return windowsIcon
  return null
}

export default function PairingRequestModal({
  request,
  onApprove,
  onReject
}: {
  request: PairingRequest
  onApprove: () => void
  onReject: () => void
}): JSX.Element {
  const icon = platformIcon(request.platform)
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--modal-backdrop)',
        ...(isWindows ? {} : { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200
      }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card"
        style={{
          width: 340,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)'
        }}
      >
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'var(--platform-badge)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {icon ? <img src={icon} alt="" style={{ width: 28, height: 28 }} /> : null}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{request.name}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>
            {request.source === 'lan' ? 'found on your network, allow it to connect?' : 'wants to connect to this device'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 6 }}>
          <button className="btn secondary" style={{ flex: 1 }} onClick={onReject}>
            Deny
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={onApprove}>
            Accept
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
