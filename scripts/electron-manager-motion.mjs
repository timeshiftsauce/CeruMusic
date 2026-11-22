import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function recordFrames(page, directory) {
  if (!directory) return
  const client = await page.context().newCDPSession(page),
    frames = []
  client.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    frames.push({ data, time: metadata.timestamp })
    void client.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 90,
    maxWidth: 880,
    maxHeight: 600
  })
  return async () => {
    await client.send('Page.stopScreencast')
    await client.detach()
    const dir = join(directory, 'manager-motion-frames')
    await mkdir(dir, { recursive: true })
    const list = ['ffconcat version 1.0']
    for (const [index, frame] of frames.entries()) {
      const file = 'frame-' + index + '.jpg'
      await writeFile(join(dir, file), Buffer.from(frame.data, 'base64'))
      const duration = frames[index + 1]
        ? Math.max(0.012, frames[index + 1].time - frame.time)
        : 0.6
      list.push('file ' + file, 'duration ' + duration)
    }
    if (frames.length) {
      list.push('file frame-' + (frames.length - 1) + '.jpg')
      await writeFile(join(dir, 'capture.ffconcat'), list.join('\n') + '\n')
    }
  }
}

export async function verifyManagerMotion(page) {
  const launch = page.getByRole('button', { name: '管理设置', exact: true })
  const sheet = page.getByRole('dialog', { name: '插件管理设置' })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => {
    window.managerMotionEvents = []
    window.managerMotionListener = (event) => {
      if (!event.target.matches('dialog.manager-sheet')) return
      window.managerMotionEvents.push({
        event: event.type,
        property: event.propertyName,
        pseudo: event.pseudoElement,
        closing: event.target.classList.contains('is-closing'),
        duration: event.elapsedTime
      })
    }
    for (const type of ['transitionrun', 'transitionend'])
      document.addEventListener(type, window.managerMotionListener, true)
  })
  let stopRecording = await recordFrames(page, process.env.CERU_MANAGER_SNAPSHOT_DIR)
  try {
    await launch.click()
    await page.waitForFunction(() =>
      window.managerMotionEvents.some(
        (e) => e.event === 'transitionend' && e.property === 'transform' && !e.closing
      )
    )
    if (stopRecording) await new Promise((done) => setTimeout(done, 650))
    await sheet.getByRole('button', { name: '关闭插件管理设置' }).click()
    await sheet.waitFor({ state: 'detached' })
    assert.ok(await launch.evaluate((el) => el === document.activeElement))
    const events = await page.evaluate(() => window.managerMotionEvents)
    for (const closing of [false, true]) {
      assert.ok(
        events.some(
          (e) =>
            e.closing === closing &&
            e.property === 'transform' &&
            e.event === 'transitionend' &&
            e.duration > 0
        ),
        JSON.stringify(events)
      )
      assert.ok(
        events.some(
          (e) =>
            e.closing === closing &&
            e.property === 'opacity' &&
            e.pseudo === '::backdrop' &&
            e.event === 'transitionend'
        ),
        JSON.stringify(events)
      )
    }
    if (stopRecording) {
      await stopRecording()
      stopRecording = undefined
    }
    await launch.press('Enter')
    await sheet.waitFor()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await sheet.waitFor({ state: 'detached' })
    assert.ok(await launch.evaluate((el) => el === document.activeElement))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => {
      window.managerMotionEvents = []
    })
    await launch.click()
    assert.equal(await sheet.evaluate((el) => el.getAnimations().length), 0)
    await page.mouse.click(8, Math.round((await page.evaluate(() => innerHeight)) / 2))
    await sheet.waitFor({ state: 'detached' })
    assert.equal(await page.evaluate(() => window.managerMotionEvents.length), 0)
    assert.ok(await launch.evaluate((el) => el === document.activeElement))
    console.log(
      'Manager sheet: enter/exit and backdrop transitions, reduced motion, outside close and focus return passed'
    )
  } finally {
    await stopRecording?.()
    await page.emulateMedia({ reducedMotion: null })
    await page.evaluate(() => {
      for (const type of ['transitionrun', 'transitionend'])
        document.removeEventListener(type, window.managerMotionListener, true)
      delete window.managerMotionEvents
      delete window.managerMotionListener
    })
  }
}
