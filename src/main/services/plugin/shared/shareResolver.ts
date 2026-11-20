/** Generates only the explicitly declared resolution entry. Never evaluates plugin code. */
export function exportShareResolver(
  source: {
    name: string
    version: string
    author?: string
    providers: { id: string; name: string; qualities?: string[] }[]
    factory?: string
    declaration?: { configKeys?: string[]; guestGlobals?: string[]; guestAdapterId?: string }
  },
  config: Record<string, unknown>,
  guest?: { script: string; info: import('@shiqianjiang/ceru-plugin-sdk').GuestInfo }
): string {
  const { declaration, factory } = source
  if (!declaration) throw new Error('此插件未提供服务器分享解析模块，请更新插件后重试')
  if (!factory || factory.includes('__ceruRequire'))
    throw new Error('分享解析模块依赖桌面环境，无法在服务器运行')
  const values = Object.fromEntries((declaration.configKeys ?? []).map((key) => [key, config[key]]))
  const sources = Object.fromEntries(
    (guest
      ? guest.info.providers.map((p) => ({ id: p.id, name: p.name, qualities: p.qualities }))
      : source.providers
    ).map((p) => [p.id, { name: p.name, qualitys: p.qualities ?? [] }])
  )
  const info = {
    name: guest?.info.name || source.name,
    version: guest?.info.version || source.version,
    author: guest?.info.author || source.author || ''
  }
  const names = declaration.guestGlobals ?? []
  if (
    names.some(
      (name) =>
        !/^[a-zA-Z_$][\w$]*$/.test(name) || ['globalThis', 'arguments', 'eval'].includes(name)
    )
  )
    throw new Error('子插件分享全局变量声明无效')
  if (declaration.guestAdapterId && (!guest || guest.info.adapterId !== declaration.guestAdapterId))
    throw new Error('请先选择此兼容环境中的子音源')
  const guestInfo = guest
    ? {
        name: guest.info.name,
        version: guest.info.version,
        author: guest.info.author,
        rawScript: guest.script
      }
    : undefined
  const runner = guest
    ? `function(bindings) {
    const scope = Object.assign(Object.create(globalThis), bindings);
    return (function(globalThis${names.map((name) => ',' + name).join('')}) {
${guest.script}
    }).call(scope,scope${names.map((name) => ',bindings[' + JSON.stringify(name) + ']').join('')});
  }`
    : 'undefined'
  return `/* CeruMusic server share resolver. Only musicUrl is exported as an executable capability. */
const pluginInfo = ${JSON.stringify(info)};
const sources = ${JSON.stringify(sources)};
const config = ${JSON.stringify(values)};
const createResolver = ${factory};
let resolver;
async function musicUrl(source, musicInfo, quality) {
  if (!Object.prototype.hasOwnProperty.call(sources,source)) throw new Error('此分享音源不支持所选平台');
  if (!sources[source].qualitys.includes(quality)) throw new Error('此分享音源不支持所选音质');
  if (!resolver) resolver = Promise.resolve(createResolver({
    plugin: pluginInfo, sources, config,
    request: (url,options) => cerumusic.request(url,options),
    utils: cerumusic.utils, guest: ${JSON.stringify(guestInfo) || 'undefined'}, runGuest: ${runner}
  })).catch(error => { resolver = undefined; throw error });
  const result = await (await resolver).musicUrl(source,musicInfo,quality);
  if (typeof result !== 'string' || !['http:','https:'].includes(new URL(result).protocol)) throw new Error('音源没有返回有效播放地址');
  return result;
}
module.exports = { pluginInfo, sources, musicUrl };
`
}
