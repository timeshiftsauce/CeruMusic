import { createSeparator } from '../services/karaokeSeparation'
import { karaokePacks } from '../../common/karaoke'

const pack = karaokePacks.find((item) => item.id === process.argv[2])!
let separator: Awaited<ReturnType<typeof createSeparator>> | undefined
let queue = Promise.resolve()
process.parentPort.on('message', ({ data }) => {
  queue = queue.then(async () => {
    try {
      separator ??= await createSeparator(pack, process.argv[3])
      const output = await separator(data.samples)
      process.parentPort.postMessage({ id: data.id, output })
    } catch (error) {
      process.parentPort.postMessage({ id: data.id, error: String(error) })
    }
  })
})
