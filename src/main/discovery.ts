import { Bonjour } from 'bonjour-service'

export interface PeerInfo {
  id: string
  name: string
  host: string
  port: number
  addresses: string[]
  platform: string
}

type PeersChangedHandler = (peers: PeerInfo[]) => void

// Intentionally left as the original protocol identifier (not tied to the
// app's display name) — changing it would break LAN discovery between
// devices that haven't updated at the same moment.
const SERVICE_TYPE = 'swiftsend'

export class Discovery {
  private bonjour = new Bonjour()
  private peers = new Map<string, PeerInfo>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private browser: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private published: any
  private onChange: PeersChangedHandler

  constructor(onChange: PeersChangedHandler) {
    this.onChange = onChange
  }

  start(deviceId: string, deviceName: string, port: number): void {
    this.published = this.bonjour.publish({
      name: `Beamzy-${deviceId}`,
      type: SERVICE_TYPE,
      port,
      txt: { id: deviceId, name: deviceName, platform: process.platform }
    })

    this.browser = this.bonjour.find({ type: SERVICE_TYPE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.browser.on('up', (service: any) => this.handleUp(service, deviceId))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.browser.on('down', (service: any) => this.handleDown(service, deviceId))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleUp(service: any, selfId: string): void {
    const id = service.txt?.id as string | undefined
    if (!id || id === selfId) return
    const addresses: string[] = (service.addresses || []).filter((a: string) => a.includes('.'))
    this.peers.set(id, {
      id,
      name: (service.txt?.name as string) || service.name,
      host: addresses[0] || service.host,
      port: service.port,
      addresses,
      platform: (service.txt?.platform as string) || ''
    })
    this.emit()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleDown(service: any, selfId: string): void {
    const id = service.txt?.id as string | undefined
    if (!id || id === selfId) return
    this.peers.delete(id)
    this.emit()
  }

  private emit(): void {
    this.onChange(Array.from(this.peers.values()))
  }

  updateName(name: string): void {
    if (this.published) this.published.txt = { ...this.published.txt, name }
  }

  stop(): void {
    this.browser?.stop?.()
    this.bonjour.unpublishAll(() => this.bonjour.destroy())
  }
}
