import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { _electron as electron } from 'playwright'

// Run after yarn build. All database writes use a disposable profile.
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const directory = await mkdtemp(join(root, '.electron-runtime-'))
let application
try {
  const profile = join(directory, 'profile')
  await mkdir(profile)
  await build({
    stdin: {
      contents: `
        export { MusicDatabase } from './src/main/services/MusicDatabase'
        export { PlaylistDatabase } from './src/main/services/songList/PlaylistDatabase'
      `,
      resolveDir: root
    },
    outfile: join(directory, 'databases.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external'
  })
  const launcher = join(directory, 'launch.cjs')
  await writeFile(
    launcher,
    `
      const { app } = require('electron')
      app.setPath('userData', ${JSON.stringify(profile)})
      // Test startup must not replace the user's cerumusic:// registration.
      app.setAsDefaultProtocolClient = () => false
      globalThis.runtimeTestRequire = require
      require(${JSON.stringify(join(root, 'out/main/index.js'))})
    `
  )
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  application = await electron.launch({ args: [launcher], env, timeout: 30000 })
  const page = await application.firstWindow()
  await application.evaluate(({ BrowserWindow }) => {
    globalThis.runtimeTestMainId = BrowserWindow.getAllWindows().find(
      (w) => w.getBounds().width >= 1100
    ).webContents.id
  })
  const rendererErrors = []
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  await page.waitForFunction(
    () => !!window.api && !!document.querySelector('#app')?.children.length
  )

  const result = await application.evaluate(async ({ BrowserWindow, app, screen, ipcMain }) => {
    const assert = globalThis.runtimeTestRequire('node:assert/strict')
    const { MusicDatabase, PlaylistDatabase } = globalThis.runtimeTestRequire('./databases.cjs')
    const playlist = new PlaylistDatabase()
    const now = new Date().toISOString()
    playlist.insertPlaylist({
      id: 'upgrade-test',
      name: '升级测试歌单',
      description: '',
      coverImgUrl: '',
      source: 'local',
      meta: { preserved: true },
      createTime: now,
      updateTime: now
    })
    const songs = [1, 2].map((id) => ({
      songmid: String(id),
      name: `测试歌曲${id}`,
      singer: '测试歌手',
      albumName: '测试专辑',
      source: 'local',
      interval: '00:01',
      types: [],
      _types: {},
      typeUrl: {}
    }))
    assert.equal(playlist.appendSongs('upgrade-test', songs), 2)
    assert.equal(playlist.moveSong('upgrade-test', '2', 0), true)
    assert.deepEqual(
      playlist.listSongs('upgrade-test').map((s) => s.songmid),
      ['2', '1']
    )
    assert.equal(playlist.searchSongs('upgrade-test', '歌曲').length, 2)
    const reopened = new PlaylistDatabase()
    assert.equal(reopened.getPlaylist('upgrade-test').meta.preserved, true)
    assert.equal(reopened.countSongs('upgrade-test'), 2)
    assert.equal(reopened.removeSong('upgrade-test', '1'), true)
    reopened.deletePlaylist('upgrade-test')
    assert.equal(reopened.countSongs('upgrade-test'), 0)
    const music = new MusicDatabase()
    music.upsertTrack({
      songmid: 'runtime-test',
      path: 'test.wav',
      url: null,
      singer: '测试歌手',
      name: '测试歌曲',
      albumName: '',
      albumId: 0,
      source: 'local',
      interval: '00:01',
      hasCover: 0,
      coverKey: null,
      year: 2026,
      lrc: '[00:00]测试歌词',
      types: '[]',
      _types: '{}',
      typeUrl: '{}',
      bitrate: 128000,
      sampleRate: 44100,
      channels: 2,
      duration: 1,
      size: 10,
      mtime_ms: 1,
      hash: null,
      updated_at: Date.now()
    })
    music.setDirs(['test-music', 'test-music'])
    const reopenedMusic = new MusicDatabase()
    assert.equal(reopenedMusic.getTrackById('runtime-test').lrc, '[00:00]测试歌词')
    assert.deepEqual(reopenedMusic.getDirs(), ['test-music'])
    reopenedMusic.deleteBySongmid('runtime-test')

    const win = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.id === globalThis.runtimeTestMainId
    )
    function windowDecoration() {
      if (process.platform !== 'win32') return null
      const hwnd = win.getNativeWindowHandle().readBigUInt64LE().toString()
      const script = `
        Add-Type -TypeDefinition @'
        using System;
        using System.Runtime.InteropServices;
        public class WindowDecoration {
          [DllImport("dwmapi.dll")]
          public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
          [DllImport("user32.dll", EntryPoint="GetWindowLongW")]
          public static extern int GetWindowLong(IntPtr h, int i);
        }
'@
        $corner = 0
        $result = [WindowDecoration]::DwmGetWindowAttribute([IntPtr]${hwnd}, 33, [ref]$corner, 4)
        $style = [WindowDecoration]::GetWindowLong([IntPtr]${hwnd}, -16)
        @{ corner = $corner; result = $result; thickFrame = (($style -band 0x40000) -ne 0) } | ConvertTo-Json -Compress
      `
      return JSON.parse(
        globalThis
          .runtimeTestRequire('node:child_process')
          .execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            encoding: 'utf8',
            windowsHide: true
          })
      )
    }
    const pause = () => new Promise((resolve) => setTimeout(resolve, 200))
    async function toggle(key) {
      const event = win.isFullScreen() ? 'leave-full-screen' : 'enter-full-screen'
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out: ${event}`)), 5000)
        win.once(event, () => {
          clearTimeout(timer)
          resolve()
        })
      })
      if (key) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
      } else {
        ipcMain.emit('app-toggle-fullscreen-internal')
      }
      await done
      await pause()
    }
    await pause()
    const bounds = win.getBounds()
    const decoration = windowDecoration()
    if (decoration) {
      assert.equal(decoration.thickFrame, true, 'Native resizing frame must remain enabled')
      if (decoration.result === 0)
        assert.equal(decoration.corner, 2, 'Win11 rounded corners enabled')
    }
    const display = screen.getDisplayMatching(bounds)
    await toggle('F11')
    assert.equal(win.isFullScreen(), true)
    assert.deepEqual(win.getContentBounds(), display.bounds)
    assert.equal(win.isAlwaysOnTop(), false)
    await toggle('ESC')
    assert.deepEqual(win.getBounds(), bounds)
    win.maximize()
    await pause()
    await toggle()
    await toggle()
    assert.equal(win.isMaximized(), true)
    win.unmaximize()
    await pause()
    for (let i = 0; i < 2; i++) {
      await toggle()
      await toggle()
    }
    assert.deepEqual(win.getBounds(), bounds)
    assert.deepEqual(windowDecoration(), decoration, 'Window decoration restored after fullscreen')
    return {
      electron: process.versions.electron,
      node: process.versions.node,
      chromium: process.versions.chrome,
      sqlite: globalThis.runtimeTestRequire('better-sqlite3/package.json').version,
      decoration,
      nativeHandle: win.getNativeWindowHandle().readBigUInt64LE().toString(),
      fullscreen: display.bounds,
      profile: app.getPath('userData')
    }
  })

  const media = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    const audio = new Audio()
    audio.muted = true
    const buffer = new ArrayBuffer(44 + 44100 * 2)
    const view = new DataView(buffer)
    const text = (offset, value) =>
      [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
    text(0, 'RIFF')
    view.setUint32(4, buffer.byteLength - 8, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 44100, true)
    view.setUint32(28, 88200, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, buffer.byteLength - 44, true)
    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
    audio.src = url
    try {
      await audio.play()
      await new Promise((resolve) => setTimeout(resolve, 250))
      const clipboardText = await window.api.clipboard.readText()
      return { webgl2: !!gl, playing: audio.currentTime > 0, clipboardType: typeof clipboardText }
    } finally {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    }
  })
  assert.equal(media.playing, true)
  assert.equal(media.webgl2, true)
  assert.equal(media.clipboardType, 'string')
  assert.deepEqual(rendererErrors, [])
  // A rejected async read must still take the IPC handler's empty-string fallback.
  await application.evaluate(({ clipboard }) => {
    globalThis.runtimeTestReadText = clipboard.readText
    clipboard.readText = async () => {
      throw new Error('Simulated clipboard failure')
    }
  })
  try {
    assert.equal(await page.evaluate(() => window.api.clipboard.readText()), '')
  } finally {
    await application.evaluate(({ clipboard }) => {
      clipboard.readText = globalThis.runtimeTestReadText
    })
  }
  console.log(JSON.stringify({ ...result, ...media, rendererErrors }, null, 2))
} finally {
  if (application) {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => {})
    await application.close().catch(() => {})
  }
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
