import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'

interface IconProps {
  size?: number
  style?: CSSProperties
  color?: string
}

export function GearIcon({ size = 16, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      whileHover={{ rotate: 50 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
    >
      <g fill={color}>
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x="10.5" y="1.5" width="3" height="4.4" rx="1.2" transform={`rotate(${i * 45} 12 12)`} />
        ))}
      </g>
      <circle cx="12" cy="12" r="6.1" fill="none" stroke={color} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.1" fill="none" stroke={color} strokeWidth="1.8" />
    </motion.svg>
  )
}

export function CloseIcon({ size = 14, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M5 5l14 14M19 5 5 19" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronIcon({
  size = 14,
  style,
  color = 'currentColor',
  direction = 'left'
}: IconProps & { direction?: 'left' | 'right' }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: direction === 'right' ? 'rotate(180deg)' : undefined, ...style }}
    >
      <path d="M15 5l-7 7 7 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SidebarToggleIcon({ size = 14, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <rect x="3" y="4" width="18" height="16" rx="3.5" stroke={color} strokeWidth="1.8" />
      <path d="M9 4v16" stroke={color} strokeWidth="1.8" />
    </svg>
  )
}

export function GlobeIcon({ size = 12, style, color = 'currentColor' }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="3.6" ry="8.5" stroke={color} strokeWidth="1.6" />
      <path d="M3.7 12h16.6" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

export function FileIcon({ size = 18, style, color = 'var(--accent)' }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path
        d="M6.5 2.5h7.4L18.5 7.6V21a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M13.7 2.6V8h4.6" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function RadarIcon({ size = 44 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i}
          cx="50"
          cy="50"
          r="10"
          stroke="var(--accent)"
          strokeWidth="2"
          initial={{ r: 10, opacity: 0.9 }}
          animate={{ r: 44, opacity: 0 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: i * 0.8 }}
        />
      ))}
      <circle cx="50" cy="50" r="9" fill="var(--accent)" />
    </svg>
  )
}
