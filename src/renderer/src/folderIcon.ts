import desktop from './assets/folders/desktop.svg'
import disk from './assets/folders/disk.svg'
import documents from './assets/folders/documents.svg'
import downloads from './assets/folders/downloads.svg'
import music from './assets/folders/music.svg'
import pictures from './assets/folders/pictures.svg'
import videos from './assets/folders/videos.svg'

const byName: Record<string, string> = {
  desktop,
  documents,
  downloads,
  music,
  pictures,
  videos
}

export function folderIconFor(name: string, isDrive = false): string {
  const key = name.trim().toLowerCase()
  if (byName[key]) return byName[key]
  if (isDrive) return disk
  return documents
}

export { desktop, disk, documents, downloads, music, pictures, videos }
