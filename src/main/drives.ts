import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'

export interface DriveInfo {
  name: string
  path: string
  isPrimary: boolean
}

function getMacVolumeName(volumePath: string): string | null {
  try {
    const output = execSync(`diskutil info ${JSON.stringify(volumePath)}`, { timeout: 3000 }).toString()
    const match = output.match(/Volume Name:\s*(.+)/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

function getDrivesMac(): DriveInfo[] {
  const drives: DriveInfo[] = [
    { name: getMacVolumeName('/') || 'Macintosh HD', path: '/', isPrimary: true }
  ]

  try {
    const entries = fs.readdirSync('/Volumes')
    for (const entry of entries) {
      if (entry === 'Recovery') continue
      const volumePath = path.join('/Volumes', entry)
      let real: string
      try {
        real = fs.realpathSync(volumePath)
      } catch {
        continue
      }
      if (real === '/') continue
      drives.push({ name: entry, path: volumePath, isPrimary: false })
    }
  } catch {
    // /Volumes not readable, ignore
  }

  return drives
}

function getDrivesWindows(): DriveInfo[] {
  const systemDrive = (process.env.SystemDrive || 'C:').toUpperCase()
  const drives: DriveInfo[] = []
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code)
    const drivePath = `${letter}:\\`
    if (fs.existsSync(drivePath)) {
      drives.push({ name: `${letter}:`, path: drivePath, isPrimary: `${letter}:` === systemDrive })
    }
  }
  drives.sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1))
  return drives
}

export function getDrives(): DriveInfo[] {
  if (process.platform === 'darwin') return getDrivesMac()
  if (process.platform === 'win32') return getDrivesWindows()
  return [{ name: os.hostname(), path: '/', isPrimary: true }]
}
