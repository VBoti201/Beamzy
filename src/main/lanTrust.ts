import Store from 'electron-store'

// Devices on the LAN don't need a pairing code — mDNS just finds them —
// but that also means anyone else on the same WiFi/router broadcasting the
// Beamzy discovery service would otherwise show up and be able to browse/upload
// with zero confirmation. This tracks which discovered deviceIds have been
// explicitly accepted, independent of the relay's code-based trust.
const store = new Store<{ approved: string[] }>({
  name: 'lan-trust',
  defaults: { approved: [] }
})

export function isLanDeviceApproved(deviceId: string): boolean {
  return store.get('approved').includes(deviceId)
}

export function approveLanDevice(deviceId: string): void {
  const approved = store.get('approved')
  if (!approved.includes(deviceId)) store.set('approved', [...approved, deviceId])
}

export function forgetLanDevice(deviceId: string): void {
  store.set(
    'approved',
    store.get('approved').filter((id) => id !== deviceId)
  )
}
