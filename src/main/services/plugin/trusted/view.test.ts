import { expect, test } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transformSync } from 'esbuild'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'

test('developer reasons and publisher names render as text, including HTML and Markdown', async () => {
  const source = readFileSync(
    resolve(__dirname, '../../../../renderer/src/components/PluginTrustedDetails.vue'),
    'utf8'
  )
  const { descriptor } = parse(source)
  const script = compileScript(descriptor, { id: 'trusted-test', inlineTemplate: true })
  const code = transformSync(script.content, { loader: 'ts', format: 'cjs' }).code
  const compiled = { exports: {} as any }
  runInNewContext(code, { require, module: compiled, exports: compiled.exports })
  const html = await renderToString(
    createSSRApp(compiled.exports.default, {
      detail: {
        pluginName: 'Fixture',
        version: '1',
        publisher: '<img src=x onerror=alert(1)>',
        signature: '签名已验证',
        reason: '<script>alert(1)</script> [open](https://example.test)',
        warning: ['Host warning'],
        otherPermissions: []
      }
    })
  )
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('&lt;img')
  expect(html).toContain('[open](https://example.test)')
  expect(html).not.toMatch(/<script|<img|<a\s/)
  expect(html).toContain('开发者说明：')
  expect(html).toContain('Host warning')
})
