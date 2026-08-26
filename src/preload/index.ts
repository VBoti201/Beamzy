import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  isDirectory: (p: string): Promise<boolean> => ipcRenderer.invoke('fs:is-directory', { path: p }),
  zipDirectory: (p: string): Promise<string> => ipcRenderer.invoke('fs:zip-directory', { path: p }),
  deleteFile: (p: string): Promise<void> => ipcRenderer.invoke('fs:delete-file', { path: p }),
  getConfig: () => ipcRenderer.invoke('config:get'),
  getInitialTheme: (): 'dark' | 'light' => ipcRenderer.sendSync('config:get-theme-sync'),
  getHostname: () => ipcRenderer.invoke('system:hostname'),
  getDrives: () => ipcRenderer.invoke('system:drives'),
  getDiskSpace: () => ipcRenderer.invoke('system:disk-space'),
  updateConfig: (partial: unknown) => ipcRenderer.invoke('config:update', partial),
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  getPeers: () => ipcRenderer.invoke('peers:get'),
  remoteList: (args: unknown) => ipcRenderer.invoke('remote:list', args),
  remoteTargets: (args: unknown) => ipcRenderer.invoke('remote:targets', args),
  pushFiles: (args: unknown) => ipcRenderer.invoke('transfer:push', args),
  pullFile: (args: unknown) => ipcRenderer.invoke('transfer:pull', args),
  transferCancel: (args: unknown) => ipcRenderer.invoke('transfer:cancel', args),
  permissionsGet: (args: unknown) => ipcRenderer.invoke('permissions:get', args),
  permissionsSet: (args: unknown) => ipcRenderer.invoke('permissions:set', args),
  permissionsClear: (args: unknown) => ipcRenderer.invoke('permissions:clear', args),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  relaySetEnabled: (args: unknown) => ipcRenderer.invoke('relay:set-enabled', args),
  relayPair: (args: unknown) => ipcRenderer.invoke('relay:pair', args),
  relayList: (args: unknown) => ipcRenderer.invoke('relay:list', args),
  relayTargets: (args: unknown) => ipcRenderer.invoke('relay:targets', args),
  relayPush: (args: unknown) => ipcRenderer.invoke('relay:push', args),
  relayPull: (args: unknown) => ipcRenderer.invoke('relay:pull', args),
  historyGet: () => ipcRenderer.invoke('history:get'),
  historyRemove: (args: unknown) => ipcRenderer.invoke('history:remove', args),
  historyOpen: (args: unknown) => ipcRenderer.invoke('history:open', args),
  onHistoryUpdate: (cb: (entries: unknown[]) => void) => {
    const listener = (_e: unknown, entries: unknown[]): void => cb(entries)
    ipcRenderer.on('history:update', listener)
    return () => ipcRenderer.removeListener('history:update', listener)
  },
  relayApprovePairing: (args: unknown) => ipcRenderer.invoke('relay:pairing-approve', args),
  relayRejectPairing: (args: unknown) => ipcRenderer.invoke('relay:pairing-reject', args),
  relayKickDevice: (args: unknown) => ipcRenderer.invoke('relay:kick-device', args),
  onPairingRequest: (cb: (req: unknown) => void) => {
    const listener = (_e: unknown, req: unknown): void => cb(req)
    ipcRenderer.on('relay:pairing-request', listener)
    return () => ipcRenderer.removeListener('relay:pairing-request', listener)
  },
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  getAppVersion: () => ipcRenderer.invoke('update:get-version'),
  onUpdateStatus: (cb: (status: unknown) => void) => {
    const listener = (_e: unknown, status: unknown): void => cb(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },
  onRelayPeersUpdate: (cb: (peers: unknown[]) => void) => {
    const listener = (_e: unknown, peers: unknown[]): void => cb(peers)
    ipcRenderer.on('relay:peers-update', listener)
    return () => ipcRenderer.removeListener('relay:peers-update', listener)
  },
  onRelayStatusUpdate: (cb: (status: string) => void) => {
    const listener = (_e: unknown, status: string): void => cb(status)
    ipcRenderer.on('relay:status-update', listener)
    return () => ipcRenderer.removeListener('relay:status-update', listener)
  },
  onAppReady: (cb: (data: unknown) => void) => {
    const listener = (_e: unknown, data: unknown): void => cb(data)
    ipcRenderer.on('app:ready', listener)
    return () => ipcRenderer.removeListener('app:ready', listener)
  },
  onPeersUpdate: (cb: (peers: unknown[]) => void) => {
    const listener = (_e: unknown, peers: unknown[]): void => cb(peers)
    ipcRenderer.on('peers:update', listener)
    return () => ipcRenderer.removeListener('peers:update', listener)
  },
  onTransferProgress: (cb: (p: unknown) => void) => {
    const listener = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('transfer:progress', listener)
    return () => ipcRenderer.removeListener('transfer:progress', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
