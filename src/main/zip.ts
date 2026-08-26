import fs from 'fs'
import { app } from 'electron'
import path from 'path'

// Sending a folder isn't supported by the transfer protocol (it moves one
// file at a time) — so a dropped directory gets zipped into a temp file
// first, and that zip is sent instead.
//
// Streamed via archiver rather than adm-zip: adm-zip builds the whole
// archive in memory and writes it out synchronously, which both blocks the
// entire main process (freezing all IPC and every other in-flight transfer)
// and can spike memory heavily for a folder with large files in it.
// archiver reads and compresses incrementally, so neither happens.
//
// archiver ships as an ESM-only package (package.json "type": "module",
// no CJS entry) while this main process bundle is CommonJS — a top-level
// `import`/`require` of it gets compiled to a plain require() that throws
// ERR_REQUIRE_ESM the instant the app launches, before any window is even
// created (crashes on every platform, not just some). A dynamic import()
// works from CommonJS regardless, so it's loaded lazily here instead, only
// when a folder actually needs zipping.
export async function zipDirectory(dirPath: string): Promise<string> {
  const { ZipArchive } = await import('archiver')
  return new Promise((resolve, reject) => {
    const name = path.basename(dirPath)
    const dest = path.join(app.getPath('temp'), `${name}-${Date.now()}.zip`)
    const output = fs.createWriteStream(dest)
    const archive = new ZipArchive()

    output.on('close', () => resolve(dest))
    output.on('error', reject)
    archive.on('error', reject)

    archive.pipe(output)
    archive.directory(dirPath, false)
    archive.finalize()
  })
}
