---
pageClass: plugin-v3-doc
title: 完整 API 目录与教程入口
---

# 完整 API 目录与教程入口

> 适用读者：需要确认某个 v3 API 是否存在、怎样调用和去哪里学习的作者。前置条件：CLI / SDK 3.0.0。

这一页从当前安装的 SDK 类型和宿主契约生成，覆盖 PluginContext 的全部公开方法。参数字段和嵌套类型继续看[逐项方法索引](./methods)与[SDK 原始类型](./reference)。页面中的方法数量会随 SDK 版本变化，构建时自动更新。

<script setup>
import { data as groups } from './methods.data.mts'
import { computed, ref } from 'vue'
const guides = {
  account: ['accounts', '读取澜音账号会话和公开资料。'], accounts: ['accounts', '注册第三方账号和上报凭据过期。'],
  actions: ['manifest', '把 View 动作连接到 Logic。'], ai: ['desktop-api', '调用宿主 AI 能力。'],
  app: ['desktop-api', '读取桌面信息和主动调用操作。'], assets: ['views', '读取宿主或插件资源。'],
  capabilities: ['desktop-api', '查询服务和可用方法。'], clipboard: ['desktop-api', '读写剪贴板。'],
  config: ['storage', '读取构建后配置。'], credentials: ['accounts', '使用宿主管理的凭据引用。'],
  crypto: ['servers', '创建加密流。'], devices: ['desktop-api', '列出和选择播放设备。'],
  downloads: ['desktop-api', '管理下载任务。'], effects: ['lifecycle', '登记清理函数。'],
  entries: ['manifest', '刷新和读取来源选择。'], events: ['hooks', '订阅宿主事件。'],
  favorites: ['music', '管理宿主收藏。'], files: ['desktop-api', '选择和读写文件。'],
  guests: ['guests', '管理 Guest 子插件。'], history: ['music', '读取播放历史。'],
  hooks: ['hooks', '拦截、放行或改写操作。'], hotkeys: ['desktop-api', '注册快捷键。'],
  http: ['network', '请求 HTTP 服务。'], icons: ['views', '读取宿主图标。'],
  library: ['playlist', '管理歌单和歌曲。'], lifecycle: ['lifecycle', '处理插件生命周期。'],
  localMusic: ['music', '读取和扫描本地音乐。'], log: ['troubleshooting', '记录可脱敏日志。'],
  lyricConverters: ['media', '注册歌词转换器。'], modules: ['reference', '加载兼容模块。'],
  music: ['music', '搜索、解析、播放和入队。'], permissions: ['permissions', '查询和申请授权。'],
  playback: ['music', '处理播放失败。'], player: ['desktop-api', '控制播放器。'],
  playlistImporters: ['importer', '注册歌单导入器。'], plugins: ['services', '使用其他插件服务。'],
  providers: ['provider', '注册音乐源。'], queue: ['desktop-api', '管理播放队列。'],
  rooms: ['desktop-api', '管理多人房间。'], router: ['routing', '管理具名路由。'],
  server: ['servers', '启动本机服务。'], services: ['services', '提供插件服务。'],
  settings: ['desktop-api', '读写宿主设置。'], sharing: ['desktop-api', '管理歌曲分享。'],
  sockets: ['network', '连接实时服务。'], storage: ['storage', '保存和迁移数据。'],
  streams: ['servers', '注册媒体流变换器。'], tasks: ['desktop-api', '管理后台任务。'],
  ui: ['views', '管理页面、通知和进度。'], wasm: ['servers', '加载 WASM 能力。'],
  window: ['desktop-api', '调用窗口能力。']
}
const query = ref('')
const total = computed(() => groups.reduce((sum, group) => sum + group.methods.length, 0))
const visible = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  return groups.map(group => ({
    ...group,
    methods: group.methods.filter(method =>
      !keyword || (method.path + ' ' + method.signature + ' ' + method.note).toLowerCase().includes(keyword)
    )
  })).filter(group => group.methods.length)
})
</script>

当前目录包含 {{ total }} 条 SDK 方法签名。相同方法存在重载时，每条签名都会保留。每个命名空间都链接到对应的动手教程。

## 按方法名筛选

<label>筛选完整 API <input type="search" v-model="query" placeholder="例如 playlist.addTracks 或 downloads" aria-label="筛选完整 API"></label>

<p v-if="!visible.length">没有匹配的方法。缩短关键词，或在[完整类型](./reference)中查询字段。</p>

<section v-for="group in visible" :key="group.name">
  <h2 :id="'api-' + group.name"><code>ctx.{{ group.name }}</code></h2>
  <p v-if="guides[group.name]">{{ guides[group.name][1] }} <a :href="'./' + guides[group.name][0] + '.html'">打开对应教程</a></p>
  <details v-for="(method, index) in group.methods" :key="method.path + index" class="api-method">
    <summary><code>ctx.{{ method.path }}</code></summary>
    <p v-if="method.note">{{ method.note }}</p>
    <p><code>{{ method.path }}{{ method.signature }}</code></p>
    <table v-if="method.params.length"><thead><tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr></thead><tbody><tr v-for="param in method.params" :key="param.name">
      <td><code>{{ param.name }}</code></td><td><code>{{ param.type }}</code></td><td>{{ param.optional ? '可省略' : '是' }}</td><td>{{ param.note || '字段和约束见类型声明' }}</td>
    </tr></tbody></table>
    <p v-else>无参数。</p>
    <p>返回值：<code>{{ method.returns }}</code></p>
    <p>权限与范围：{{ method.permission }}。</p>
  </details>
</section>

## 不属于 ctx 方法的公开入口

方法目录只展开 PluginContext 的可调用成员。下面这些导出同样属于 SDK 公共 API，分别在对应教程和类型页说明：

| 入口 | 用途 | 教程 |
| --- | --- | --- |
| definePlugin | 定义 Logic 入口，接收 PluginContext 或生命周期选项对象 | [生命周期](./lifecycle) |
| defineSurface | 定义隔离 Web 页面入口，接收 SurfaceContext | [隔离 HTML 页面](./web) |
| defineNativeView、assertNativeView | 定义并校验宿主原生视图数据 | [原生歌单与动作](./native) |
| defineGuestAdapter | 定义 Guest bootstrap 入口 | [Guest 兼容环境](./guests) |
| defineManifest | 对清单对象提供类型约束 | [Manifest 与页面入口](./manifest) |
| definePluginConfig | 对插件配置对象提供类型推断 | [配置、存储与升级](./storage) |
| defineUISchema | 对兼容 UI Schema 提供类型约束 | [SDK 类型与方法签名](./reference) |
| failure | 构造音源解析失败结果 | [歌曲引用、歌词与音质](./media) |
| Vue hooks 和区域 hooks | 在 Vue 组件中读取动作、状态、宿主组件和播放区域 | [Vue hooks 与宿主组件](./views) |

ctx.plugin、ctx.host 和 ctx.utils.lodash 是只读属性，不会在方法目录中重复计数。SurfaceContext、GuestContext 和 Provider、Native View 的上下文也不是 PluginContext 方法，它们的完整签名在[SDK 类型](./reference)中按类型展开。

## 歌单 API 快速定位

歌单能力分布在两层。ctx.library.playlists 负责读取、导入、移除歌曲和清空歌单。创建歌单、删除歌单、向指定歌单添加或移除歌曲属于宿主操作，需要通过 ctx.app.call 调用。完整代码见[本地歌单 API 实战](./playlist)。

| 需求 | 方法 |
| --- | --- |
| 查询本地歌单 | ctx.library.playlists.list |
| 获取歌单中的歌曲 | ctx.library.playlists.getTracks |
| 创建本地歌单 | ctx.app.call('playlist.create', ...) |
| 添加歌曲 | ctx.app.call('playlist.addTracks', ...) |
| 移除歌曲 | ctx.app.call('playlist.removeTracks', ...) |
| 清空但保留歌单 | ctx.library.playlists.clearPlaylist |
| 删除歌单 | ctx.app.call('playlist.delete', ...) |
| 修改名称、描述或封面 | 当前 v3 SDK 没有公开插件 API |

<style scoped>
label { display: inline-flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
input[type=search] { border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: .4rem .6rem; max-width: 100%; }
.api-method { margin: .4rem 0; padding: .4rem .75rem; border-left: 2px solid var(--vp-c-divider); }
.api-method summary { cursor: pointer; }
.api-method p code, .api-method td code { overflow-wrap: anywhere; white-space: normal; }
</style>
