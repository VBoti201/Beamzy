import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { DEFAULT_RELAY_URL } from './constants'

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

const store = new Store<AppConfig>({
  defaults: {
    deviceId: randomUUID(),
    deviceName: '',
    onboarded: false,
    sharedFolders: [],
    // On by default: the relay is a shared backend service (one deployment
    // serves every pair of end-user devices, isolated by pairId), not
    // something each user has to run themselves — so remote access should
    // just work out of the box, no Settings-diving required.
    relay: { enabled: true, url: DEFAULT_RELAY_URL, pairId: '' }
  }
})

export function getConfig(): AppConfig {
  return {
    deviceId: store.get('deviceId'),
    deviceName: store.get('deviceName'),
    onboarded: store.get('onboarded'),
    sharedFolders: store.get('sharedFolders'),
    relay: store.get('relay')
  }
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  if (partial.deviceName !== undefined) store.set('deviceName', partial.deviceName)
  if (partial.onboarded !== undefined) store.set('onboarded', partial.onboarded)
  if (partial.sharedFolders !== undefined) store.set('sharedFolders', partial.sharedFolders)
  if (partial.relay !== undefined) store.set('relay', partial.relay)
  return getConfig()
}
