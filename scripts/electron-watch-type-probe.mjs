import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const cli = process.argv[1]
const ts = createRequire(cli)('typescript')
const { VueWatchTypes } = await import(pathToFileURL(join(dirname(cli), 'watch-vue-types.js')))
const check = VueWatchTypes.prototype.check
const phases = ['Program', 'Bind', 'Check', 'Emit']
VueWatchTypes.prototype.check = function (declarations, files) {
  ts.performance.enable()
  const before = phases.map(name => ts.performance.getDuration(name))
  const start = performance.now()
  try {
    return check.call(this, declarations, files)
  } finally {
    const wall = performance.now() - start
    const durations = Object.fromEntries(phases.map((name, index) => [name, Math.round(ts.performance.getDuration(name) - before[index])]))
    console.log('CERU_QA_TYPES ' + JSON.stringify({files, wall: Math.round(wall), ...durations}))
    ts.performance.disable()
  }
}
