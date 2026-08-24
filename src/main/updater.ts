import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

export interface UpdateStatus {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
  releaseNotes?: string
  releaseDate?: string
}

function notesOf(info: { releaseNotes?: string | { note?: string | null }[] | null }): string | undefined {
  if (typeof info.releaseNotes === 'string') return info.releaseNotes
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes
      .map((n) => n.note)
      .filter(Boolean)
      .join('\n')
  }
  return undefined
}

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

let getWindow: (() => BrowserWindow | null) | null = null
let listenersRegistered = false

function emit(status: UpdateStatus): void {
  const win = getWindow?.()
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
}

function registerListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true

  autoUpdater.autoDownload = true
  // If the app's UI is ever broken (e.g. a bad renderer/preload build), the
  // user can't click "Restart & Install" — but simply quitting the app
  // should still pick up whatever update already finished downloading, so
  // a bad release doesn't get stuck forever.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    emit({ state: 'available', version: info.version, releaseNotes: notesOf(info), releaseDate: info.releaseDate })
  )
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    emit({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit({ state: 'downloaded', version: info.version, releaseNotes: notesOf(info), releaseDate: info.releaseDate })
  )
  autoUpdater.on('error', (err) => emit({ state: 'error', message: err.message }))
}

export function startAutoUpdater(windowGetter: () => BrowserWindow | null): void {
  getWindow = windowGetter

  if (!app.isPackaged) {
    // electron-updater has nothing to check against in dev (no packaged
    // app, no update feed) — skip the automatic background checks. Manual
    // checks (checkForUpdatesNow) still respond, just with a friendly error.
    return
  }

  registerListeners()
  // Give the app a moment to settle before the first check.
  setTimeout(checkForUpdatesNow, 5000)
  setInterval(checkForUpdatesNow, CHECK_INTERVAL_MS)
}

export function checkForUpdatesNow(): void {
  if (!app.isPackaged) {
    emit({ state: 'error', message: 'Updates only work in an installed build, not in dev mode.' })
    return
  }
  registerListeners()
  autoUpdater.checkForUpdates().catch((err) => emit({ state: 'error', message: err.message }))
}

export function installUpdateNow(): void {
  autoUpdater.quitAndInstall()
}
