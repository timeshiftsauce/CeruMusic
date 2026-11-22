import { createListeningEvents } from './listeningEvents'
import { expect, jest, test } from '@jest/globals'

const track = { title: 'song', artist: 'artist', source: 'local' }
function setup() {
  let time = 0
  const publish = jest.fn()
  const meter = createListeningEvents(publish, () => time)
  meter.select('first', track)
  function sample(elapsed: number, position: number, duration = 2000, rate = 1) {
    time += elapsed
    meter.sample(position, duration, rate)
  }
  return { meter, sample, publish }
}

test('reports once per playback, throttles progress and applies a strict half-duration threshold', () => {
  const { meter, sample, publish } = setup()
  sample(0, 0)
  sample(10, 10)
  sample(990, 1000)
  meter.finish()
  meter.finish()
  expect(publish.mock.calls).toEqual([
    ['track.started', { track }], ['player.progress', { positionMs: 10, durationMs: 2000 }],
    ['track.finished', { track, playedMs: 1000, completed: false }]
  ])
  meter.select('first', track)
  sample(0, 0)
  sample(1001, 1001)
  meter.select('second', track)
  expect(publish).toHaveBeenLastCalledWith('track.finished', { track, playedMs: 1001, completed: true })
})

test('seeks, buffering, pauses and fast playback do not inflate listening time', () => {
  const { meter, sample, publish } = setup()
  sample(0, 0, 360000)
  sample(400, 400, 360000)
  sample(10000, 400, 360000)
  sample(10, 300000, 360000)
  meter.interrupt()
  sample(60000, 300000, 360000)
  sample(400, 300800, 360000, 2)
  meter.finish()
  expect(publish).toHaveBeenLastCalledWith('track.finished', { track, playedMs: 800, completed: false })
})

test('unknown duration needs more than four minutes, unplayed selection produces no events', () => {
  const { meter, sample, publish } = setup()
  meter.select('other', track)
  expect(publish).not.toHaveBeenCalled()
  sample(0, 0, Infinity)
  sample(240001, 240001, Infinity)
  meter.finish()
  expect(publish).toHaveBeenLastCalledWith('track.finished', { track, playedMs: 240001, completed: true })
})
