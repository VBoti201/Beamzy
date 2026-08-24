import https from 'https'

// Cloudflare's public speed-test endpoints — no auth, no account, just a
// plain download/upload of N bytes. Good enough for a rough "how fast is
// my internet" reading without needing to run any infrastructure of our
// own for it.
const TEST_BYTES = 15_000_000 // 15MB — stable enough reading without a long wait

function downloadTest(bytes: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    let received = 0
    https
      .get(`https://speed.cloudflare.com/__down?bytes=${bytes}`, (res) => {
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
        })
        res.on('end', () => {
          const seconds = (Date.now() - start) / 1000
          resolve((received * 8) / seconds / 1_000_000)
        })
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

function uploadTest(bytes: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.alloc(bytes)
    const start = Date.now()
    const req = https.request(
      {
        hostname: 'speed.cloudflare.com',
        path: '/__up',
        method: 'POST',
        headers: { 'Content-Length': payload.length, 'Content-Type': 'application/octet-stream' }
      },
      (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          const seconds = (Date.now() - start) / 1000
          resolve((payload.length * 8) / seconds / 1_000_000)
        })
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.end(payload)
  })
}

export async function runSpeedTest(): Promise<{ downloadMbps: number; uploadMbps: number }> {
  const [downloadMbps, uploadMbps] = await Promise.all([downloadTest(TEST_BYTES), uploadTest(TEST_BYTES)])
  return { downloadMbps, uploadMbps }
}
