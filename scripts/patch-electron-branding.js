// Dev-only cosmetic fix: the local Electron.app binary always shows "Electron" in the
// macOS menu bar and dock while running unpackaged (`npm run dev`), regardless of
// app.setName(). This patches the local copy's Info.plist so it reads "Beamzy"
// instead. Packaged builds (electron-builder) already get the correct name/icon and
// don't need this. Safe to re-run; re-applies itself after every `npm install`.
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

if (process.platform !== 'darwin') process.exit(0)

const bundleDir = path.join(__dirname, '..', 'node_modules/electron/dist/Electron.app')
const plistPath = path.join(bundleDir, 'Contents/Info.plist')
const bundledIconPath = path.join(bundleDir, 'Contents/Resources/electron.icns')
const ourIconPath = path.join(__dirname, '..', 'build/icon.icns')
if (!fs.existsSync(plistPath)) process.exit(0)

try {
  execSync(`plutil -replace CFBundleName -string "Beamzy" "${plistPath}"`)
  execSync(`plutil -replace CFBundleDisplayName -string "Beamzy" "${plistPath}"`)
  // Every unpackaged Electron dev app shares the generic "com.github.Electron" bundle id, so
  // macOS's IconServices/LaunchServices caches (keyed by bundle id, not by path) can bleed in
  // stale name/icon data from any other Electron-based dev tool on this machine. Giving this
  // dev build its own identifier avoids that collision entirely.
  execSync(`plutil -replace CFBundleIdentifier -string "com.beamzy.dev" "${plistPath}"`)
  if (fs.existsSync(ourIconPath)) {
    fs.copyFileSync(ourIconPath, bundledIconPath)
  }
  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
  execSync(`"${lsregister}" -f "${bundleDir}"`)
  try {
    fs.rmSync(path.join(require('os').homedir(), 'Library/Caches/com.apple.iconservices.store'), {
      recursive: true,
      force: true
    })
  } catch {
    // best-effort
  }
  execSync('touch "' + bundleDir + '"')
  console.log('[patch-electron-branding] Dev Electron.app renamed + re-iconed as "Beamzy" (unique bundle id).')
} catch (err) {
  console.warn('[patch-electron-branding] Skipped:', err.message)
}
