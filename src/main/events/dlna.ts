import { Client } from 'node-ssdp'
import MediaRendererClient from 'upnp-mediarenderer-client'
import { ipcMain } from 'electron'
import axios from 'axios'
import * as http from 'http'
import * as https from 'https'
import * as fs from 'fs'
import { networkInterfaces } from 'os'
import { fileURLToPath } from 'url'

let ssdpClient: Client | null = null
const devices: Record<string, any> = {}
let currentClient: any = null
let localServer: http.Server | null = null
let localServerPort = 0
let currentLocalFile = ''
let currentProxyUrl = ''

function getLocalIp() {
  const interfaces = networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function startLocalServer() {
  if (localServer) return

  localServer = http.createServer((req, res) => {
    // If it's a proxy request for a localhost URL
    if (currentProxyUrl) {
      const client = currentProxyUrl.startsWith('https') ? https : http

      const proxyHeaders = { ...req.headers }
      delete proxyHeaders.host // Let the client set the correct Host header

      const options = {
        method: req.method,
        headers: proxyHeaders
      }

      const proxyReq = client.request(currentProxyUrl, options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers)
        proxyRes.pipe(res)
      })

      proxyReq.on('error', (err) => {
        console.error('DLNA Proxy Error:', err)
        if (!res.headersSent) {
          res.writeHead(500)
          res.end('Proxy Error')
        }
      })

      req.pipe(proxyReq)
      return
    }

    // Otherwise serve local file
    if (!currentLocalFile || !fs.existsSync(currentLocalFile)) {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const stat = fs.statSync(currentLocalFile)
    const total = stat.size

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes'
      })
      res.end()
      return
    }

    if (req.headers.range) {
      const range = req.headers.range
      const parts = range.replace(/bytes=/, '').split('-')
      const partialstart = parts[0]
      const partialend = parts[1]

      const start = parseInt(partialstart, 10)
      const end = partialend ? parseInt(partialend, 10) : total - 1
      const chunksize = end - start + 1
      const file = fs.createReadStream(currentLocalFile, { start, end })

      res.writeHead(206, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg'
      })
      file.pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': 'audio/mpeg'
      })
      fs.createReadStream(currentLocalFile).pipe(res)
    }
  })

  localServer.listen(0, '0.0.0.0', () => {
    localServerPort = (localServer?.address() as any).port
  })
}

export function initDlnaService() {
  startLocalServer()

  ipcMain.handle('dlna:startSearch', () => {
    if (ssdpClient) {
      ssdpClient.stop()
      ssdpClient = null
    }

    ssdpClient = new Client()

    ssdpClient.on('response', async (headers: any, statusCode: number, rinfo: any) => {
      if (statusCode === 200) {
        const usn = headers.USN
        if (!usn || devices[usn]) return

        const location = headers.LOCATION
        if (!location) return

        let name = headers.SERVER || rinfo.address
        try {
          const res = await axios.get(location)
          const match = res.data.match(/<friendlyName>(.*?)<\/friendlyName>/)
          if (match && match[1]) {
            name = match[1]
          }
        } catch (e) {
          console.error('Failed to get friendly name for DLNA device', location)
        }

        devices[usn] = {
          usn,
          location,
          address: rinfo.address,
          name,
        }
      }
    })

    ssdpClient.search('urn:schemas-upnp-org:device:MediaRenderer:1')
    return true
  })

  ipcMain.handle('dlna:stopSearch', () => {
    if (ssdpClient) {
      ssdpClient.stop()
      ssdpClient = null
    }
    return true
  })

  ipcMain.handle('dlna:getDevices', () => {
    return Object.values(devices)
  })

  ipcMain.handle('dlna:play', async (_, { url, location }) => {
    return new Promise((resolve) => {
      if (currentClient) {
        currentClient.stop()
      }

      currentClient = new MediaRendererClient(location)

      let playUrl = url
      currentProxyUrl = ''
      currentLocalFile = ''

      if (url.startsWith('file://')) {
        try {
          currentLocalFile = fileURLToPath(url)
        } catch (e) {
          currentLocalFile = decodeURIComponent(url.replace(/^file:\/{2,3}/, ''))
        }
        playUrl = `http://${getLocalIp()}:${localServerPort}/audio.mp3`
      } else if (!url.startsWith('http')) {
        currentLocalFile = url
        playUrl = `http://${getLocalIp()}:${localServerPort}/audio.mp3`
      } else if (url.includes('127.0.0.1') || url.includes('localhost')) {
        currentProxyUrl = url
        playUrl = `http://${getLocalIp()}:${localServerPort}/audio.mp3`
      }

      const options = {
        autoplay: true,
        contentType: 'audio/mpeg'
      }

      currentClient.load(playUrl, options, (err: any) => {
        if (err) {
          console.error('DLNA load error', err)
          // Some TVs respond with error but still play successfully. We resolve anyway.
          resolve(true)
        } else {
          resolve(true)
        }
      })
    })
  })

  ipcMain.handle('dlna:pause', async () => {
    return new Promise((resolve, reject) => {
      if (!currentClient) return resolve(false)
      currentClient.pause((err: any) => {
        if (err) reject(err)
        else resolve(true)
      })
    })
  })

  ipcMain.handle('dlna:resume', async () => {
    return new Promise((resolve, reject) => {
      if (!currentClient) return resolve(false)
      currentClient.play((err: any) => {
        if (err) reject(err)
        else resolve(true)
      })
    })
  })

  ipcMain.handle('dlna:stop', async () => {
    return new Promise((resolve, reject) => {
      if (!currentClient) return resolve(false)
      currentClient.stop((err: any) => {
        if (err) reject(err)
        else resolve(true)
      })
    })
  })

  ipcMain.handle('dlna:seek', async (_, seconds: number) => {
    return new Promise((resolve) => {
      if (!currentClient) return resolve(false)
      currentClient.seek(seconds, (err: any) => {
        if (err) {
          console.error('DLNA seek error', err)
          // Some TVs don't support seek or throw error but still seek, resolve true anyway
          resolve(true)
        } else {
          resolve(true)
        }
      })
    })
  })

  ipcMain.handle('dlna:getVolume', async () => {
    return new Promise((resolve, reject) => {
      if (!currentClient) return resolve(100)
      currentClient.getVolume((err: any, volume: number) => {
        if (err) reject(err)
        else resolve(volume)
      })
    })
  })

  ipcMain.handle('dlna:setVolume', async (_, volume: number) => {
    return new Promise((resolve, reject) => {
      if (!currentClient) return resolve(false)
      currentClient.setVolume(volume, (err: any) => {
        if (err) reject(err)
        else resolve(true)
      })
    })
  })

  ipcMain.handle('dlna:getPosition', async () => {
    return new Promise((resolve, reject) => {
      if (!currentClient) return resolve(0)
      currentClient.getPosition((err: any, position: number) => {
        if (err) reject(err)
        else resolve(position)
      })
    })
  })
}
