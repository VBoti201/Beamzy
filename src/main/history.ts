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

const store = new Store<{ entries: HistoryEntry[] }>({
  name: 'history',
  defaults: { entries: [] }
})

export function getHistory(): HistoryEntry[] {
  return store.get('entries')
}

export function addHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry[] {
  const full: HistoryEntry = { ...entry, id: randomUUID(), timestamp: Date.now() }
  const entries = [full, ...store.get('entries')].slice(0, MAX_ENTRIES)
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
