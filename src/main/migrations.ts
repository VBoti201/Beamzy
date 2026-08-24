import Store from 'electron-store'

// One-shot migration flags, checked once at startup and never exposed to
// the renderer — separate from AppConfig so a migration marker never
// accidentally round-trips through config:get/config:update.
const store = new Store<{ relayCodePerDevice: boolean }>({
  name: 'migrations',
  defaults: { relayCodePerDevice: false }
})

// Before this, pairing worked by one device overwriting its own code to
// match the other's, so an already-paired pair of devices has the SAME
// pairId stored locally. Under the new per-device-permanent-code model
// that would make both devices claim the same identity and collide at the
// relay (whichever connects second gets rejected). Each device silently
// mints itself a fresh, unique code exactly once after updating, so the
// two ends of an old pairing come out with distinct codes and the user
// just re-pairs them via "Connect to a device" afterward.
export function needsRelayCodeMigration(): boolean {
  return !store.get('relayCodePerDevice')
}

export function markRelayCodeMigrated(): void {
  store.set('relayCodePerDevice', true)
}
