import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { folderIconFor } from '../folderIcon'

interface Option {
  id: string
  name: string
}

export default function FolderDropdown({
  options,
  value,
  onChange
}: {
  options: Option[]
  value: string
  onChange: (id: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.id === value)

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="input"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minWidth: 170,
          cursor: options.length ? 'pointer' : 'default'
        }}
        disabled={!options.length}
        onClick={() => setOpen((v) => !v)}
      >
        {selected ? (
          <>
            <img src={folderIconFor(selected.name, true)} alt="" style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.name}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>No folders</span>
        )}
        {options.length > 0 && <span style={{ color: 'var(--text-dim)' }}>▾</span>}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="card"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 6,
                padding: 6,
                zIndex: 30,
                maxHeight: 220,
                overflowY: 'auto'
              }}
            >
              {options.map((o) => (
                <div
                  key={o.id}
                  onClick={() => {
                    onChange(o.id)
                    setOpen(false)
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer' }}
                >
                  <img src={folderIconFor(o.name, true)} alt="" style={{ width: 16, height: 16 }} />
                  {o.name}
                </div>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
