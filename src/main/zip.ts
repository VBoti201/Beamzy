import AdmZip from 'adm-zip'
import { app } from 'electron'
import path from 'path'

// Sending a folder isn't supported by the transfer protocol (it moves one
// file at a time) — so a dropped directory gets zipped into a temp file
// first, and that zip is sent instead.
export function zipDirectory(dirPath: string): string {
  const zip = new AdmZip()
  zip.addLocalFolder(dirPath)
  const name = path.basename(dirPath)
  const dest = path.join(app.getPath('temp'), `${name}-${Date.now()}.zip`)
  zip.writeZip(dest)
  return dest
}
