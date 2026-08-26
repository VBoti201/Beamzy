import Store from 'electron-store'
import { randomUUID } from 'crypto'

export interface HistoryEntry {
  id: string
  transferId: string
  transport: 'lan' | 'relay'
  fileName: string
  filePath: string
  direction: 'sent' | 'received'
  peerId: string
  peerName: string
  timestamp: number
  size: number
  error?: string
}

const MAX_ENTRIES = 200
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

const store = new Store<{ entries: HistoryEntry[] }>({
  name: 'history',
  defaults: { entries: [] }
})

// Prunes on every read/write rather than on a timer — simpler, and the
// list only needs to be accurate when something actually looks at it or
// adds to it, not continuously while the app sits idle.
function loadPruned(): HistoryEntry[] {
  const entries = store.get('entries')
  const cutoff = Date.now() - MAX_AGE_MS
  const pruned = entries.filter((e) => e.timestamp >= cutoff)
  if (pruned.length !== entries.length) store.set('entries', pruned)
  return pruned
}

export function getHistory(): HistoryEntry[] {
  return loadPruned()
}

export function addHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry[] {
  const full: HistoryEntry = { ...entry, id: randomUUID(), timestamp: Date.now() }
  const entries = [full, ...loadPruned()].slice(0, MAX_ENTRIES)
  store.set('entries', entries)
  return entries
}

export function removeHistoryEntry(id: string): HistoryEntry[] {
  const entries = store.get('entries').filter((e) => e.id !== id)
  store.set('entries', entries)
  return entries
}

export function findHistoryEntryByTransferId(transferId: string): HistoryEntry | undefined {
  return store.get('entries').find((e) => e.transferId === transferId)
}

export function removeHistoryEntryByTransferId(transferId: string): HistoryEntry[] {
  const entries = store.get('entries').filter((e) => e.transferId !== transferId)
  store.set('entries', entries)
  return entries
}
