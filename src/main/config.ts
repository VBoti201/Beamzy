import Store from 'electron-store'
import { randomUUID } from 'crypto'
import { DEFAULT_RELAY_URL } from './constants'

export interface SharedFolder {
  id: string
  name: string
  path: string
  allowBrowse: boolean
  allowUpload: boolean
  allowDownload: boolean
}

export interface RelayConfig {
  enabled: boolean
  url: string
  pairId: string
}

// A folder's allowBrowse/allowUpload are the default for every device.
// An entry here overrides that default for one specific (deviceId,
// folderId) pair — e.g. sharing "Downloads" with everyone but denying one
// particular device upload access to it.
export interface DevicePermission {
  deviceId: string
  folderId: string
  allowBrowse: boolean
  allowUpload: boolean
  allowDownload: boolean
}

export interface AppConfig {
  deviceId: string
  deviceName: string
  onboarded: boolean
  sharedFolders: SharedFolder[]
  relay: RelayConfig
  devicePermissions: DevicePermission[]
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
    relay: { enabled: true, url: DEFAULT_RELAY_URL, pairId: '' },
    devicePermissions: []
  }
})

export function getConfig(): AppConfig {
  return {
    deviceId: store.get('deviceId'),
    deviceName: store.get('deviceName'),
    onboarded: store.get('onboarded'),
    sharedFolders: store.get('sharedFolders'),
    relay: store.get('relay'),
    devicePermissions: store.get('devicePermissions', [])
  }
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  if (partial.deviceName !== undefined) store.set('deviceName', partial.deviceName)
  if (partial.onboarded !== undefined) store.set('onboarded', partial.onboarded)
  if (partial.sharedFolders !== undefined) store.set('sharedFolders', partial.sharedFolders)
  if (partial.relay !== undefined) store.set('relay', partial.relay)
  if (partial.devicePermissions !== undefined) store.set('devicePermissions', partial.devicePermissions)
  return getConfig()
}

// Resolves what a given device may actually do with a folder: its
// per-device override if one exists, otherwise the folder's own default.
export function effectivePermission(
  cfg: AppConfig,
  deviceId: string,
  folderId: string
): { allowBrowse: boolean; allowUpload: boolean; allowDownload: boolean } | null {
  const folder = cfg.sharedFolders.find((f) => f.id === folderId)
  if (!folder) return null
  const override = cfg.devicePermissions.find((p) => p.deviceId === deviceId && p.folderId === folderId)
  // allowDownload was added after allowBrowse/allowUpload — folders and
  // overrides persisted before that (electron-store on disk) won't have it
  // set, so treat "missing" as "on" rather than silently locking out
  // downloads that used to just work.
  return override
    ? { allowBrowse: override.allowBrowse, allowUpload: override.allowUpload, allowDownload: override.allowDownload !== false }
    : { allowBrowse: folder.allowBrowse, allowUpload: folder.allowUpload, allowDownload: folder.allowDownload !== false }
}

export function setDevicePermission(
  deviceId: string,
  folderId: string,
  allowBrowse: boolean,
  allowUpload: boolean,
  allowDownload: boolean
): AppConfig {
  const cfg = getConfig()
  const rest = cfg.devicePermissions.filter((p) => !(p.deviceId === deviceId && p.folderId === folderId))
  return updateConfig({ devicePermissions: [...rest, { deviceId, folderId, allowBrowse, allowUpload, allowDownload }] })
}

export function clearDevicePermission(deviceId: string, folderId: string): AppConfig {
  const cfg = getConfig()
  return updateConfig({
    devicePermissions: cfg.devicePermissions.filter((p) => !(p.deviceId === deviceId && p.folderId === folderId))
  })
}
