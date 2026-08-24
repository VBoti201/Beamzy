import { motion } from 'framer-motion'
import spinner from '../assets/spinner.svg'

export default function Splash(): JSX.Element {
  return (
    <motion.div
      key="splash"
      exit={{ opacity: 0, scale: 0.82, filter: 'blur(14px)' }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      style={{
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        overflow: 'hidden'
      }}
    >
      {[
        { size: 420, top: '8%', left: '12%', delay: 0 },
        { size: 340, top: '55%', left: '70%', delay: 1.2 },
        { size: 260, top: '75%', left: '20%', delay: 2.1 }
      ].map((blob, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.35, 0.2], scale: [0.8, 1.15, 1], x: [0, 24, -12, 0], y: [0, -16, 10, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: blob.delay }}
          style={{
            position: 'absolute',
            top: blob.top,
            left: blob.left,
            width: blob.size,
            height: blob.size,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,214,10,0.5) 0%, rgba(255,184,0,0) 70%)',
            filter: 'blur(30px)',
            pointerEvents: 'none'
          }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, scale: 1.35, filter: 'blur(14px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.75, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        style={{
          fontSize: 52,
          fontWeight: 800,
          letterSpacing: -1,
          lineHeight: 1,
          background: 'linear-gradient(135deg, #FFE566, var(--accent) 45%, var(--accent-2))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}
      >
        Beamzy
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.75, duration: 0.4 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 4 }}
      >
        <img src={spinner} alt="" style={{ width: 28, height: 28 }} />
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Discovering devices…</div>
      </motion.div>
    </motion.div>
  )
}
