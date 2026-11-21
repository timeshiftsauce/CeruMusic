---
pageClass: plugin-v3-doc
title: 逐项查 PluginContext 方法与参数
---

# 逐项查 PluginContext 方法与参数

<script setup>
import { data as groups } from './methods.data.mts'
import { ref, computed } from 'vue'
const guideGroups = [
  ['storage config permissions', 'storage', '读写当前插件的数据前，先处理缺失键和旧数据；需要授权的操作使用本次用户意图。'],
  ['actions ui entries', 'manifest', '核对清单 ID 和 Logic 注册；UI 快照仅传视图显示所需的数据。'],
  ['app player queue favorites history library localMusic account files clipboard downloads rooms devices ai settings tasks hotkeys window sharing capabilities', 'desktop-api', '先查询宿主是否提供目标方法，修改数据、播放或设备前确认授权及目标对象。'],
  ['accounts credentials', 'accounts', '由用户选择账号；每次使用当前连接与授权来源，不在界面传递凭据。'],
  ['music playback providers', 'provider', '保存资源引用；解析、播放与搜索可分别失败。'],
  ['router', 'routing', '操作使用公开具名页面；检查重复、取消或改向后的结果。'],
  ['hooks events', 'hooks', '在 Logic 中注册；按操作名核对拦截、观察权限和时限。'],
  ['lifecycle effects', 'lifecycle', '在逻辑实例中登记，停用或卸载时处理自己持有的资源。'],
  ['streams wasm crypto server', 'servers', '仅在能力已获准且资源已声明时启动，停止时释放监听和流。'],
  ['guests', 'guests', '管理当前父插件的子项；取消导入和未选中都应有界面反馈。'],
  ['plugins services', 'services', '公开服务接受 JSON；检查依赖版本与当前可用性。'],
  ['http sockets', 'network', '尊重请求取消和来源授权；退出时断开自己创建的连接。'],
  ['lyricConverters', 'media', '保留歌曲身份，明确毫秒单位和目标格式。'],
  ['playlistImporters', 'importer', '登记清单中的导入器 ID；测试空输入、游标和多首结果。'],
  ['icons assets modules', 'views', '只使用宿主公开或插件声明的资源和内置模块。'],
  ['log', 'troubleshooting', '记录动作名与错误阶段，过滤账号、路径和凭据。']
]
const guidance = Object.fromEntries(guideGroups.flatMap(([names, slug, note]) =>
  names.split(' ').map(name => [name, [slug, note]])
))
const paramNotes = {
  "request": "本次请求的字段组合；展开下方字段表，或到完整类型查其声明。",
  "sourceId": "从可用音源列表取得的来源 ID。",
  "accountId": "清单声明的账号扩展 ID。",
  "guestId": "已导入的子插件 ID，从当前父插件的管理列表取得。",
  "revision": "上一次读取队列时得到的版本；队列变化后重新读取。",
  "listener": "接收本次订阅通知的函数。",
  "dispose": "交给宿主在释放资源时调用的清理函数。",
  "implementation": "该扩展点的实现对象；成员决定宿主可以调用哪些回调。",
  "quality": "曲目的音质档位 ID。",
  "track": "保留歌曲身份以及当前接口要求的其他字段。",
  "event": "要订阅的事件名，取值由该命名空间的事件类型决定。",
  "file": "使用签名要求的文件或句柄。",
  "surfaceId": "要操作的视图标识。",
  "state": "向视图发送的显示状态，保留界面需要的 JSON 数据。",
  "credential": "与当前账号和来源关联的凭据引用。",
  "handlers": "以公开方法名为键的服务处理器。",
  "call": "传入本次调用的权限键和操作上下文。",
  "operation": "沿用宿主传入的本次操作，传递取消与截止时间。",
  "handler": "在对应事件或操作发生时执行的回调。",
  "input": "本次动作的数据，结构由对应操作决定。",
  "ref": "保留来源、种类、稳定 ID 及适用的账号连接。",
  "refs": "一组原始资源引用，保留顺序与归属。",
  "cursor": "沿用上一页返回的游标，首次请求按签名传空。",
  "milliseconds": "单位为毫秒，onIdle 至少 60000。",
  "positionMs": "从曲目开始计算的位置，单位为毫秒。",
  "viewId": "清单 entry.views 中声明的视图 ID。",
  "pageId": "清单 ui.pages 中声明的页面 ID。",
  "permissionKey": "清单 uses.permissions 中由插件命名的 key。",
  "connectionId": "宿主管理的账号连接标识。",
  "pluginId": "目标插件的标识，须符合当前接口的归属或依赖声明。"
}
const query = ref('')
const visible = computed(() => groups.map(g => ({ ...g, methods: g.methods.filter(m => m.path.toLowerCase().includes(query.value.trim().toLowerCase())) })).filter(g => g.methods.length))
</script>

适用版本为 CLI / SDK 3.0.0。输入方法名或命名空间，例如 `queue.replace`、`storage`、`onIdle`。展开方法可查看签名、参数是否可省略及返回值。只读字段 `ctx.plugin`、`ctx.host` 和共享纯函数 `ctx.utils.lodash` 可在[完整类型](./reference#logic)查到。Vue、Provider、Guest 和视图桥接分别有自己的上下文。

## 先读一次签名

以 `ctx.storage.get<number>('clicks')` 为例，`key` 是必填参数，缺失的本地键返回 `null`。调用返回 Promise，要 `await` 后才能比较值。对自有 JSON 键的读取没有额外的用户授权；跨插件读取仍受键的共享策略限制。完整读写练习见[保存计数](./first-plugin)。

`?` 表示参数可省略。`T | undefined` 出现在必填位置时仍要传这个位置，例如 `ctx.player.play(undefined, call)`。例如在 `player.seek` 中展开 `call` 的对象字段，可以看到 `operation` 和 `permissionKey` 都必填。字段表保留 SDK 声明中的备注。联合类型、泛型、数组元素以及下一层对象到[完整声明](./reference)按类型名查询。类型声明没有记录的默认值不作推断。方法返回 `() => void` 时，用它解绑；返回句柄时还需按该句柄的类型关闭连接或服务。

## 查找方法

<label>筛选方法 <input type="search" v-model="query" placeholder="例如 player.seek" aria-label="筛选 PluginContext 方法"></label>
<p v-if="!visible.length">没有匹配的方法。可缩短关键词，或到完整类型页查找数据字段和视图接口。</p>
<section v-for="group in visible" :key="group.name">
  <h3 :id="'ctx-' + group.name"><code>ctx.{{ group.name }}</code></h3>
  <p v-if="guidance[group.name]">{{ guidance[group.name][1] }} <a :href="'./' + guidance[group.name][0] + '.html'">相关教程</a></p>
  <details v-for="(m, index) in group.methods" :key="m.path + index" class="api-method">
    <summary><code>ctx.{{ m.path }}</code></summary>
    <p><code>{{ m.path }}{{ m.signature }}</code></p>
    <table v-if="m.params.length"><thead><tr><th>参数</th><th>类型</th><th>必填</th><th>默认值</th><th>用法</th></tr></thead><tbody><tr v-for="p in m.params" :key="p.name"><td><code>{{ p.name }}</code></td><td><code>{{ p.type }}</code></td><td>{{ p.optional ? '可省略' : '是' }}</td><td>{{ p.optional ? '见类型及教程' : '—' }}</td><td>{{ p.note || paramNotes[p.name] || '按本行类型传入；命名类型可在 SDK 声明页查阅' }}</td></tr></tbody></table>
    <p v-else>无参数。</p>
    <template v-for="p in m.params" :key="'fields-' + p.name">
      <details v-if="p.fields.length"><summary><code>{{ p.name }}</code> 的对象字段</summary>
        <table><thead><tr><th>字段</th><th>类型</th><th>必填</th><th>SDK 备注</th></tr></thead><tbody><tr v-for="f in p.fields" :key="f.name"><td><code>{{ f.name }}</code></td><td><code>{{ f.type }}</code></td><td>{{ f.optional ? '可省略' : '是' }}</td><td>{{ f.note || '—' }}</td></tr></tbody></table>
      </details>
    </template>
    <p>返回 <code>{{ m.returns }}</code></p>
    <p>权限与范围：{{ m.permission }}。</p>
    <p v-if="m.note">{{ m.note }}</p>
  </details>
</section>

## 处理调用失败

有 `ServiceCall` 参数时，传清单声明的 `permissionKey` 和当前动作的 `operation`。查询状态、请求授权、拒绝后的恢复见[权限指南](./permissions)。高阶封装、动态操作与本地工具的权限无法只从同名 RPC 推断；方法未列出权限时，请跟随[任务索引](./api)核对实际行为。宿主能力缺失、撤权、用户取消和参数无效分别处理。操作拦截的时限和副作用按[操作目录](./operations)查。

<style scoped>
.api-method { margin: .4rem 0; padding: .4rem .75rem; border-left: 2px solid var(--vp-c-divider); }
.api-method summary { cursor: pointer; }
.api-method p code, .api-method td code { overflow-wrap: anywhere; white-space: normal; }
input[type=search] { border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: .35rem .6rem; max-width: 100%; }
</style>
