import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { _electron as electron } from 'playwright'

const root = resolve('.')
await mkdir(join(root, '.tmp'), { recursive: true })
const directory = await mkdtemp(join(root, '.tmp', 'music-upgrade-ui-'))
const profile = join(directory, 'profile')
await mkdir(profile)
const song = JSON.parse(await readFile('scripts/fixtures/music-item-v1.json', 'utf8'))
const launcher = join(directory, 'launch.cjs')
await writeFile(
  launcher,
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});app.setAsDefaultProtocolClient=()=>false;require(${JSON.stringify(join(root, 'out/main/index.js'))});`
)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
let application
try {
  application = await electron.launch({ args: [launcher], env, timeout: 45000 })
  const page = await application.firstWindow()
  await page.waitForFunction(() => !!window.api && location.hash.includes('/home'), {
    timeout: 45000
  })
  // Seed only the isolated profile, then exercise the actual welcome -> repair sequence.
  await page.evaluate((song) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 20
    const context = canvas.getContext('2d')
    context.fillStyle = '#a03020'
    context.fillRect(0, 0, 20, 20)
    song.img = canvas.toDataURL()
    localStorage.clear()
    localStorage.setItem(
      'globalPlayStatus',
      JSON.stringify({ player: { songId: song.songmid, songInfo: song } })
    )
    localStorage.setItem('songList', JSON.stringify([song, { ...song, source: 'wy' }]))
    localStorage.setItem(
      'userInfo',
      JSON.stringify({ lastPlaySongId: song.songmid, currentTime: 42, volume: 80, hasGuide: true })
    )
    location.hash = '/'
    location.reload()
  }, song)
  await page.waitForLoadState('domcontentloaded')
  const prompt = page.getByText('发现旧版音乐数据，是否备份并修复？', { exact: true })
  await prompt.waitFor({ state: 'visible', timeout: 45000 })
  assert.ok(
    (await page.evaluate(() => location.hash)).startsWith('#/home'),
    'repair cannot interrupt welcome'
  )
  await page.getByRole('button', { name: '稍后', exact: true }).click()
  await prompt.waitFor({ state: 'hidden' })
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('globalPlayStatus')).schemaVersion),
    undefined
  )
  await page.reload()
  await prompt.waitFor({ state: 'visible', timeout: 45000 })
  await page.getByRole('button', { name: '立即修复', exact: true }).click()
  await page
    .getByText('本地音乐数据修复完成', { exact: true })
    .waitFor({ state: 'visible', timeout: 30000 })
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await page.waitForFunction(
    () => {
      const name = document.querySelector('.player-container .song-name')
      return name && getComputedStyle(name).color === 'rgb(255, 255, 255)'
    },
    { timeout: 10000 }
  )
  const state = await page.evaluate(() => ({
    status: JSON.parse(localStorage.getItem('globalPlayStatus')),
    queue: JSON.parse(localStorage.getItem('songList')),
    preferences: JSON.parse(localStorage.getItem('userInfo')),
    version: localStorage.getItem('ceru-music-data-version')
  }))
  assert.equal(state.version, '2')
  assert.equal(state.status.player.songInfo.interval, '03:59')
  assert.equal(state.status.player.songInfo.pluginResource, undefined)
  assert.equal(state.queue.length, 2)
  assert.equal(state.preferences.currentTime, 42)
  await page.reload()
  await page.waitForFunction(() => location.hash.startsWith('#/home'))
  await page.waitForTimeout(1200)
  assert.equal(await prompt.isVisible(), false, 'successful repair must not repeat')
  await page.waitForFunction(
    () => {
      const name = document.querySelector('.player-container .song-name')
      return name && getComputedStyle(name).color === 'rgb(255, 255, 255)'
    },
    { timeout: 10000 }
  )
  await page.screenshot({ path: join(root, '.tmp', 'music-upgrade-verified.png') })

  // Interrupt after the database phase, before browser storage has committed.
  const originals = await page.evaluate(() =>
    Object.fromEntries(
      [
        'globalPlayStatus',
        'songList',
        'userInfo',
        'ceru-plugin-playback-history-v1',
        'ceru-music-data-version'
      ].map((key) => [key, localStorage.getItem(key)])
    )
  )
  await page.evaluate(async (originals) => {
    await window.api.musicDataRepair.begin(originals, false)
    localStorage.setItem('songList', '[]')
    await window.api.musicDataRepair.rollback() // Simulate a second interruption before browser ack.
  }, originals)
  await page.reload()
  await page.waitForFunction(() => location.hash.startsWith('#/home'))
  await page.waitForTimeout(1200)
  assert.equal(await page.evaluate(() => localStorage.getItem('songList')), originals.songList)
  assert.equal((await page.evaluate(() => window.api.musicDataRepair.inspect())).pending, null)

  // A backup failure must leave the original data and migration version untouched.
  const repairDirectory = join(profile, 'music-data-repair')
  await rename(repairDirectory, repairDirectory + '-completed')
  await writeFile(repairDirectory, 'block backup directory creation')
  await page.evaluate(() => {
    localStorage.removeItem('ceru-music-data-version')
    location.reload()
  })
  await prompt.waitFor({ state: 'visible', timeout: 45000 })
  await page.getByRole('button', { name: '立即修复', exact: true }).click()
  await page.getByText('修复未完成，原数据已保留', { exact: true }).waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(() => localStorage.getItem('ceru-music-data-version')), null)
  assert.equal(await page.evaluate(() => localStorage.getItem('songList')), originals.songList)
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await unlink(repairDirectory)
  console.log(
    'Electron welcome timing, in-app modal, defer, repair, restart, interrupted rollback and backup failure passed'
  )
} finally {
  if (application) {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => {})
    await application.close().catch(() => {})
  }
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
