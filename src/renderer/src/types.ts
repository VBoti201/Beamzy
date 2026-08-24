export interface SharedFolder {
  id: string
  name: string
  path: string
  allowBrowse: boolean
  allowUpload: boolean
}

export interface RelayConfig {
  enabled: boolean
  url: string
  pairId: string
}

export interface AppConfig {
  deviceId: string
  deviceName: string
  onboarded: boolean
  sharedFolders: SharedFolder[]
  relay: RelayConfig
}

export interface DriveInfo {
  name: string
  path: string
  isPrimary: boolean
}

export interface LanPeer {
  id: string
  name: string
  host: string
  port: number
  addresses: string[]
  platform: string
}

export interface RelayPeer {
  deviceId: string
  name: string
  platform?: string
}

export interface PeerInfo {
  id: string
  name: string
  transport: 'lan' | 'relay'
  host?: string
  port?: number
  addresses?: string[]
  platform?: string
}

export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface RemoteEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  id?: string
  isRoot?: boolean
}

export interface TransferProgress {
  transferId: string
  fileName: string
  bytesTransferred: number
  totalBytes: number
  direction: 'push' | 'pull'
  done?: boolean
  error?: string
}

export interface PairingRequest {
  requestId: string
  deviceId: string
  name: string
  platform?: string
  source: 'lan' | 'relay'
}

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

export interface UpdateStatus {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
  releaseNotes?: string
  releaseDate?: string
}
