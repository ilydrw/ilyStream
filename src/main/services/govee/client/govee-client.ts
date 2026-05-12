import log from 'electron-log'

export class GoveeClient {
  private apiKey: string | null = null

  setApiKey(key: string) {
    this.apiKey = key
  }

  async fetchCloudDevices(): Promise<any[]> {
    if (!this.apiKey) return []
    const res = await fetch('https://developer-api.govee.com/v1/devices', {
      headers: { 'Govee-API-Key': this.apiKey }
    })
    if (!res.ok) throw new Error(`Cloud API failed: ${res.status}`)
    const data = await res.json()
    return data.data?.devices || []
  }

  async controlDevice(deviceId: string, model: string, cmd: any): Promise<void> {
    if (!this.apiKey) return
    await fetch('https://developer-api.govee.com/v1/devices/control', {
      method: 'PUT',
      headers: { 'Govee-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: deviceId, model, cmd })
    })
  }
}
