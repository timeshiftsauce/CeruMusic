import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

export function verifyRuntimePackages(root) {
  const local = createRequire(join(root, 'package.json'))
  const scope = '@shiqianjiang/ceru-plugin-'
  const contained = (entry) => {
    const file = relative(join(root, 'node_modules'), entry)
    assert.ok(!file.startsWith('..') && !isAbsolute(file), 'Dependency outside app: ' + entry)
    return entry
  }
  const version = (entry) =>
    JSON.parse(readFileSync(join(dirname(contained(entry)), '../package.json'), 'utf8')).version
  for (const [name, expected] of [
    ['ceru-plugin-core-v2', '0.3.16'],
    [scope + 'core', '3.0.1']
  ]) {
    const entry = local.resolve(name)
    const core = createRequire(entry)
    const issuer = core.resolve(scope + 'issuer')
    for (const dependency of [
      entry,
      issuer,
      core.resolve(scope + 'sdk'),
      createRequire(issuer).resolve(scope + 'sdk')
    ])
      assert.equal(version(dependency), expected, dependency)
    const ajv = contained(createRequire(issuer).resolve('ajv/package.json'))
    assert.equal(JSON.parse(readFileSync(ajv, 'utf8')).version.split('.')[0], '8')
    assert.ok(readFileSync(join(dirname(entry), '../assets/sandbox.js')).length > 0)
    if (name === scope + 'core') {
      const component = contained(local.resolve(scope + 'core/component-runtime'))
      assert.ok(readFileSync(component).length > 0, 'Missing shared component runtime')
      const runtime = join(dirname(entry), '../assets/component-view.js')
      assert.deepEqual(gunzipSync(readFileSync(runtime + '.gz')), readFileSync(runtime))
    }
  }
  const frozenIssuer = local.resolve('ceru-plugin-issuer-v2')
  assert.equal(version(createRequire(frozenIssuer).resolve(scope + 'sdk')), '0.3.16')
}
