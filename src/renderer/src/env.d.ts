export {}

declare global {
  interface Window {
    api: {
      getConfig: () => Promise<import('./types').AppConfig>
      getHostname: () => Promise<string>
      getDrives: () => Promise<import('./types').DriveInfo[]>
      updateConfig: (partial: Partial<import('./types').AppConfig>) => Promise<import('./types').AppConfig>
      chooseFolder: () => Promise<string | null>
      pickFiles: () => Promise<string[]>
      getPeers: () => Promise<import('./types').LanPeer[]>
      remoteList: (args: {
        host: string
        port: number
        folderId: string | null
        path: string
      }) => Promise<import('./types').RemoteEntry[]>
      remoteTargets: (args: { host: string; port: number }) => Promise<{ id: string; name: string }[]>
      pushFiles: (args: {
        host: string
        port: number
        folderId: string
        destRelPath: string
        localFilePaths: string[]
      }) => Promise<boolean>
      pullFile: (args: {
        host: string
        port: number
        folderId: string
        remoteRelPath: string
        destFolderId: string
      }) => Promise<boolean>
      getPathForFile: (file: File) => string
      relaySetEnabled: (args: { enabled: boolean; url: string }) => Promise<import('./types').RelayConfig>
      relayRegenerateCode: () => Promise<import('./types').RelayConfig>
      relayPair: (args: { code: string }) => Promise<import('./types').RelayConfig>
      relayList: (args: {
        peerId: string
        folderId: string | null
        path: string
      }) => Promise<import('./types').RemoteEntry[]>
      relayTargets: (args: { peerId: string }) => Promise<{ id: string; name: string }[]>
      relayPush: (args: {
        peerId: string
        folderId: string
        destRelPath: string
        localFilePaths: string[]
      }) => Promise<void>
      relayPull: (args: {
        peerId: string
        folderId: string
        remoteRelPath: string
        destFolderId: string
      }) => Promise<void>
      historyGet: () => Promise<import('./types').HistoryEntry[]>
      historyRemove: (args: { id: string }) => Promise<import('./types').HistoryEntry[]>
      historyOpen: (args: { filePath: string }) => Promise<string>
      onHistoryUpdate: (cb: (entries: import('./types').HistoryEntry[]) => void) => () => void
      relayApprovePairing: (args: { requestId: string }) => Promise<void>
      relayRejectPairing: (args: { requestId: string }) => Promise<void>
      relayKickDevice: (args: { deviceId: string }) => Promise<void>
      speedTestRun: () => Promise<{ downloadMbps: number; uploadMbps: number }>
      onPairingRequest: (cb: (req: import('./types').PairingRequest) => void) => () => void
      onAppReady: (cb: (data: unknown) => void) => () => void
      onPeersUpdate: (cb: (peers: import('./types').LanPeer[]) => void) => () => void
      onRelayPeersUpdate: (cb: (peers: import('./types').RelayPeer[]) => void) => () => void
      onRelayStatusUpdate: (cb: (status: import('./types').RelayStatus) => void) => () => void
      onTransferProgress: (cb: (p: import('./types').TransferProgress) => void) => () => void
      installUpdate: () => Promise<void>
      checkForUpdates: () => Promise<void>
      getAppVersion: () => Promise<string>
      onUpdateStatus: (cb: (status: import('./types').UpdateStatus) => void) => () => void
    }
  }
}
