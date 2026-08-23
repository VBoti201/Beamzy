import { motion } from 'framer-motion'
import spinner from '../assets/spinner.svg'

export default function Splash(): JSX.Element {
  return (
    <motion.div
      key="splash"
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4 }}
      style={{
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
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

      <div style={{ position: 'relative', width: 76, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: i * 1.3 }}
            style={{
              position: 'absolute',
              width: 76,
              height: 76,
              borderRadius: 22,
              border: '1px solid var(--accent)',
              pointerEvents: 'none'
            }}
          />
        ))}
        <motion.div
          initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'relative',
            width: 76,
            height: 76,
            borderRadius: 22,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #2a2a2e, #070708)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 20px 60px rgba(255,184,0,0.3)'
          }}
        >
          <motion.div
            initial={{ x: '-120%', y: '-120%' }}
            animate={{ x: '120%', y: '120%' }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              width: '60%',
              height: '220%',
              background: 'linear-gradient(135deg, transparent, rgba(255,230,102,0.35), transparent)',
              transform: 'rotate(20deg)',
              pointerEvents: 'none'
            }}
          />
          <motion.svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path
              d="M4 12h13M13 6l6 6-6 6"
              stroke="var(--accent)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, delay: 0.25 }}
        style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.3 }}
      >
        SwiftSend
      </motion.div>
      <motion.img
        src={spinner}
        alt=""
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        style={{ width: 34, height: 34 }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{ color: 'var(--text-dim)', fontSize: 13 }}
      >
        Discovering devices on the network…
      </motion.div>
    </motion.div>
  )
}
