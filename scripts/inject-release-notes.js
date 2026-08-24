// Stamps the electron-updater feed yml with this build's commit message as
// releaseNotes, so the app can show "what changed" alongside the version
// and release date (electron-updater already reads releaseDate/releaseNotes
// straight off this file — no extra plumbing needed on the client side).
const fs = require('fs')
const yaml = require('js-yaml')

const [, , ymlPath, notes] = process.argv
if (!ymlPath || notes === undefined) {
  console.error('Usage: node inject-release-notes.js <yml-path> <notes>')
  process.exit(1)
}

const doc = yaml.load(fs.readFileSync(ymlPath, 'utf8'))
doc.releaseNotes = notes
fs.writeFileSync(ymlPath, yaml.dump(doc))
