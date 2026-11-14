exports.manifest = {
  "manifestVersion": 2,
  "id": "local.bodian-music",
  "name": "波点音乐",
  "version": "1.7.0",
  "author": "烏雲",
  "license": "MIT",
  "description": "手机号验证码登录波点音乐，同步个人歌单，内置搜索 / 播放 / 歌词；侧边栏「私人推荐」一键开启电台式推荐（无限续播），并把波点「发现」模块挂到澜音「发现」页",
  "homepage": "https://www.bodianmusic.com/",
  "engines": {
    "hostApi": "^2.0.0",
    "logicRuntime": "ceru-js@1",
    "uiSchema": "^1.0.0"
  },
  "dataSchemas": {
    "config": 1,
    "state": 1
  },
  "modules": {
    "logic": {
      "entry": "logic.main"
    },
    "surfaces": [
      {
        "id": "login",
        "kind": "web",
        "entry": "view.login",
        "title": "波点音乐账号",
        "presentation": {
          "kind": "modal",
          "size": 380
        },
        "lifecycle": {
          "closeAction": "login.cancel"
        }
      },
      {
        "id": "library",
        "kind": "native",
        "entry": "render.library",
        "title": "波点音乐歌单"
      },
      {
        "id": "discover",
        "kind": "native",
        "entry": "render.discover",
        "title": "波点发现"
      },
      {
        "id": "recommend",
        "kind": "web",
        "entry": "view.recommend",
        "title": "私人推荐",
        "presentation": {
          "kind": "drawer",
          "placement": "right",
          "size": 320
        }
      }
    ]
  },
  "contributes": {
    "providers": [
      {
        "id": "bd",
        "name": "波点音乐",
        "protocols": [
          "music.search@1",
          "music.resolve@1",
          "music.lyrics@1",
          "music.list@1",
          "music.playlists@1",
          "music.playlist@1",
          "music.playlist.list@1",
          "music.chart.tracks@1"
        ],
        "qualities": [
          "128k",
          "192k",
          "320k",
          "flac"
        ],
        "icon": {
          "kind": "asset",
          "resource": "icon.bodian"
        },
        "connectionMode": "single"
      }
    ],
    "commands": [
      {
        "id": "account.summary",
        "title": "波点音乐账号状态",
        "action": "account.summary"
      },
      {
        "id": "account.refresh",
        "title": "刷新波点音乐账号",
        "action": "account.refresh"
      },
      {
        "id": "account.logout",
        "title": "退出波点音乐账号",
        "action": "account.logout"
      },
      {
        "id": "login.open",
        "title": "登录波点音乐",
        "action": "login.open"
      },
      {
        "id": "login.sendCode",
        "title": "发送短信验证码",
        "action": "login.sendCode"
      },
      {
        "id": "login.submit",
        "title": "手机号验证码登录",
        "action": "login.submit"
      },
      {
        "id": "login.cancel",
        "title": "关闭登录窗口",
        "action": "login.cancel"
      },
      {
        "id": "login.qrStart",
        "title": "获取扫码登录二维码",
        "action": "login.qrStart"
      },
      {
        "id": "login.qrPoll",
        "title": "轮询扫码登录状态",
        "action": "login.qrPoll"
      },
      {
        "id": "login.qrComplete",
        "title": "扫码登录换取会话",
        "action": "login.qrComplete"
      },
      {
        "id": "comments.hot",
        "title": "热门评论",
        "action": "comments.hot"
      },
      {
        "id": "comments.get",
        "title": "最新评论",
        "action": "comments.get"
      },
      {
        "id": "search",
        "title": "搜索波点音乐",
        "action": "search"
      },
      {
        "id": "library.open",
        "title": "打开波点音乐歌单",
        "action": "library.open"
      },
      {
        "id": "library.openSection",
        "title": "定位到波点音乐歌单区块",
        "action": "library.openSection"
      },
      {
        "id": "library.refresh",
        "title": "刷新波点音乐歌单",
        "action": "library.refresh"
      },
      {
        "id": "render.library",
        "title": "我的波点音乐歌单",
        "action": "render.library"
      },
      {
        "id": "render.discover",
        "title": "波点发现",
        "action": "render.discover"
      },
      {
        "id": "discover.refresh",
        "title": "换一批发现内容",
        "action": "discover.refresh"
      },
      {
        "id": "discover.play",
        "title": "播放发现歌曲",
        "action": "discover.play"
      },
      {
        "id": "recommend.start",
        "title": "开启私人推荐电台",
        "action": "recommend.start"
      },
      {
        "id": "ui.theme",
        "title": "读取界面主题",
        "action": "ui.theme"
      }
    ],
    "playlistImporters": [
      {
        "id": "bodian-playlist",
        "title": "波点音乐",
        "providerId": "bd",
        "description": "使用登录账号读取波点音乐歌单（我喜欢的音乐 / 自建歌单 / 收藏歌单）",
        "placeholder": "歌单 ID 或歌单链接",
        "examples": [
          {
            "label": "歌单 ID",
            "value": "1000001"
          },
          {
            "label": "歌单链接",
            "value": "https://www.bodianmusic.com/playlist/1000001"
          }
        ]
      }
    ],
    "accountItems": [
      {
        "id": "account",
        "title": "波点音乐",
        "view": "login",
        "action": "account.summary",
        "logoutAction": "account.logout"
      }
    ],
    "settingsPages": [
      {
        "id": "account",
        "title": "波点音乐账号",
        "view": "login"
      }
    ],
    "homeSections": [
      {
        "id": "bodian-playlists",
        "title": "歌单",
        "kind": "playlists",
        "providerIds": [
          "bd"
        ],
        "icon": {
          "kind": "host",
          "name": "library"
        },
        "order": 10
      },
      {
        "id": "bodian-charts",
        "title": "排行榜",
        "kind": "charts",
        "providerIds": [
          "bd"
        ],
        "icon": {
          "kind": "host",
          "name": "chart"
        },
        "order": 20
      },
      {
        "id": "bodian-discover",
        "title": "发现",
        "kind": "custom",
        "view": "discover",
        "icon": {
          "kind": "asset",
          "resource": "icon.bodian"
        },
        "order": 50
      }
    ],
    "sidebarItems": [
      {
        "id": "bodian-recommend",
        "group": "music",
        "title": "私人推荐",
        "view": "recommend"
      }
    ],
    "playlistSections": [
      {
        "id": "library",
        "title": "波点音乐",
        "view": "library",
        "order": 0
      }
    ]
  },
  "permissions": [
    {
      "key": "network",
      "name": "network.request",
      "reason": "访问 bd-api.kuwo.cn 与 mlyric.kuwo.cn，完成登录、歌单同步、搜索、歌词与播放地址解析"
    },
    {
      "key": "playback",
      "name": "player.control",
      "reason": "私人推荐电台需要替换播放队列、切换顺序播放并把下一批推荐追加到列表末尾"
    }
  ]
};

exports.package = {
  "formatVersion": 2,
  "syntax": "js",
  "signature": null
};

/**
 * 波点音乐 · 澜音 (Ceru Music) v2 单文件插件
 * ------------------------------------------------------------------
 * 一个插件同时提供四件事：
 *   1. 账号：手机号 + 短信验证码登录波点音乐（bd-api.kuwo.cn），读取/同步个人歌单；
 *   2. 音源：注册 provider「波点音乐」，支持搜索 / 播放地址解析 / 歌词；
 *   3. 歌单：把我喜欢、自建歌单、收藏歌单挂到澜音现有「歌单」页，并支持歌单导入；
 *   4. 私人推荐 + 发现：
 *      - 「私人推荐」是波点 App 的**电台式推荐**（没有完整歌单，每次 `/service/music/recommendList`
 *        随机下发 6 首）。侧边栏入口会在点击后替换播放队列、切到**顺序播放**并开播；
 *        当最后一首开始播放时，再拉一批推荐**追加到播放列表末尾**，形成持续更新的私人电台。
 *      - 「发现」是波点首页的运营模块（`service/home/index` + `service/home/module`），
 *        通过 `contributes.homeSections` 以「波点发现」标签页挂到澜音「发现」页。
 *
 * 抓包结论（详见 docs/bodian-api.md）：
 *   - bd-api.kuwo.cn 不需要 Cookie；
 *   - 只要【不带 timestamp 参数】就不会触发 sign 校验（带 timestamp 但 sign 错误会 400）；
 *   - 服务端对同一设备有频率限制：两次请求间隔 < 300ms 会返回 nginx 400，
 *     因此本插件所有请求走串行队列 + 最小间隔 + 指数退避重试。
 */

/* ================================================================== *
 * 常量
 * ================================================================== */

var API_HOST = 'bd-api.kuwo.cn'
var API = 'https://bd-api.kuwo.cn'
var LYRIC_HOST = 'mlyric.kuwo.cn'

var PROVIDER_ID = 'bd'
var PROVIDER_NAME = '波点音乐'

var STORAGE_SESSION = 'bodian.session'
var STORAGE_DEVICE = 'bodian.device'
var STORAGE_PREFS = 'bodian.prefs'

/** 同一设备连续请求的最小间隔（毫秒）。低于 300ms 服务端会返回 400。 */
var MIN_REQUEST_GAP_MS = 420
var REQUEST_TIMEOUT_MS = 15000
var MAX_RETRY = 3

/**
 * 澜音标准音质名 -> 波点 (format, bitrate)。
 *
 * ⚠️ 波点的 `mflac` / `mgg` / `mmp4` / `zp` 是**专有加密容器**（实测首字节不是
 * fLaC / OggS / ID3 等合法容器头），第三方播放器无法解码，直接播会一直"播放失败"。
 * 因此这些档位全部降级映射到可解码的真实格式：
 *   - flac24bit / hires / atmos / atmos_plus / master -> 普通 flac（真无损，可播）
 */
var QUALITY_TARGET = {
  '128k': { f: 'mp3', b: '128' },
  '192k': { f: 'ogg', b: '192' },
  '320k': { f: 'mp3', b: '320' },
  flac: { f: 'flac', b: '2000' },
  flac24bit: { f: 'flac', b: '2000' },
  hires: { f: 'flac', b: '2000' },
  atmos: { f: 'flac', b: '2000' },
  atmos_plus: { f: 'flac', b: '2000' },
  master: { f: 'flac', b: '2000' }
}
var QUALITY_ORDER = ['128k', '192k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master']

/** 澜音/Chromium 能直接解码的容器。mflac / mgg / mmp4 / zp 一律排除。 */
var PLAYABLE_FORMATS = ['mp3', 'ogg', 'flac']

var DEFAULT_QUALITY = '320k'

/* ---------------- 私人推荐 ---------------- */

/** 推荐内容的会话内缓存时长（毫秒）。10 分钟。 */
var RECOMMEND_CACHE_MS = 600000

/** 推荐加载失败后的重试冷却（毫秒）。避免 setState 重渲染时反复自动重试。 */
var RECOMMEND_RETRY_MS = 30000

/** 每个推荐分区最多展示的歌曲 / 歌单数，避免一次渲染过多卡片。 */
var RECOMMEND_ITEM_LIMIT = 12

/** 首页模块最多取几个。取多了会拖慢首屏（每个模块都要一次请求，且服务端要求串行）。 */
var RECOMMEND_MODULE_LIMIT = 4

/**
 * 从 /api/service/home/index 返回的 moduleList 里挑「发现页」要展示的模块。
 *   type 4  个性化歌单（songList[].songs[]）
 *   type 3  偶遇心动单曲（musicList[]）
 *   type 5  宝藏歌单库（songList[] 是歌单对象，sourceType=13）
 *   type 10 心动收藏相似推荐（musicList[]）
 * 其余模块（轮播图 / 广告 / 排行榜 / 音乐日历 / 数字专辑 / 视频）不属于私人推荐，跳过。
 */
var RECOMMEND_MODULE_TYPES = [4, 3, 10]

/* ================================================================== *
 * 纯 JS 工具（后台 Worker 里没有 Node / DOM，全部自己实现）
 * ================================================================== */

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function utf8Encode(str) {
  var out = []
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i)
    if (c < 0x80) {
      out.push(c)
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      var c2 = str.charCodeAt(++i)
      var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63))
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    }
  }
  return out
}

function utf8Decode(bytes) {
  var s = ''
  for (var i = 0; i < bytes.length; ) {
    var b = bytes[i++]
    if (b < 0x80) {
      s += String.fromCharCode(b)
    } else if (b < 0xe0) {
      s += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63))
    } else if (b < 0xf0) {
      s += String.fromCharCode(((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63))
    } else {
      var cp = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)
      var v = cp - 0x10000
      s += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 1023))
    }
  }
  return s
}

function base64Encode(str) {
  var bytes = utf8Encode(str)
  var out = ''
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i]
    var b1 = bytes[i + 1]
    var b2 = bytes[i + 2]
    out += B64_CHARS.charAt(b0 >> 2)
    out += B64_CHARS.charAt(((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4))
    out += b1 === undefined ? '=' : B64_CHARS.charAt(((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6))
    out += b2 === undefined ? '=' : B64_CHARS.charAt(b2 & 63)
  }
  return out
}

function base64Decode(str) {
  var clean = String(str || '').replace(/[^A-Za-z0-9+/=]/g, '')
  var out = []
  for (var i = 0; i < clean.length; i += 4) {
    var c0 = B64_CHARS.indexOf(clean.charAt(i))
    var c1 = B64_CHARS.indexOf(clean.charAt(i + 1))
    if (c0 < 0 || c1 < 0) break
    var ch2 = clean.charAt(i + 2)
    var ch3 = clean.charAt(i + 3)
    var c2 = ch2 === '=' || ch2 === '' ? -1 : B64_CHARS.indexOf(ch2)
    var c3 = ch3 === '=' || ch3 === '' ? -1 : B64_CHARS.indexOf(ch3)
    out.push((c0 << 2) | (c1 >> 4))
    if (c2 >= 0) out.push(((c1 & 15) << 4) | (c2 >> 2))
    if (c3 >= 0) out.push(((c2 & 3) << 6) | c3)
  }
  return utf8Decode(out)
}

function randomHex(len) {
  var s = ''
  for (var i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

function str(v) {
  return v === undefined || v === null ? '' : String(v)
}

function num(v, fallback) {
  var n = Number(v)
  return isFinite(n) ? n : fallback === undefined ? 0 : fallback
}

function buildQuery(params) {  var parts = []
  for (var k in params) {
    if (!Object.prototype.hasOwnProperty.call(params, k)) continue
    var v = params[k]
    if (v === undefined || v === null) continue
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
  }
  return parts.join('&')
}

/**
 * 波点网关要求的客户端请求头。
 * 实测最小必需集合是 devid / plat / ver / channel —— 缺任意一个都会得到
 * HTTP 402 {"code":402,"msg":"request invalid"}；其余头为兼容原客户端而带上，可省略。
 */
function deviceHeaders(devid) {
  var id = devid || ''
  return {
    'user-agent': 'Dart/3.3 (dart:io)',
    'content-type': 'application/json',
    plat: 'win',
    ver: '1.1.7',
    channel: 'W1',
    devid: id,
    qimei36: id
  }
}

/**
 * 宿主 UI 能力在桌面 / 工作台之间并不完全一致（例如 openView / setState 是桌面扩展），
 * 因此统一做“存在才调用”的包装，缺失时静默降级而不是让业务动作整体失败。
 */
function safeInvoke(fn, args) {
  if (typeof fn !== 'function') return Promise.resolve(null)
  try {
    return Promise.resolve(fn.apply(null, args || []))
  } catch (e) {
    return Promise.resolve(null)
  }
}

function hostUi(ctx, path) {
  var target = ctx && ctx.ui
  var parts = String(path).split('.')
  for (var i = 0; i < parts.length && target; i++) target = target[parts[i]]
  return target
}

/* ================================================================== *
 * 表面主题 / 品牌标记
 * ================================================================== */

/**
 * 先用 prefers-color-scheme 估一个主题，保证首帧不闪错色；
 * Surface 随后 invoke('ui.theme')（读宿主原生主题），再以宿主为准校正。
 */
function preferredTheme() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch (e) {
    /* 忽略 */
  }
  return 'light'
}

function applySurfaceTheme(theme) {
  var el = typeof document !== 'undefined' ? document.documentElement : null
  if (!el) return
  el.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light')
}

/** 读插件内置资源（surface.assets.url 支持 { id } 形式的插件资源）。 */
function loadSurfaceAsset(surface, resourceId, apply) {
  try {
    var assets = surface && surface.assets
    if (!assets || typeof assets.url !== 'function') return
    Promise.resolve(assets.url({ id: resourceId }))
      .then(function (url) {
        if (url) apply(url)
      })
      .catch(function () {
        /* 资源不存在或宿主未接入，忽略 */
      })
  } catch (e) {
    /* 忽略 */
  }
}

/** 登录/推荐页共用的品牌图块（加载到真实 logo 后填入 img）。 */
function brandTileClass(extraClass) {
  return 'bd-brand' + (extraClass ? ' ' + extraClass : '') + ' bd-brand-empty'
}

/* ================================================================== *
 * manifest
 * ================================================================== */



/* ================================================================== *
 * HTTP：串行队列 + 最小间隔 + 重试
 * ================================================================== */

function pickEnvelope(res) {
  if (res === undefined || res === null) return null
  var payload
  if (res.data !== undefined) payload = res.data
  else if (res.body !== undefined) payload = res.body
  else payload = res
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload)
    } catch (e) {
      return { code: -1, msg: payload.slice(0, 200) }
    }
  }
  return payload
}

/**
 * 波点音乐接口客户端。
 * 所有方法都定义在构造函数内部，保证文件顶层只有"字面量 / 函数声明"，
 * 以满足澜音安装器对单文件插件的静态约束。
 */
function BodianClient(ctx, permissionKey) {
  var self = this
  self.ctx = ctx
  self.permissionKey = permissionKey
  self._chain = Promise.resolve()
  self._lastAt = 0

  function throttle() {
    var now = Date.now()
    var wait = self._lastAt + MIN_REQUEST_GAP_MS - now
    if (wait <= 0) {
      self._lastAt = Date.now()
      return Promise.resolve()
    }
    return sleep(wait).then(function () {
      self._lastAt = Date.now()
    })
  }

  /** 串行化所有出网请求，保证任意两次请求间隔 >= MIN_REQUEST_GAP_MS。
   *  这是必须的：服务端对同设备高频请求直接返回 nginx 400。 */
  function enqueue(fn) {
    var run = self._chain.then(function () {
      return throttle().then(fn)
    })
    self._chain = run.then(
      function () {},
      function () {}
    )
    return run
  }

  /**
   * 发一次请求。
   *
   * ⚠️ 两个澜音宿主的硬性行为（已通过读 app.asar 源码 + 实测确认）：
   *   1. `ctx.http.request` 只把 url / method / headers / body / timeoutMs 交给网络层，
   *      **`query` 与 `json` 会被静默忽略**（那两个选项只有 `ctx.http.create()` 包装层才处理）。
   *      所以这里必须自己把 query 拼进 URL、自己把 body 序列化成字符串。
   *   2. 波点网关强制校验客户端头，缺 `devid`/`plat`/`ver`/`channel` 任意一个，
   *      都会返回 `HTTP 402 {"code":402,"msg":"request invalid"}`。
   */
  function once(options) {
    var url = options.url
    if (options.query) {
      var qs = buildQuery(options.query)
      if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs
    }
    var headers = deviceHeaders(self.deviceId || (self.deviceId = randomHex(32)))
    if (options.headers) {
      for (var key in options.headers) {
        if (Object.prototype.hasOwnProperty.call(options.headers, key)) headers[key] = options.headers[key]
      }
    }
    var body
    if (options.json !== undefined) {
      body = JSON.stringify(options.json)
      headers['content-type'] = 'application/json'
    } else if (options.body !== undefined) {
      body = options.body
    }
    var init = {
      method: options.method || 'GET',
      operation: options.operation,
      permissionKey: self.permissionKey,
      timeoutMs: REQUEST_TIMEOUT_MS,
      headers: headers,
      throwHttpErrors: false
    }
    if (body !== undefined) init.body = body
    return Promise.resolve(self.ctx.http.request(Object.assign({ url: url }, init))).then(function (res) {
      return { status: res && res.status, envelope: pickEnvelope(res) }
    })
  }

  /** 统一入口：返回业务 data。失败抛 Error（错误对象带 .fault 供 provider 用）。 */
  self.request = function (options) {
    return enqueue(function () {
      var attempt = 0
      function go() {
        return once(options).then(function (out) {
          var env = out.envelope
          // 网络层可重试错误
          if (env === null || (out.status && out.status >= 500) || out.status === 400 || out.status === 429) {
            if (attempt < MAX_RETRY) {
              attempt++
              return sleep(500 * Math.pow(2, attempt)).then(go)
            }
            throw makeError('NETWORK_ERROR', '波点音乐接口暂时不可用（HTTP ' + (out.status || '未知') + '）')
          }
          if (env && env.code !== undefined && Number(env.code) !== 200) {
            var code = Number(env.code)
            // -1（"请勿频繁操作！"）属于服务端限流，退避重试；
            // 其余业务错误（验证码错误、短信发送失败、登录失败…）重试没有意义，
            // 尤其短信接口绝不能重试，否则会连发多条短信。
            if (code === -1 && attempt < MAX_RETRY) {
              attempt++
              return sleep(600 * Math.pow(2, attempt)).then(go)
            }
            var failure = makeError(codeToFault(code), str(env.msg) || ('接口错误 ' + code))
            failure.bodianCode = code
            throw failure
          }
          return env ? env.data : null
        })
      }
      return go()
    })
  }

  self.get = function (path, query, operation, extraHeaders) {
    return self.request({
      url: API + path,
      method: 'GET',
      query: query,
      operation: operation,
      headers: extraHeaders
    })
  }

  self.postJson = function (path, query, json, operation, extraHeaders) {
    return self.request({
      url: API + path,
      method: 'POST',
      query: query,
      json: json,
      operation: operation,
      headers: extraHeaders
    })
  }
}

function makeError(code, message) {
  var err = new Error(message || code)
  err.fault = { code: code, message: message || code }
  return err
}

function codeToFault(code) {
  if (code === 11027 || code === 11004 || code === 11002) return 'AUTH_REQUIRED'
  if (code === 11003) return 'UNSUPPORTED'
  if (code === 11008 || code === 11009) return 'ENTITLEMENT_EXPIRED'
  if (code === -1) return 'RATE_LIMITED'
  if (code === -404) return 'NOT_FOUND'
  return 'INTERNAL'
}

function toFault(error, fallbackMessage) {
  if (error && error.fault) return error.fault
  var message = (error && error.message) || fallbackMessage || '波点音乐请求失败'
  return { code: 'NETWORK_ERROR', message: message, retryable: true }
}

/* ================================================================== *
 * 账号状态
 * ================================================================== */

function Account(ctx, client) {
  this.ctx = ctx
  this.client = client
  this.session = null
  this.deviceId = null
  this._loaded = false
  defineAccountMethods(this)
}

/* 账号方法同样定义在构造函数内部（见 BodianClient 上的说明）。 */
function defineAccountMethods(account) {
  account.load = function () {
    var self = account
    // 设备号必须同步给 HTTP 客户端：波点网关缺 devid 会直接返回 402。
    var syncDevice = function () {
      if (!self.deviceId) self.deviceId = randomHex(32)
      self.client.deviceId = self.deviceId
      return self.session
    }
    if (self._loaded) return Promise.resolve(syncDevice())
    return Promise.resolve(self.ctx.storage.get(STORAGE_DEVICE))
      .then(function (device) {
        self.deviceId = device || randomHex(32)
        if (!device) return self.ctx.storage.set(STORAGE_DEVICE, self.deviceId)
      })
      .then(function () {
        return self.ctx.storage.get(STORAGE_SESSION)
      })
      .then(function (saved) {
        if (saved && saved.token && saved.uid) {
          self.session = { uid: str(saved.uid), token: str(saved.token), userInfo: saved.userInfo || {}, savedAt: saved.savedAt || 0 }
        }
        self._loaded = true
        return syncDevice()
      })
      .catch(function () {
        self._loaded = true
        return syncDevice()
      })
  }

  account.isSignedIn = function () {
    var self = account
    return !!(self.session && self.session.token && self.session.uid && self.session.uid !== '-1')
  }

  /** 未登录时使用 uid=-1 / token= 仍可搜索与读取公开内容。 */
  account.credentials = function () {
    if (account.isSignedIn()) return { uid: account.session.uid, token: account.session.token }
    return { uid: '-1', token: '' }
  }

  account.require = function () {
    if (!account.isSignedIn()) {
      throw makeError('AUTH_REQUIRED', '请先登录波点音乐账号')
    }
    return account.session
  }

  account.save = function (session) {
    account.session = session
    return Promise.resolve(account.ctx.storage.set(STORAGE_SESSION, session)).then(function () {
      return session
    })
  }

  account.clear = function () {
    account.session = null
    return Promise.resolve(account.ctx.storage.delete(STORAGE_SESSION))
  }

  account.summary = function () {
    if (!account.isSignedIn()) {
      return { signedIn: false, displayName: '未登录波点音乐' }
    }
    var info = account.session.userInfo || {}
    var vip = num(info.isVip) > 0 || num(info.vipType) > 0
    return {
      signedIn: true,
      displayName: str(info.nickname) || ('波点用户 ' + account.session.uid),
      avatarUrl: str(info.headImg) || str(info.pic) || str(info.headPic) || undefined,
      badge: vip ? (str(info.vipName) || 'VIP') : undefined
    }
  }

  return account
}

/* ================================================================== *
 * 波点音乐业务接口
 * ================================================================== */

function sendSmsCode(account, mobile, operation) {
  return account.client.get(
    '/api/ucenter/code/sendsms',
    { uid: '-1', token: '', type: 1, mobile: mobile },
    operation
  )
}

function loginByMobile(account, mobile, verifyCode, operation) {
  return account.client.postJson(
    '/api/ucenter/users/login',
    { uid: '-1', token: '' },
    { authType: 1, mobile: mobile, verifyCode: verifyCode },
    operation
  )
}

/** 二维码取码：data.qrCode 是 16 位 hex key。 */
function qrCreateChallenge(account, operation) {
  return account.client.get('/api/ucenter/login/qrCode', { uid: '-1', token: '' }, operation)
}

/** 二维码状态：data.status 1=等待扫码 2=已过期 3=已扫码确认。 */
function qrChallengeStatus(account, key, operation) {
  return account.client.get(
    '/api/ucenter/login/qrCodeStatus',
    { uid: '-1', token: '', qrCode: key },
    operation
  )
}

/**
 * 用二维码 key 换取会话。
 * authType 必须是 10；authType=9 会返回「扫码人以外」的账号会话（已实测，禁止使用）。
 */
function loginByQrCode(account, key, operation) {
  return account.client.postJson(
    '/api/ucenter/users/login',
    { uid: '-1', token: '' },
    { authType: 10, qrCode: key },
    operation
  )
}

/** 二维码内容必须是完整落地页，不能只放 key。 */
var QR_LOGIN_LANDING = 'https://bodian-oia.kuwo.cn/bodian/download.html?pageName=login_pc&pt=3&id='

/* ================================================================== *
 * 波点评论（对接澜音播放页的评论浮层）
 *
 * 宿主的「热门评论 / 最新评论」通过 music.requestSdk("getHotComment"/"getComment")
 * 找到本插件注册的 action comments.hot / comments.get，input 形如：
 *   { source, song, page, limit }
 * 期望 output：
 *   { comments: [{ id, avatar, userName, timeStr, text, images?, likedCount, reply? }], total, maxPage }
 * 宿主评论浮层是只读的，所以这里只做读取，不提供发布/点赞入口。
 * ================================================================== */

/** 评论服务的 moduleId 只接受 32 位正整数。 */
var COMMENT_MAX_MODULE_ID = 2147483647
var COMMENT_MAX_PAGE_SIZE = 30
var COMMENT_REPLY_EMBED_LIMIT = 2

function firstNonEmpty() {
  for (var i = 0; i < arguments.length; i++) {
    var value = str(arguments[i])
    if (value) return value
  }
  return ''
}

/** 校验并返回可查询评论的 musicId。 */
function commentModuleId(raw) {
  var text = str(raw).trim()
  if (!/^\d+$/.test(text)) throw makeError('UNSUPPORTED', '歌曲 ID 无效，无法读取评论')
  var value = Number(text)
  if (!isFinite(value) || value <= 0 || value > COMMENT_MAX_MODULE_ID) {
    throw makeError('UNSUPPORTED', '这首歌的音源暂不支持评论')
  }
  return value
}

/** 从宿主传入的 songInfo 里取评论可用的 musicId。 */
function commentSongModuleId(song) {
  var ref = song && song.pluginResource
  var candidates = [ref && ref.id, ref && ref.data && ref.data.id, song && song.songmid, song && song.id]
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] !== undefined && candidates[i] !== null && candidates[i] !== '') {
      return commentModuleId(candidates[i])
    }
  }
  throw makeError('UNSUPPORTED', '歌曲信息缺少 ID，无法读取评论')
}

/** 评论接口统一走 plat: android，不签名。 */
function commentRequestHeaders() {
  return { plat: 'android' }
}

function normalizeComment(dto) {
  var anonymous = num(dto && dto.anonymous) !== 0
  var user = (dto && dto.userInfo) || {}
  return {
    id: num(dto && dto.id),
    uid: num(dto && dto.uid),
    nickname: anonymous ? '匿名听友' : firstNonEmpty(dto && dto.nickname, user.nickname, '听友'),
    avatar: anonymous ? '' : firstNonEmpty(dto && dto.headImg, user.headImg),
    content: str(dto && dto.content),
    image: firstNonEmpty(dto && dto.imgUrl),
    time: firstNonEmpty(dto && dto.publishTime, dto && dto.createTime),
    likeCount: Math.max(0, num(dto && dto.likeCount)),
    replyCount: Math.max(0, num(dto && dto.replyCount))
  }
}

function normalizeCommentPage(data) {
  var list = (data && data.comment_list) || []
  var items = []
  for (var i = 0; i < list.length; i++) {
    var item = normalizeComment(list[i])
    if (item.id > 0) items.push(item)
  }
  return { items: items, total: Math.max(0, num(data && data.comment_total)) }
}

function fetchSongComments(account, musicId, sort, page, pageSize, operation) {
  var cred = account.credentials()
  var path = sort === 'new' ? '/api/comments/v3/new' : '/api/comments/v3/hot'
  return account.client
    .get(
      path,
      {
        uid: cred.uid,
        token: cred.token,
        moduleType: 2,
        moduleId: musicId,
        pn: page,
        rn: pageSize
      },
      operation,
      commentRequestHeaders()
    )
    .then(normalizeCommentPage)
}

function fetchSongCommentReplies(account, musicId, parentId, operation) {
  return account.client
    .get(
      '/api/comments/v3/replies',
      { moduleType: 2, moduleId: musicId, parentId: parentId, pn: 1, rn: 30 },
      operation,
      commentRequestHeaders()
    )
    .then(normalizeCommentPage)
}

/** 映射成宿主评论浮层使用的字段名。 */
function toHostComment(item, page, pageSize, total) {
  return {
    id: item.id,
    userId: String(item.uid || ''),
    userName: item.nickname,
    avatar: item.avatar,
    timeStr: item.time,
    text: item.content,
    images: item.image ? [item.image] : [],
    likedCount: item.likeCount,
    reply: []
  }
}

function toHostReply(item) {
  return {
    id: item.id,
    userId: String(item.uid || ''),
    userName: item.nickname,
    avatar: item.avatar,
    text: item.content
  }
}

/**
 * 读取一页评论并映射成宿主结构。
 * 每条评论的回复由接口单独提供，这里只给前 3 条「有回复」的评论补一次回复请求，
 * 避免一页 20~30 条评论打出几十次请求（宿主浮层只需要展开时能看到回复）。
 */
function loadHostCommentPage(account, song, sort, page, pageSize, operation) {
  var musicId
  try {
    musicId = commentSongModuleId(song)
  } catch (e) {
    // 音源 ID 不支持评论时返回空列表，让宿主显示「暂无评论」而不是弹错误
    return Promise.resolve({ comments: [], total: 0, maxPage: 0 })
  }
  var pn = Math.max(1, num(page, 1))
  var rn = Math.max(1, Math.min(COMMENT_MAX_PAGE_SIZE, num(pageSize, 20)))
  return fetchSongComments(account, musicId, sort, pn, rn, operation).then(function (pageData) {
    var comments = []
    for (var i = 0; i < pageData.items.length; i++) {
      comments.push(toHostComment(pageData.items[i]))
    }
    var maxPage = pageData.total > 0 ? Math.ceil(pageData.total / rn) : comments.length ? 1 : 0
    var result = { comments: comments, total: pageData.total, maxPage: maxPage }
    var targets = []
    // 只在第 1 页内嵌回复：翻页/下拉时不再补请求，避免一页几十次调用
    if (pn === 1) {
      for (var k = 0; k < pageData.items.length && targets.length < COMMENT_REPLY_EMBED_LIMIT; k++) {
        if (pageData.items[k].replyCount > 0) targets.push({ index: k, id: pageData.items[k].id })
      }
    }
    return targets
      .reduce(function (chain, target) {
        return chain.then(function () {
          return fetchSongCommentReplies(account, musicId, target.id, operation)
            .then(function (replyData) {
              var replies = []
              for (var r = 0; r < replyData.items.length; r++) replies.push(toHostReply(replyData.items[r]))
              result.comments[target.index].reply = replies
            })
            .catch(function () {
              /* 回复拉取失败不影响主评论列表 */
            })
        })
      }, Promise.resolve())
      .then(function () {
        return result
      })
  })
}

/** 搜索：/api/search/music/list */
function searchMusic(account, keyword, page, limit, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/search/music/list',
    {
      pn: Math.max(0, page - 1),
      rn: Math.max(1, Math.min(100, limit)),
      keyword: keyword,
      correct: 1,
      uid: cred.uid,
      token: cred.token
    },
    operation
  )
}

/** 我喜欢的音乐（单歌单元信息） */
function fetchFond(account, operation) {
  var session = account.require()
  return account.client.get(
    '/api/service/playlist/fond',
    { userId: session.uid, uid: session.uid, token: session.token },
    operation
  )
}

/** 我的自建歌单 */
function fetchUserPlaylists(account, operation) {
  var session = account.require()
  return account.client.get(
    '/api/service/playlist/userCreate',
    { userId: session.uid, uid: session.uid, token: session.token, pn: 1, rn: 100 },
    operation
  )
}

/** 收藏的歌单 / 专辑（type=4）/ 关注的歌手（type=7） */
function fetchCollect(account, type, operation) {
  var session = account.require()
  return account.client.get(
    '/api/service/collect/' + type + '/list',
    { userId: session.uid, uid: session.uid, token: session.token, pn: 1, rn: 100 },
    operation
  )
}

/** 歌单歌曲列表（分页）。source 默认 5（波点歌单），宝藏歌单库等外部歌单要传各自的 sourceType。 */
function fetchPlaylistTracks(account, playlistId, page, limit, operation, source) {
  var cred = account.credentials()
  return account.client.get(
    '/api/service/playlist/' + encodeURIComponent(playlistId) + '/musicList',
    {
      source: source === undefined || source === null ? 5 : source,
      pn: Math.max(1, page),
      rn: Math.max(1, Math.min(100, limit)),
      uid: cred.uid,
      token: cred.token
    },
    operation
  )
}

/** 歌单分类目录（澜音「发现 → 歌单」页的标签）。 */
function fetchPlaylistCategories(account, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/service/category/list',
    { uid: cred.uid, token: cred.token },
    operation
  )
}

/**
 * 分类下的歌单（分页）。
 * categoryId 为 'hot' / 空时取 /service/category/playlist（推荐歌单）；
 * 其余为 /service/category/{子分类 id}/playlist。
 */
function fetchCategoryPlaylists(account, categoryId, page, limit, operation) {
  var cred = account.credentials()
  var id = str(categoryId)
  var path = !id || id === 'hot' ? '/api/service/category/playlist' : '/api/service/category/' + encodeURIComponent(id) + '/playlist'
  return account.client.get(
    path,
    {
      uid: cred.uid,
      token: cred.token,
      pn: Math.max(1, page),
      rn: Math.max(1, Math.min(100, limit))
    },
    operation
  )
}

/** 歌单搜索（澜音搜索页的「歌单」标签）。 */
function searchPlaylists(account, keyword, page, limit, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/search/playlist/list',
    {
      uid: cred.uid,
      token: cred.token,
      keyword: keyword,
      pn: Math.max(0, page - 1),
      rn: Math.max(1, Math.min(100, limit))
    },
    operation
  )
}

/** 排行榜歌曲（分页）：/api/service/bang/{bangId}/musics。 */
function fetchChartTracks(account, bangId, page, limit, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/service/bang/' + encodeURIComponent(bangId) + '/musics',
    {
      uid: cred.uid,
      token: cred.token,
      pn: Math.max(1, page),
      rn: Math.max(1, Math.min(100, limit))
    },
    operation
  )
}

/**
 * 私人推荐：首页模块清单。
 * 实测 /api/service/home/index 返回 data.moduleList[]：
 *   { id, type, name, delayMs }
 * 未登录（uid=-1&token=）同样可用，此时是公开推荐。
 */
function fetchHomeIndex(account, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/service/home/index',
    { uid: cred.uid, token: cred.token },
    operation
  )
}

/**
 * 私人推荐：单个首页模块内容。
 * GET /api/service/home/module?moduleId=<id>，不同 type 的 data 形状不同（见 docs/bodian-api.md）。
 */
function fetchHomeModule(account, moduleId, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/service/home/module',
    { moduleId: moduleId, uid: cred.uid, token: cred.token },
    operation
  )
}

/**
 * 私人推荐电台：`recommendList`。
 * 实测这个接口不按 totalNum / scrollNum 分页 —— 每次调用固定返回 **6 首随机推荐**
 * （大部分带 fsig，和 波点 私人推荐页播放的歌曲特征一致）。所以「下一首」就是再拉一批。
 */
function fetchRecommendSongs(account, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/service/music/recommendList',
    {
      fg: 1,
      lock: 0,
      lastColdStartTime: Date.now() - 60000,
      scrollNum: 3,
      resourceId: 0,
      recoMode: 'normal',
      source: 0,
      sourceId: 0,
      totalNum: 6,
      uid: cred.uid,
      token: cred.token
    },
    operation
  )
}

/** 播放权限校验 */
function checkRight(account, musicId, freeSign, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/play/music/v2/checkRight',
    { uid: cred.uid, token: cred.token, musicId: musicId, freeSign: freeSign || '' },
    operation
  )
}

/** 获取播放地址：注意【不带 timestamp / sign】 */
function fetchAudioUrl(account, musicId, format, bitrate, freeSign, operation) {
  var cred = account.credentials()
  return account.client.get(
    '/api/play/music/v2/audioUrl',
    {
      uid: cred.uid,
      token: cred.token,
      devId: account.deviceId,
      musicId: musicId,
      format: format,
      br: bitrate + 'k' + format,
      freeSign: freeSign || ''
    },
    operation,
    { token: cred.token, uid: cred.uid }
  )
}

/** 歌词 */
function fetchLyric(account, songId, songName, artist, operation) {
  var cred = account.credentials()
  var payload =
    'type=lyric&req=2&lrcx=1&rid=' +
    songId +
    '&songname=' +
    str(songName) +
    '&artist=' +
    str(artist) +
    '&corp=kuwo&fromchannel=bodian'
  var query = {
    f: 'bodian',
    q: base64Encode(payload),
    uid: cred.uid,
    token: cred.token
  }
  return account.client.request({
    url: 'https://' + LYRIC_HOST + '/mobi.s?' + buildQuery(query),
    method: 'GET',
    operation: operation
  })
}

/* ================================================================== *
 * 数据映射：波点 -> 澜音标准数据
 * ================================================================== */

function songArtists(song) {
  if (song && Array.isArray(song.artists) && song.artists.length) {
    var names = []
    for (var i = 0; i < song.artists.length; i++) {
      var a = song.artists[i]
      if (a && a.name) names.push(str(a.name))
    }
    if (names.length) return names
  }
  return str(song && song.artist)
    .split(/[&、,，/]/)
    .map(function (s) {
      return s.trim()
    })
    .filter(Boolean)
}

function songAudios(song) {
  var out = []
  if (song && Array.isArray(song.audios)) {
    for (var i = 0; i < song.audios.length; i++) {
      var a = song.audios[i]
      if (!a || a.format === undefined || a.bitrate === undefined) continue
      out.push({ b: str(a.bitrate), f: str(a.format), l: str(a.level) })
    }
  }
  return out
}

/** 把波点的歌曲对象映射成澜音 ContentEntity */
function songToEntity(pluginId, song) {
  var id = str(song.id !== undefined ? song.id : song.rid)
  var name = str(song.name || song.songName)
  var artists = songArtists(song)
  var pic = str(song.albumPic120 || song.albumPic || song.pic || song.artistPic)
  var durationSec = num(song.duration)
  var audios = songAudios(song)
  var data = {
    id: id,
    rid: str(song.musicRid) || 'MUSIC_' + id,
    name: name,
    artist: artists.join('&'),
    album: str(song.album),
    albumId: str(song.albumId),
    duration: durationSec,
    pic: pic,
    fsig: str(song.fsig),
    audios: audios
  }
  var qualities = playableQualityNames(audios)
  return {
    ref: {
      pluginId: pluginId,
      providerId: PROVIDER_ID,
      kind: 'track',
      id: id,
      data: data
    },
    title: name || '未知歌曲',
    subtitle: artists.join(' / '),
    durationMs: durationSec * 1000,
    playable: true,
    capabilities: ['music.resolve@1', 'music.lyrics@1'],
    metadata: {
      artists: artists,
      album: { id: str(song.albumId), title: str(song.album) },
      artworkUrl: pic,
      durationMs: durationSec * 1000,
      qualities: qualities
    },
    extensions: { artworkUrl: pic, musicRid: data.rid }
  }
}

/** 把波点的歌单对象映射成澜音 MusicPlaylist */
function playlistToEntity(pluginId, item, fallbackKind) {
  var id = str(item.id !== undefined ? item.id : item.playlistId)
  var name = str(item.name || item.title)
  var pic = str(item.pic || item.cover || item.albumPic)
  var count = num(item.musicCount !== undefined ? item.musicCount : item.total)
  return {
    ref: {
      pluginId: pluginId,
      providerId: PROVIDER_ID,
      kind: 'playlist',
      id: id,
      data: { id: id, name: name, pic: pic, trackCount: count, sourceType: num(item.sourceType, 5) }
    },
    title: name || '未命名歌单',
    subtitle: count ? count + ' 首' : num(item.playNum) ? num(item.playNum) + ' 次播放' : str(item.creatorName),
    capabilities: ['music.list@1', 'music.playlist@1', 'music.playlist.tracks@1'],
    playlist: {
      trackCount: count,
      description: str(item.description),
      author: str(item.creatorName),
      artworkUrl: pic
    },
    extensions: { artworkUrl: pic, kind: fallbackKind || 'playlist' }
  }
}

/** 歌单分类实体：宿主用它渲染「发现 → 歌单」页的分类标签。 */
function playlistCategoryToEntity(pluginId, id, title, group, hot) {
  var extensions = { group: group || '分类' }
  if (hot) extensions.hot = true
  return {
    ref: {
      pluginId: pluginId,
      providerId: PROVIDER_ID,
      kind: 'playlist-category',
      id: str(id)
    },
    title: title || '未命名分类',
    capabilities: ['music.playlist.list@1'],
    extensions: extensions
  }
}

/** 排行榜实体：宿主「发现 → 排行榜」页的卡片。 */
function chartToEntity(pluginId, board) {
  var id = str(board && board.id)
  var name = str(board && board.name) || '未命名榜单'
  var pic = str(board && board.pic)
  var pub = str(board && board.pub)
  return {
    ref: {
      pluginId: pluginId,
      providerId: PROVIDER_ID,
      kind: 'chart',
      id: id
    },
    title: name,
    subtitle: pub ? '更新于 ' + pub : '',
    capabilities: ['music.chart.tracks@1'],
    chart: {
      artworkUrl: pic,
      updateFrequency: pub ? '更新于 ' + pub : ''
    },
    extensions: { artworkUrl: pic, pub: pub }
  }
}

/** 歌单搜索结果 -> playlistToEntity 认识的对象。 */
function searchPlaylistToPlain(item) {
  return {
    id: item && (item.id !== undefined ? item.id : item.playlistId),
    name: str(item && (item.name || item.title)),
    pic: str(item && (item.pic || item.cover)),
    musicCount: num(item && (item.musicnum !== undefined ? item.musicnum : item.musicCount)),
    playNum: num(item && (item.playnum !== undefined ? item.playnum : item.playNum)),
    creatorName: str(item && (item.creator_name || item.creatorName)),
    sourceType: num(item && (item.source !== undefined ? item.source : item.sourceType), 5),
    description: str(item && item.hitcontent)
  }
}

/** 把可解码的 audios 映射成澜音标准音质名（用于歌曲卡片上的音质标签）。 */
function playableQualityNames(audios) {
  var names = []
  function has(f, b) {
    for (var i = 0; i < audios.length; i++) {
      if (audios[i].f === f && audios[i].b === b) return true
    }
    return false
  }
  if (has('mp3', '128')) names.push('128k')
  if (has('ogg', '192') || has('ogg', '300')) names.push('192k')
  if (has('mp3', '320')) names.push('320k')
  if (has('flac', '2000')) names.push('flac')
  if (!names.length) names.push('128k')
  return names
}

/** 服务端返回的容器是否可解码。 */
function isPlayableAudio(audio) {
  return PLAYABLE_FORMATS.indexOf(str(audio && audio.format).toLowerCase()) >= 0
}

/* ================================================================== *
 * 波点发现：把首页模块响应映射成 Native View 分区
 * ================================================================== */

/**
 * 歌曲分区（layout: list）。
 * onPlay 交给 discover.play；宿主会把 { ref, refs } 传回来（refs 是从该首到分区末尾）。
 */
function trackSection(id, title, songs, limit, pluginId) {
  var items = []
  var max = Math.min(songs.length, limit || RECOMMEND_ITEM_LIMIT)
  for (var i = 0; i < max; i++) {
    if (songs[i] && songs[i].id !== undefined) items.push(songToEntity(pluginId, songs[i]))
  }
  if (!items.length) return null
  return {
    id: id,
    title: title,
    layout: 'list',
    items: items,
    onPlay: 'discover.play'
  }
}

/**
 * 歌单分区（layout: grid）。
 * onOpen 复用 library.open —— 它会用 ref 打开澜音原生歌单详情页。
 */
function playlistSection(id, title, playlists, limit, pluginId) {
  var items = []
  var max = Math.min(playlists.length, limit || RECOMMEND_ITEM_LIMIT)
  for (var i = 0; i < max; i++) {
    if (playlists[i] && playlists[i].id !== undefined) items.push(playlistToEntity(pluginId, playlists[i]))
  }
  if (!items.length) return null
  return {
    id: id,
    title: title,
    layout: 'grid',
    items: items,
    onOpen: 'library.open'
  }
}

/** 把「个性化歌单 / 你的主题歌单」里的分组（每个分组带 songs[]）拆成歌曲分区。 */
function groupSections(module, groups, moduleName, maxGroups, pluginId) {
  var sections = []
  var max = Math.min(groups.length, maxGroups || 2)
  for (var i = 0; i < max; i++) {
    var group = groups[i]
    if (!group || !Array.isArray(group.songs) || !group.songs.length) continue
    var title = moduleName
    var groupTitle = str(group.title || group.name)
    if (groupTitle) title += ' · ' + groupTitle
    var section = trackSection('reco-' + module.id + '-' + i, title, group.songs, RECOMMEND_ITEM_LIMIT, pluginId)
    if (section) sections.push(section)
  }
  return sections
}

/**
 * 单条首页模块 -> 若干 Native View 分区。
 * 模块结构来自 /api/service/home/module，实测：
 *   type 3 / 10: { moduleName, type, musicList[] }
 *   type 4 / 11: { moduleName, type, songList: [{ id, title, songs[] }], num }
 *   type 5:      { moduleName, type, songList: [歌单对象] }
 *   type 2:      { moduleName, type, bangList: [{ name, musics[] }] }
 */
function moduleToSections(module, data, pluginId) {
  var sections = []
  if (!data) return sections
  var moduleName = str(data.moduleName || module.name) || '私人推荐'
  var type = num(data.type, num(module.type))

  if (type === 3 || type === 10) {
    var musicList = Array.isArray(data.musicList) ? data.musicList : []
    var tracks = trackSection('reco-' + module.id, moduleName, musicList, RECOMMEND_ITEM_LIMIT, pluginId)
    if (tracks) sections.push(tracks)
    return sections
  }

  if (type === 4 || type === 11) {
    var groups = Array.isArray(data.songList) ? data.songList : []
    return groupSections(module, groups, moduleName, 2, pluginId)
  }

  return sections
}

/**
 * 把 Native View 传回来的 track ref 还原成 ContentEntity（用于 queue.replace）。
 * ref.data 就是 songToEntity 里写入的歌曲数据，足够还原标题 / 歌手 / 封面 / 音质。
 */
function trackRefToEntity(ref) {
  if (!ref || !ref.data) return null
  var data = ref.data
  var artists = str(data.artist)
    .split('&')
    .map(function (name) {
      return name.trim()
    })
    .filter(Boolean)
  var audios = Array.isArray(data.audios) ? data.audios : []
  var durationSec = num(data.duration)
  var pic = str(data.pic)
  return {
    ref: ref,
    title: str(data.name) || '未知歌曲',
    subtitle: artists.join(' / '),
    durationMs: durationSec * 1000,
    playable: true,
    capabilities: ['music.resolve@1', 'music.lyrics@1'],
    metadata: {
      artists: artists,
      album: { id: str(data.albumId), title: str(data.album) },
      artworkUrl: pic,
      durationMs: durationSec * 1000,
      qualities: playableQualityNames(audios)
    },
    extensions: { artworkUrl: pic, musicRid: str(data.rid) }
  }
}

/**
 * 从歌曲可用的 audios 里挑选最接近请求音质的一档。
 *
 * ⚠️ 必须在【可解码格式】里挑：波点的 mflac / mgg / mmp4 / zp 是加密容器，
 * 选到它们必然"播放失败"。所以先按 PLAYABLE_FORMATS 过滤，再在剩下里面挑最接近的。
 * 返回 { f, b }；没有 audios 信息时用 QUALITY_TARGET 兜底。
 */
function pickQuality(audios, requested) {
  var target = QUALITY_TARGET[requested] || QUALITY_TARGET[DEFAULT_QUALITY]
  var playable = []
  if (audios && audios.length) {
    for (var n = 0; n < audios.length; n++) {
      if (PLAYABLE_FORMATS.indexOf(audios[n].f) >= 0) playable.push(audios[n])
    }
  }
  if (!playable.length) return target

  // 1) 完全命中
  for (var i = 0; i < playable.length; i++) {
    if (playable[i].f === target.f && playable[i].b === target.b) return { f: playable[i].f, b: playable[i].b }
  }
  // 2) 同格式、比特率最接近且不超过
  var sameFormat = playable.filter(function (a) {
    return a.f === target.f
  })
  if (sameFormat.length) {
    sameFormat.sort(function (a, b) {
      return num(b.b) - num(a.b)
    })
    var want = num(target.b)
    var best = null
    for (var j = 0; j < sameFormat.length; j++) {
      if (num(sameFormat[j].b) <= want) {
        best = sameFormat[j]
        break
      }
    }
    if (!best) best = sameFormat[sameFormat.length - 1]
    return { f: best.f, b: best.b }
  }
  // 3) 请求音质按排序向下退
  var order = QUALITY_ORDER.indexOf(requested)
  if (order < 0) order = QUALITY_ORDER.indexOf(DEFAULT_QUALITY)
  for (var k = order; k >= 0; k--) {
    var t = QUALITY_TARGET[QUALITY_ORDER[k]]
    for (var m = 0; m < playable.length; m++) {
      if (playable[m].f === t.f && playable[m].b === t.b) return { f: t.f, b: t.b }
    }
  }
  // 4) 兜底：可解码格式里取最高可用
  var sorted = playable.slice().sort(function (a, b) {
    return num(b.b) - num(a.b)
  })
  return { f: sorted[0].f, b: sorted[0].b }
}

/* ================================================================== *
 * 歌词解析
 * ================================================================== */

function parseLrc(text, trackRef) {
  var offsetMs = 0
  var lines = []
  var raw = String(text || '').split(/\r?\n/)
  for (var i = 0; i < raw.length; i++) {
    var line = raw[i].trim()
    if (!line) continue
    var meta = /^\[(ti|ar|al|by|offset|kuwo|ver):(.*)\]$/.exec(line)
    if (meta) {
      if (meta[1] === 'offset') offsetMs = num(meta[2])
      continue
    }
    var m = /^(?:\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\])+(.*)$/.exec(line)
    if (!m) continue
    // 同一行可能带多个时间戳（重复段），取第一个即可。
    var stamps = line.match(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g) || []
    var ts = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/.exec(stamps[0])
    var frac = ts[3] ? num((ts[3] + '000').slice(0, 3)) : 0
    var startMs = num(ts[1]) * 60000 + num(ts[2]) * 1000 + frac
    // 波点返回的逐字标记 <start,dur> 经实测时间轴与行时间戳不自洽
    // （每行都被归一化到约 18 秒），属于无效数据，这里直接剥离，只保留可信的行级时间轴。
    var body = line.replace(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/g, '').replace(/<-?\d+,-?\d+>/g, '')
    lines.push({ startTimeMs: startMs, text: body })
  }
  lines.sort(function (a, b) {
    return a.startTimeMs - b.startTimeMs
  })
  for (var j = 0; j < lines.length - 1; j++) {
    lines[j].endTimeMs = lines[j + 1].startTimeMs
  }
  return {
    format: 'crlyric',
    version: 1,
    track: trackRef,
    offsetMs: offsetMs,
    lines: lines
  }
}

/* ================================================================== *
 * 激活
 * ================================================================== */

function activate(ctx) {
  var client = new BodianClient(ctx, 'network')
  var account = new Account(ctx, client)
  var state = {
    playlists: [],
    likedPlaylist: null,
    lastError: '',
    loading: false
  }

  /** 「波点发现」tab（homeSections，内嵌在澜音发现页）的会话内缓存。 */
  var discover = {
    sections: [],
    updatedAt: 0,
    attemptedAt: 0,
    loading: false,
    error: '',
    pending: null
  }

  /** 「发现 → 排行榜」的榜单目录缓存（首页模块 type=2 即波波排行榜）。 */
  var chartCache = {
    items: [],
    updatedAt: 0,
    pending: null
  }

  /**
   * 私人推荐电台状态。
   * 波点的「私人推荐」不是歌单：每次 recommendList 固定返回 6 首随机推荐。
   * 插件开启时替换队列并切顺序播放；最后一首开始播放时追加下一批到列表末尾。
   */
  var radio = {
    active: false,
    ids: {},
    seen: {},
    order: [],
    prevId: '',
    pending: false,
    disposers: [],
    batches: 0
  }

  function publish() {
    var summary = account.summary()
    var publicState = {
      signedIn: summary.signedIn,
      displayName: summary.displayName,
      avatarUrl: summary.avatarUrl || '',
      badge: summary.badge || '',
      loading: state.loading,
      lastError: state.lastError,
      playlists: state.playlists.map(function (p) {
        return { id: p.ref.id, title: p.title, subtitle: p.subtitle || '', artworkUrl: p.extensions.artworkUrl || '' }
      })
    }
    var setState = hostUi(ctx, 'setState')
    return safeInvoke(setState, ['login', publicState]).then(function () {
      return safeInvoke(setState, ['library', publicState])
    })
  }

  /* ---------------- 波点发现（homeSections 标签页） ---------------- */

  function publishDiscover() {
    return safeInvoke(hostUi(ctx, 'setState'), [
      'discover',
      {
        loading: discover.loading,
        updatedAt: discover.updatedAt,
        error: discover.error,
        sections: discover.sections.length
      }
    ]).catch(function () {
      return null
    })
  }

  /** 拉取「波点发现」数据：首页模块清单 -> 逐个模块内容 -> Native View 分区。 */
  function loadDiscoverData(operation) {
    return fetchHomeIndex(account, operation).then(function (data) {
      var list = (data && data.moduleList) || []
      var picked = []
      for (var i = 0; i < list.length && picked.length < RECOMMEND_MODULE_LIMIT; i++) {
        if (RECOMMEND_MODULE_TYPES.indexOf(num(list[i].type)) >= 0) picked.push(list[i])
      }
      if (!picked.length) return []
      var sections = []

      // 串行逐个取模块：客户端本身就是串行队列，顺序拉取也能保持分区顺序稳定。
      function next(index) {
        if (index >= picked.length) return Promise.resolve(sections)
        var module = picked[index]
        return fetchHomeModule(account, module.id, operation)
          .then(function (moduleData) {
            var part = moduleToSections(module, moduleData, ctx.plugin.id)
            for (var k = 0; k < part.length; k++) sections.push(part[k])
          })
          .catch(function (error) {
            // 单个模块失败不影响其它分区：跳过并记一条日志。
            ctx.log.warn('波点发现模块加载失败，已跳过', {
              moduleId: module.id,
              type: module.type,
              message: (error && error.message) || ''
            })
          })
          .then(function () {
            return next(index + 1)
          })
      }
      return next(0)
    })
  }

  /** 登录态变化后清空发现缓存：推荐内容与账号相关。 */
  function invalidateDiscover() {
    discover.sections = []
    discover.updatedAt = 0
    discover.attemptedAt = 0
    discover.error = ''
  }

  /**
   * 保证发现数据可用（会话内缓存 10 分钟）。
   * force=true 时忽略缓存，实现「换一批」。
   */
  function ensureDiscover(operation, force) {
    if (discover.pending) return discover.pending
    if (!force && discover.sections.length && Date.now() - discover.updatedAt < RECOMMEND_CACHE_MS) {
      return Promise.resolve(discover.sections)
    }
    // 上次失败/为空后，短时间内不再自动重试：否则宿主每次 setState 重渲染都会再打一轮接口。
    if (!force && !discover.sections.length && discover.attemptedAt && Date.now() - discover.attemptedAt < RECOMMEND_RETRY_MS) {
      return Promise.resolve(discover.sections)
    }
    discover.attemptedAt = Date.now()
    discover.loading = true
    discover.error = ''
    var task = loadDiscoverData(operation)
      .then(function (sections) {
        discover.sections = sections
        discover.updatedAt = Date.now()
        discover.loading = false
        if (!sections.length) discover.error = '波点音乐暂时没有返回发现内容'
        return publishDiscover().then(function () {
          return sections
        })
      })
      .catch(function (error) {
        discover.loading = false
        discover.error = (error && error.message) || '发现内容加载失败'
        return publishDiscover().then(function () {
          return discover.sections
        })
      })
    discover.pending = task.then(function (sections) {
      discover.pending = null
      return sections
    })
    return discover.pending
  }

  /** 组装「波点发现」Native View。未登录也展示公开内容，只是文案提示登录后个性化。 */
  function buildDiscoverPage() {
    var summary = account.summary()
    var actions = [{ label: '换一批', action: 'discover.refresh' }]
    if (!summary.signedIn) {
      actions.unshift({ label: '登录波点音乐', action: 'login.open', primary: true })
    }
    var description
    if (discover.error && !discover.sections.length) description = discover.error
    else if (!discover.sections.length && discover.loading) description = '正在为你挑选…'
    else if (!discover.sections.length) description = '暂时没有发现内容，点「换一批」再试试'
    else if (summary.signedIn) description = summary.displayName + ' · 波点音乐发现页内容'
    else description = '未登录 · 当前为公开内容，登录后会按你的口味生成'
    return {
      type: 'page',
      title: '波点发现',
      description: description,
      actions: actions,
      sections: discover.sections
    }
  }

  /* ---------------- 私人推荐电台 ---------------- */

  /**
   * 生成给播放队列 / 事件监听用的 ServiceCall。
   * operation 必须带真实的 AbortSignal（宿主序列化时会校验形状），这里直接造一个长有效期的。
   */
  function radioCall() {
    var signal
    if (typeof AbortController === 'function') {
      signal = new AbortController().signal
    } else {
      signal = {
        aborted: false,
        throwIfAborted: function () {},
        addEventListener: function () {},
        removeEventListener: function () {}
      }
    }
    return {
      permissionKey: 'playback',
      operation: {
        id: 'bodian-radio-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36),
        deadlineAt: Date.now() + 3600000,
        signal: signal
      }
    }
  }

  /** 停止电台（用户切到别的内容、退出账号或插件卸载时调用）。 */
  function stopRadio() {
    radio.active = false
    radio.ids = {}
    radio.order = []
    radio.prevId = ''
    radio.pending = false
    for (var i = 0; i < radio.disposers.length; i++) {
      try {
        radio.disposers[i]()
      } catch (e) {
        /* 忽略 */
      }
    }
    radio.disposers = []
  }

  /** 拉一批推荐；过滤掉本电台已经放过的歌。若整批都重复，清空去重记录再拉一次。 */
  function fetchRadioEntities(operation, retried) {
    return fetchRecommendSongs(account, operation).then(function (data) {
      var list = (data && data.musicList) || []
      var entities = []
      for (var i = 0; i < list.length; i++) {
        var entity = songToEntity(ctx.plugin.id, list[i])
        if (!entity.ref.id) continue
        if (radio.seen[entity.ref.id]) continue
        radio.seen[entity.ref.id] = true
        entities.push(entity)
      }
      if (!entities.length && !retried && list.length) {
        radio.seen = {}
        return fetchRadioEntities(operation, true)
      }
      return entities
    })
  }

  /** 顺序播放模式。注意：宿主只有 sequence / random / single 三种模式，sequence 本身是循环。 */
  function applySequentialMode(call) {
    if (!ctx.player || typeof ctx.player.setMode !== 'function') return Promise.resolve()
    return Promise.resolve(ctx.player.setMode({ repeat: 'off', shuffle: false }, call)).catch(function (error) {
      ctx.log.warn('切换顺序播放失败', { message: (error && error.message) || '' })
    })
  }

  /**
   * 追加下一批推荐到播放列表末尾（不去掉已有歌曲）。
   * 触发时机：当前正在播放的歌曲是「播放列表的最后一首」——即它刚开始播放的那一刻。
   * 这样完全不需要监听播放进度 / 处理无感过渡，也不会打断正在播放的歌曲。
   */
  function appendRadioBatch() {
    if (!radio.active || radio.pending) return
    radio.pending = true
    var call = radioCall()
    fetchRadioEntities(call.operation, false)
      .then(function (entities) {
        if (!entities.length) throw makeError('NOT_FOUND', '波点音乐没有返回新的推荐歌曲')
        for (var i = 0; i < entities.length; i++) {
          radio.ids[entities[i].ref.id] = true
          radio.order.push(entities[i].ref.id)
        }
        radio.batches += 1
        return ctx.queue.append(entities, call)
      })
      .catch(function (error) {
        ctx.log.warn('私人推荐追加下一批失败，稍后会重试', { message: (error && error.message) || '' })
      })
      .then(function () {
        radio.pending = false
      })
  }

  /**
   * 播放心跳：
   * - 当前歌曲是播放列表最后一首、且刚开始播放 → 拉下一批推荐追加到列表末尾；
   * - 用户切去听别的歌 → 电台自动停止，不干扰正常播放。
   */
  function onRadioPlayerChanged(playerState) {
    if (!radio.active || !playerState) return
    var track = playerState.track
    var ref = track && track.ref ? track.ref : null
    var id = ref && ref.id
    var mine = !!(ref && ref.pluginId === ctx.plugin.id && radio.ids[id])

    if (playerState.status === 'playing' && ref && !mine) {
      stopRadio()
      return
    }
    if (!mine || playerState.status !== 'playing') return
    if (id === radio.prevId) return
    radio.prevId = id
    // 当前这首歌就是列表的最后一首（刚开始播放）→ 立刻把下一批加到末尾
    if (id === radio.order[radio.order.length - 1]) appendRadioBatch()
  }

  function ensureRadioEvents() {
    if (radio.disposers.length) return
    if (!ctx.events || typeof ctx.events.on !== 'function') {
      ctx.log.info('宿主未连接播放事件，私人推荐只会播放首批歌曲')
      return
    }
    try {
      radio.disposers.push(
        ctx.events.on(
          'player.changed',
          function (playerState) {
            onRadioPlayerChanged(playerState)
          },
          radioCall()
        )
      )
    } catch (error) {
      ctx.log.warn('私人推荐无法订阅播放心跳，仅播放首批歌曲', { message: (error && error.message) || '' })
    }
  }

  /** 开启私人推荐电台：替换播放队列 -> 切换顺序播放 -> 播放第一首 -> 订阅播放心跳。 */
  function startRadio(operation) {
    return Promise.resolve(account.load()).then(function () {
      if (!ctx.queue || !ctx.player) {
        throw makeError('UNSUPPORTED', '当前环境不支持播放队列控制')
      }
      stopRadio()
      radio.seen = {}
      return fetchRadioEntities(operation).then(function (entities) {
        if (!entities.length) throw makeError('NOT_FOUND', '波点音乐没有返回私人推荐歌曲')
        radio.ids = {}
        radio.order = []
        for (var i = 0; i < entities.length; i++) {
          radio.ids[entities[i].ref.id] = true
          radio.order.push(entities[i].ref.id)
        }
        radio.prevId = ''
        radio.batches = 1
        var call = { permissionKey: 'playback', operation: operation }
        return Promise.resolve(ctx.queue.replace(entities, call))
          .then(function () {
            return applySequentialMode(call)
          })
          .then(function () {
            return ctx.player.play(entities[0].ref, call)
          })
          .then(function () {
            radio.active = true
            ensureRadioEvents()
            return {
              ok: true,
              count: entities.length,
              title: entities[0].title,
              artist: entities[0].subtitle
            }
          })
      })
    })
  }

  function register(id, handler) {
    ctx.effects.add(ctx.actions.register(id, handler))
  }

  /* ---------------- provider ---------------- */

  function providerSearch(request, operation) {
    return Promise.resolve(account.load()).then(function () {
      var page = 1
      var cursor = request && request.cursor
      if (cursor) page = Math.max(1, num(cursor, 1))
      var limit = Math.max(1, Math.min(100, num(request && request.limit, 30)))
      var query = str(request && request.query).trim()
      if (!query) return { items: [] }
      return searchMusic(account, query, page, limit, operation).then(function (data) {
        var list = (data && data.resultList) || []
        var items = []
        for (var i = 0; i < list.length; i++) items.push(songToEntity(ctx.plugin.id, list[i]))
        var total = num(data && data.total)
        var result = { items: items }
        if (total > 0) {
          result.totalEstimate = total
          if (page * limit < total) result.nextCursor = String(page + 1)
        } else if (items.length >= limit) {
          result.nextCursor = String(page + 1)
        }
        return result
      })
    })
  }

  function providerResolve(resource, quality, operation) {
    return Promise.resolve(account.load()).then(function () {
      var data = resource && resource.data ? resource.data : {}
      var musicId = str(data.id || resource.id)
      var audios = data.audios || []
      var requested = quality || DEFAULT_QUALITY
      var picked = pickQuality(audios, requested)
      var freeSign = str(data.fsig)
      var token = account.isSignedIn() ? account.session.token : ''

      // 万一服务端仍回落到加密容器，就按可解码格式逐级重试。
      var fallbacks = [
        { f: 'mp3', b: '320' },
        { f: 'mp3', b: '128' },
        { f: 'ogg', b: '100' }
      ]

      function requestAudio(choice, index) {
        return fetchAudioUrl(account, musicId, choice.f, choice.b, freeSign, operation).then(function (audio) {
          if (isPlayableAudio(audio) || index >= fallbacks.length) {
            if (!isPlayableAudio(audio)) {
              ctx.log.warn('波点返回了无法解码的音频容器', { musicId: musicId, format: str(audio && audio.format) })
            }
            return audio
          }
          ctx.log.info('波点音频容器不可解码，降级重试', { musicId: musicId, from: str(audio && audio.format), to: fallbacks[index].f })
          return requestAudio(fallbacks[index], index + 1)
        })
      }

      var rightStatus = -1
      return checkRight(account, musicId, freeSign, operation)
        .then(function (right) {
          rightStatus = num(right && right.status, -1)
        })
        .catch(function () {
          rightStatus = -1 // 权限校验失败不阻断，audioUrl 会给出真实结果
        })
        .then(function () {
          ctx.log.debug('波点解析播放地址', { musicId: musicId, requested: requested, format: picked.f, bitrate: picked.b })
          return requestAudio(picked, 0)
        })
        .then(function (audio) {
          var url = str(audio && (audio.audioHttpsUrl || audio.audioUrl))
          if (!url) {
            throw makeError(
              'NOT_FOUND',
              rightStatus === 1 || rightStatus === -1
                ? '波点音乐没有返回可播放地址'
                : '该歌曲可能需要 VIP / 购买后才能播放'
            )
          }
          return {
            ok: true,
            url: url,
            expiresAt: Date.now() + 10 * 60 * 1000,
            requestHeaders: { 'user-agent': 'Dart/3.3 (dart:io)' }
          }
        })
        .catch(function (error) {
          return { ok: false, error: toFault(error, '波点音乐播放地址解析失败') }
        })
    })
  }

  function providerLyrics(resource, operation) {
    return Promise.resolve(account.load()).then(function () {
      var data = resource && resource.data ? resource.data : {}
      var songId = str(data.id || resource.id)
      var name = str(data.name)
      var artist = str(data.artist)
      return fetchLyric(account, songId, name, artist, operation).then(function (res) {
        var content = ''
        if (res && res.data && res.data.content) content = base64Decode(res.data.content)
        else if (res && res.content) content = base64Decode(res.content)
        if (!content) {
          return { format: 'crlyric', version: 1, track: resource, offsetMs: 0, lines: [], plainText: '' }
        }
        return parseLrc(content, resource)
      })
    })
  }

  /** 读取账号下的全部歌单（我喜欢 + 自建 + 收藏） */
  function loadPlaylists(operation) {
    account.require()
    return Promise.all([
      fetchFond(account, operation).catch(function () {
        return null
      }),
      fetchUserPlaylists(account, operation).catch(function () {
        return null
      }),
      fetchCollect(account, 4, operation).catch(function () {
        return null
      })
    ]).then(function (res) {
      var fond = res[0]
      var created = (res[1] && res[1].playLists) || []
      var collected = (res[2] && res[2].playLists) || []
      var out = []
      if (fond && fond.id) {
        var liked = playlistToEntity(ctx.plugin.id, fond, 'liked')
        liked.subtitle = '我喜欢的音乐 · ' + num(fond.musicCount) + ' 首'
        out.push(liked)
      }
      for (var i = 0; i < created.length; i++) out.push(playlistToEntity(ctx.plugin.id, created[i], 'created'))
      for (var j = 0; j < collected.length; j++) out.push(playlistToEntity(ctx.plugin.id, collected[j], 'collected'))
      return out
    })
  }

  function providerPlaylistsGet(resource, cursor, operation) {
    return Promise.resolve(account.load()).then(function () {
      var id = str(resource && resource.id)
      var page = Math.max(1, num(cursor, 1))
      var limit = 100
      var meta = resource && resource.data ? resource.data : {}
      // 私人推荐里的「宝藏歌单库」是 QQ 音乐来源（sourceType=13），必须带对应 source 才取得到曲目。
      var source = num(meta.sourceType)
      if (!source) source = 5
      return fetchPlaylistTracks(account, id, page, limit, operation, source).then(function (data) {
        var list = (data && data.list) || []
        var items = []
        for (var i = 0; i < list.length; i++) items.push(songToEntity(ctx.plugin.id, list[i]))
        var total = num(data && data.total)
        var pageResult = { items: items }
        if (total > 0) {
          pageResult.totalEstimate = total
          if (page * limit < total) pageResult.nextCursor = String(page + 1)
        } else if (items.length >= limit) {
          pageResult.nextCursor = String(page + 1)
        }
        pageResult.name = str(meta.name)
        return pageResult
      })
    })
  }

/** 澜音「发现 → 歌单」：分类标签（热门 + 各分类组）。 */
  function providerPlaylistsCategories(operation) {
    return Promise.resolve(account.load())
      .then(function () {
        return fetchPlaylistCategories(account, operation)
      })
      .then(function (data) {
        var items = []
        var customs = (data && data.customCategory) || []
        // 自定义分类里只有「推荐」作为热门标签；「歌单」与推荐同源，跳过避免重复
        if (customs.length) {
          items.push(playlistCategoryToEntity(ctx.plugin.id, 'hot', str(customs[0].name) || '推荐', '热门', true))
        }
        var groups = (data && data.categories) || []
        for (var g = 0; g < groups.length; g++) {
          var group = groups[g]
          if (!group) continue
          var subs = group.subCategories || []
          for (var k = 0; k < subs.length; k++) {
            if (!subs[k] || subs[k].id === undefined) continue
            items.push(playlistCategoryToEntity(ctx.plugin.id, subs[k].id, str(subs[k].name), str(group.name), false))
          }
        }
        if (!items.length) items.push(playlistCategoryToEntity(ctx.plugin.id, 'hot', '推荐', '热门', true))
        return { items: items, totalEstimate: items.length }
      })
  }

  /** 澜音「发现 → 歌单」：某个分类下的歌单（分页）。 */
  function providerPlaylistsBrowse(resource, cursor, operation) {
    return Promise.resolve(account.load()).then(function () {
      var id = str(resource && resource.id) || 'hot'
      var meta = (resource && resource.data) || {}
      var page = Math.max(1, num(cursor, 1))
      var limit = Math.max(1, Math.min(50, num(meta.limit, 30)))
      return fetchCategoryPlaylists(account, id, page, limit, operation).then(function (data) {
        var list = (data && data.playLists) || []
        var items = []
        for (var i = 0; i < list.length; i++) items.push(playlistToEntity(ctx.plugin.id, list[i], 'category'))
        var total = num(data && data.total)
        if (!total) total = (page - 1) * limit + items.length
        var result = { items: items, totalEstimate: total }
        if (total > page * limit) result.nextCursor = String(page + 1)
        return result
      })
    })
  }

  /** 澜音搜索页的「歌单」标签。 */
  function providerPlaylistsSearch(request, operation) {
    return Promise.resolve(account.load()).then(function () {
      var query = str(request && request.query).trim()
      if (!query) return { items: [] }
      var page = request && request.cursor ? Math.max(1, num(request.cursor, 1)) : 1
      var limit = Math.max(1, Math.min(50, num(request && request.limit, 30)))
      return searchPlaylists(account, query, page, limit, operation).then(function (data) {
        var list = (data && data.resultList) || []
        var items = []
        for (var i = 0; i < list.length; i++) items.push(playlistToEntity(ctx.plugin.id, searchPlaylistToPlain(list[i]), 'search'))
        var total = num(data && data.total)
        var result = { items: items }
        if (total > 0) {
          result.totalEstimate = total
          if (page * limit < total) result.nextCursor = String(page + 1)
        } else if (items.length >= limit) {
          result.nextCursor = String(page + 1)
        }
        return result
      })
    })
  }

  /** 榜单目录：首页模块 type=2（波波排行榜）里的 bangList。 */
  function loadChartBoards(operation) {
    if (chartCache.items.length && Date.now() - chartCache.updatedAt < RECOMMEND_CACHE_MS) {
      return Promise.resolve(chartCache.items)
    }
    if (chartCache.pending) return chartCache.pending
    var task = Promise.resolve(account.load())
      .then(function () {
        return fetchHomeIndex(account, operation)
      })
      .then(function (data) {
        var list = (data && data.moduleList) || []
        var module = null
        for (var i = 0; i < list.length; i++) {
          if (num(list[i].type) === 2) {
            module = list[i]
            break
          }
        }
        if (!module) return []
        return fetchHomeModule(account, module.id, operation).then(function (moduleData) {
          var bangs = (moduleData && moduleData.bangList) || []
          return bangs.filter(function (board) {
            return board && board.id !== undefined && board.id !== null
          })
        })
      })
      .then(function (bangs) {
        chartCache.items = bangs
        chartCache.updatedAt = Date.now()
        return bangs
      })
    chartCache.pending = task.then(
      function (bangs) {
        chartCache.pending = null
        return bangs
      },
      function (error) {
        chartCache.pending = null
        throw error
      }
    )
    return chartCache.pending
  }

  /** 澜音「发现 → 排行榜」：榜单卡片。 */
  function providerChartsList(operation) {
    return loadChartBoards(operation).then(function (bangs) {
      var items = []
      for (var i = 0; i < bangs.length; i++) items.push(chartToEntity(ctx.plugin.id, bangs[i]))
      return { items: items, totalEstimate: items.length }
    })
  }

  /** 澜音「发现 → 排行榜」：榜单歌曲（分页）。 */
  function providerChartsGetTracks(resource, cursor, operation) {
    return Promise.resolve(account.load()).then(function () {
      var id = str(resource && resource.id)
      var page = Math.max(1, num(cursor, 1))
      var limit = 50
      return fetchChartTracks(account, id, page, limit, operation).then(function (data) {
        var list = (data && data.musics) || []
        var items = []
        for (var i = 0; i < list.length; i++) items.push(songToEntity(ctx.plugin.id, list[i]))
        var total = num(data && data.total)
        var result = { items: items }
        if (total > 0) {
          result.totalEstimate = total
          if (page * limit < total) result.nextCursor = String(page + 1)
        } else if (items.length >= limit) {
          result.nextCursor = String(page + 1)
        }
        return result
      })
    })
  }

  ctx.effects.add(
    ctx.providers.register(PROVIDER_ID, {
      tracks: {
        search: providerSearch,
        resolve: providerResolve,
        lyrics: providerLyrics
      },
      playlists: {
        search: providerPlaylistsSearch,
        categories: providerPlaylistsCategories,
        list: providerPlaylistsBrowse,
        get: providerPlaylistsGet
      },
      charts: {
        list: providerChartsList,
        getTracks: providerChartsGetTracks
      },
      /**
       * 评论能力占位：宿主判断「某音源是否支持评论」时会检查 provider 方法表里
       * 有没有 comments.hot / comments.get；真正的读取走同名的 action（见 register）。
       * 这两个函数不会被宿主直接调用。
       */
      comments: {
        hot: function () {
          return Promise.resolve({ comments: [], total: 0, maxPage: 0 })
        },
        get: function () {
          return Promise.resolve({ comments: [], total: 0, maxPage: 0 })
        }
      }
    })
  )

  /* ---------------- 歌单导入器 ---------------- */

  ctx.effects.add(
    ctx.playlistImporters.register('bodian-playlist', {
      getTracks: function (request, operation) {
        return Promise.resolve(account.load()).then(function () {
          var raw = str(request && request.value).trim()
          var m = /(\d{4,})/.exec(raw)
          if (!m) throw makeError('NOT_FOUND', '无法从输入中解析出歌单 ID')
          var playlistId = m[1]
          var cursor = num(request && request.cursor, 0)
          var page = cursor > 0 ? cursor : 1
          var limit = Math.max(1, Math.min(100, num(request && request.limit, 100)))
          return fetchPlaylistTracks(account, playlistId, page, limit, operation).then(function (data) {
            var list = (data && data.list) || []
            var items = []
            for (var i = 0; i < list.length; i++) items.push(songToEntity(ctx.plugin.id, list[i]))
            var total = num(data && data.total)
            var out = { items: items }
            if (total > 0) {
              out.totalEstimate = total
              if (page * limit < total) out.nextCursor = String(page + 1)
            } else if (items.length >= limit) {
              out.nextCursor = String(page + 1)
            }
            var first = list[0]
            if (first && page === 1) {
              out.name = str(first.playlistName) || ('波点歌单 ' + playlistId)
              out.playlist = {
                trackCount: total,
                artworkUrl: str(first.albumPic120 || first.albumPic)
              }
            }
            return out
          })
        })
      }
    })
  )

  /* ---------------- 账号动作 ---------------- */

  register('account.summary', function () {
    return Promise.resolve(account.load()).then(function () {
      return account.summary()
    })
  })

  register('account.refresh', function (_input, operation) {
    return Promise.resolve(account.load()).then(function () {
      if (!account.isSignedIn()) return account.summary()
      return fetchFond(account, operation)
        .then(function () {
          return account.summary()
        })
        .catch(function () {
          return account.summary()
        })
    })
  })

  register('account.logout', function () {
    return Promise.resolve(account.clear()).then(function () {
      state.playlists = []
      stopRadio()
      invalidateDiscover()
      return publish()
        .then(function () {
          return publishDiscover()
        })
        .then(function () {
          return { signedIn: false, displayName: '未登录波点音乐' }
        })
    })
  })

  register('login.open', function () {
    return safeInvoke(hostUi(ctx, 'openView'), ['login']).then(function () {
      return null
    })
  })

  register('login.cancel', function () {
    return null
  })

  register('login.sendCode', function (input, operation) {
    var mobile = str(input && input.mobile).replace(/\D/g, '')
    if (!/^1\d{10}$/.test(mobile)) {
      return Promise.reject(makeError('UNSUPPORTED', '请输入 11 位手机号'))
    }
    return Promise.resolve(account.load())
      .then(function () {
        return sendSmsCode(account, mobile, operation)
      })
      .then(function () {
        return { ok: true, message: '验证码已发送，请注意查收短信' }
      })
  })

  /** 采纳一次登录响应：校验 token/uid -> 落盘 -> 刷新歌单与账号状态（手机号与扫码共用）。 */
  function adoptLoginSession(data, operation) {
    var token = str(data && data.token)
    if (!token) throw makeError('AUTH_REQUIRED', '登录失败：服务器未返回 token')
    var userInfo = (data && data.userInfo) || {}
    var uid = str(data && data.id) || str(userInfo.id) || str(userInfo.uid)
    if (!uid || uid === '-1') throw makeError('AUTH_REQUIRED', '登录失败：服务器未返回用户 ID')
    return account
      .save({ uid: uid, token: token, userInfo: userInfo, savedAt: Date.now() })
      .then(function () {
        stopRadio()
        invalidateDiscover()
        return publishDiscover()
      })
      .then(function () {
        return refreshLibrary(operation).catch(function () {
          return null
        })
      })
      .then(function () {
        return publish()
      })
      .then(function () {
        var summary = account.summary()
        return { ok: true, signedIn: true, displayName: summary.displayName, badge: summary.badge || '' }
      })
  }

  register('login.submit', function (input, operation) {
    var mobile = str(input && input.mobile).replace(/\D/g, '')
    var code = str(input && input.code).replace(/\D/g, '')
    if (!/^1\d{10}$/.test(mobile)) return Promise.reject(makeError('UNSUPPORTED', '请输入 11 位手机号'))
    if (!code) return Promise.reject(makeError('UNSUPPORTED', '请输入短信验证码'))
    return Promise.resolve(account.load())
      .then(function () {
        return loginByMobile(account, mobile, code, operation)
      })
      .then(function (data) {
        return adoptLoginSession(data, operation)
      })
  })

  register('login.qrStart', function (_input, operation) {
    return Promise.resolve(account.load())
      .then(function () {
        return qrCreateChallenge(account, operation)
      })
      .then(function (data) {
        var key = str(data && data.qrCode)
        if (!/^[0-9a-fA-F]{16}$/.test(key)) throw makeError('INTERNAL', '二维码接口返回的 key 格式异常')
        return {
          key: key,
          content: QR_LOGIN_LANDING + key,
          expiresAt: Date.now() + 5 * 60 * 1000
        }
      })
  })

  register('login.qrPoll', function (input, operation) {
    var key = str(input && input.key)
    if (!/^[0-9a-fA-F]{16}$/.test(key)) return Promise.reject(makeError('UNSUPPORTED', '二维码 key 无效'))
    return Promise.resolve(account.load())
      .then(function () {
        return qrChallengeStatus(account, key, operation)
      })
      .then(function (data) {
        return { status: num(data && data.status) }
      })
  })

  register('login.qrComplete', function (input, operation) {
    var key = str(input && input.key)
    if (!/^[0-9a-fA-F]{16}$/.test(key)) return Promise.reject(makeError('UNSUPPORTED', '二维码 key 无效'))
    return Promise.resolve(account.load()).then(function () {
      var attempt = 0
      function exchange() {
        return loginByQrCode(account, key, operation)
          .then(function (data) {
            return adoptLoginSession(data, operation)
          })
          .catch(function (error) {
            var code = error && error.bodianCode
            // 11027 = 已扫未确认（协议规定的中间态）；11052 = 还没扫/没确认，短暂重试
            if (code === 11027 && attempt < 4) {
              attempt += 1
              return sleep(2000).then(exchange)
            }
            if (code === 11052) throw makeError('AUTH_REQUIRED', '二维码尚未确认，请用波点 App 扫码并确认')
            throw error
          })
      }
      return exchange()
    })
  })

/* ---------------- 评论（对接澜音评论浮层） ---------------- */

  register('comments.hot', function (input, operation) {
    return Promise.resolve(account.load()).then(function () {
      return loadHostCommentPage(account, input && input.song, 'hot', input && input.page, input && input.limit, operation)
    })
  })

  register('comments.get', function (input, operation) {
    return Promise.resolve(account.load()).then(function () {
      return loadHostCommentPage(account, input && input.song, 'new', input && input.page, input && input.limit, operation)
    })
  })

    register('search', function (input, operation) {
    return providerSearch({ query: str(input && input.query), limit: 30, cursor: undefined }, operation)
  })

  /* ---------------- 原生歌单区块 ---------------- */

  function refreshLibrary(operation) {
    account.require()
    state.loading = true
    return publish()
      .then(function () {
        return loadPlaylists(operation)
      })
      .then(function (items) {
        state.playlists = items
        state.loading = false
        state.lastError = ''
        return publish().then(function () {
          return { count: items.length }
        })
      })
      .catch(function (error) {
        state.loading = false
        state.lastError = (error && error.message) || '歌单读取失败'
        return publish().then(function () {
          throw error
        })
      })
  }

  register('library.refresh', function (_input, operation) {
    return Promise.resolve(account.load()).then(function () {
      if (!account.isSignedIn()) throw makeError('AUTH_REQUIRED', '请先登录波点音乐账号')
      return refreshLibrary(operation)
    })
  })

  register('library.open', function (input, operation) {
    var ref = input && input.ref
    if (!ref) return null
    return safeInvoke(hostUi(ctx, 'navigation.open'), [{ page: 'playlist', ref: ref }]).then(function () {
      return null
    })
  })

  register('render.library', function (_input, operation) {
    return Promise.resolve(account.load()).then(function () {
      if (!account.isSignedIn()) {
        return {
          type: 'page',
          title: '波点音乐',
          description: '登录后在这里显示你喜欢的音乐、自建歌单和收藏歌单',
          actions: [{ label: '登录波点音乐', action: 'login.open', primary: true }],
          sections: []
        }
      }
      var sections = []
      if (state.playlists.length) {
        sections.push({
          id: 'bodian-playlists',
          title: '波点音乐歌单',
          layout: 'grid',
          items: state.playlists,
          onOpen: 'library.open'
        })
      }
      var summary = account.summary()
      var description
      if (state.lastError) description = '歌单读取失败：' + state.lastError
      else if (state.playlists.length) description = summary.displayName + ' · 共 ' + state.playlists.length + ' 个歌单'
      else description = summary.displayName + ' · 还没有歌单，可在波点音乐创建或收藏后点「刷新」'
      return {
        type: 'page',
        title: '波点音乐',
        description: description,
        actions: [
          { label: '刷新', action: 'library.refresh' },
          { label: '打开波点音乐歌单页', action: 'library.openSection' }
        ],
        sections: sections
      }
    })
  })

  register('library.openSection', function () {
    return safeInvoke(hostUi(ctx, 'navigation.open'), [{ page: 'playlist', sectionId: 'library' }]).then(function () {
      return null
    })
  })

  /* ---------------- 波点发现（homeSections 标签页）动作 ---------------- */

  /**
   * 渲染「波点发现」（homeSections custom 标签页，内嵌在澜音「发现」页）。
   * 首次渲染先返回骨架，数据到位后通过 setState 触发宿主重新 render。
   */
  register('render.discover', function (_input, operation) {
    return Promise.resolve(account.load()).then(function () {
      ensureDiscover(operation, false)
      return buildDiscoverPage()
    })
  })

  /** 换一批：忽略 10 分钟缓存重新拉取，并通过 setState 触发重新渲染。 */
  register('discover.refresh', function (_input, operation) {
    return Promise.resolve(account.load()).then(function () {
      return ensureDiscover(operation, true).then(function () {
        return {
          count: discover.sections.length,
          updatedAt: discover.updatedAt,
          error: discover.error
        }
      })
    })
  })

  /** 播放发现页歌曲：把当前分区（从点击的那首往后）替换进队列，并立即播放。 */
  register('discover.play', function (input, operation) {
    var ref = input && input.ref
    if (!ref || ref.pluginId !== ctx.plugin.id || ref.kind !== 'track') {
      return Promise.reject(makeError('NOT_FOUND', '歌曲引用无效'))
    }
    if (!ctx.queue || !ctx.player) {
      return Promise.reject(makeError('UNSUPPORTED', '当前环境不支持播放队列控制'))
    }
    stopRadio()
    var refs = input && Array.isArray(input.refs) && input.refs.length ? input.refs : [ref]
    var items = []
    for (var i = 0; i < refs.length; i++) {
      if (!refs[i] || refs[i].pluginId !== ctx.plugin.id || refs[i].kind !== 'track') continue
      var entity = trackRefToEntity(refs[i])
      if (entity) items.push(entity)
    }
    if (!items.length) return Promise.reject(makeError('NOT_FOUND', '歌曲引用无效'))
    var call = { permissionKey: 'playback', operation: operation }
    return Promise.resolve(ctx.queue.replace(items, call))
      .then(function () {
        return ctx.player.play(ref, call)
      })
      .then(function () {
        return { ok: true, count: items.length }
      })
  })

  /* ---------------- 私人推荐电台动作 ---------------- */

  /**
   * 开启私人推荐电台（侧边栏「私人推荐」点击后由 web Surface 调用）。
   * 不返回界面，而是直接：拉一批推荐 -> 替换播放队列 -> 播放第一首 -> 订阅心跳续播。
   * 宿主目前没有「打开播放页」的插件 API，所以页面侧会在成功后自动 close 抽屉。
   */
  register('recommend.start', function (_input, operation) {
    return startRadio(operation)
  })

  /* ---------------- 界面主题 ---------------- */

  /** 读取宿主原生主题（app.getInfo().theme），供 surface 校正配色。 */
  register('ui.theme', function () {
    return Promise.resolve()
      .then(function () {
        if (ctx.app && typeof ctx.app.getInfo === 'function') return ctx.app.getInfo()
        return null
      })
      .then(function (info) {
        var theme = info && info.theme === 'dark' ? 'dark' : info && info.theme === 'light' ? 'light' : preferredTheme()
        return { theme: theme }
      })
      .catch(function () {
        return { theme: preferredTheme() }
      })
  })

  /** 宿主主题切换时把新主题推给已打开的 surface（setState → subscribe）。 */
  function watchTheme() {
    if (!ctx.events || typeof ctx.events.on !== 'function') return
    try {
      ctx.effects.add(
        ctx.events.on('theme.changed', function (value) {
          var theme = value && value.theme === 'dark' ? 'dark' : 'light'
          safeInvoke(hostUi(ctx, 'setState'), ['login', { theme: theme }]).catch(function () {})
          safeInvoke(hostUi(ctx, 'setState'), ['recommend', { theme: theme }]).catch(function () {})
        })
      )
    } catch (error) {
      ctx.log.warn('无法订阅主题切换事件', { message: (error && error.message) || '' })
    }
  }

  watchTheme()

  /* ---------------- 初始化 ---------------- */

  return Promise.resolve(account.load())
    .then(function () {
      return publish()
    })
    .then(function () {
      return function () {
        state.playlists = []
        stopRadio()
      }
    })
}

/* ================================================================== *
 * Web Surface：登录页（纯 DOM，无需打包框架）
 * ================================================================== */

/* 插件表面的共享配色 / 组件样式。同样放在函数体内，避免顶层出现拼接/调用。 */
function pluginSurfaceCss() {
  return [
    /* ---------- 语义 token：浅色（默认） ---------- */
    ':root{color-scheme:light;--bd-fg:#152321;--bd-fg-muted:#46564f;--bd-fg-subtle:#5c6d66;',
    '--bd-line:rgba(18,40,34,.14);--bd-line-strong:rgba(18,40,34,.26);--bd-field:#f5faf8;--bd-field-hover:#eaf4f0;',
    '--bd-accent:#0b6b62;--bd-accent-hover:#08554e;--bd-on-accent:#ffffff;--bd-ring:rgba(11,107,98,.32);',
    '--bd-ok:#146c37;--bd-danger:#b3261e;--bd-brand-ink:#1d2b29;',
    '--bd-brand-a:#e9f9cb;--bd-brand-b:#a9f2dd;--bd-brand-c:#3fe0cf}',
    /* ---------- 深色 ---------- */
    ':root[data-theme="dark"]{color-scheme:dark;--bd-fg:#eef7f3;--bd-fg-muted:#b2c4bd;--bd-fg-subtle:#93a8a1;',
    '--bd-line:rgba(226,246,238,.16);--bd-line-strong:rgba(226,246,238,.28);--bd-field:#16201d;--bd-field-hover:#1d2926;',
    '--bd-accent:#5eead4;--bd-accent-hover:#99f6e4;--bd-on-accent:#04241f;--bd-ring:rgba(94,234,212,.34);',
    '--bd-ok:#86efac;--bd-danger:#fca5a5;--bd-brand-ink:#1d2b29;',
    '--bd-brand-a:#e9f9cb;--bd-brand-b:#a9f2dd;--bd-brand-c:#3fe0cf}',
    /* ---------- 基础 ---------- */
    '*,*::before,*::after{box-sizing:border-box}',
    '.bd-surface{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif;color:var(--bd-fg);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}',
    '.bd-surface ::selection{background:rgba(63,224,207,.32);color:var(--bd-fg)}',
    '.bd-surface :focus-visible{outline:none;box-shadow:0 0 0 3px var(--bd-ring);border-radius:10px}',
    '.bd-surface ::-webkit-scrollbar{width:8px;height:8px}',
    '.bd-surface ::-webkit-scrollbar-thumb{background:var(--bd-line-strong);border-radius:999px}',
    /* ---------- 品牌头 ---------- */
    '.bd-brand{width:42px;height:42px;border-radius:13px;overflow:hidden;background:linear-gradient(135deg,var(--bd-brand-a),var(--bd-brand-b) 48%,var(--bd-brand-c));display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--bd-brand-ink);box-shadow:0 0 0 1px rgba(20,60,50,.10),0 10px 22px -16px rgba(10,40,34,.9)}',
    '.bd-brand-img{width:100%;height:100%;object-fit:cover;display:block}',
    '.bd-head{display:flex;align-items:center;gap:13px;margin:0 0 18px}',
    '.bd-title{font-size:16px;font-weight:650;letter-spacing:-.012em;line-height:1.25;margin:0}',
    '.bd-sub{font-size:12px;color:var(--bd-fg-muted);line-height:1.5;margin:3px 0 0}',
    '.bd-desc{font-size:12.5px;color:var(--bd-fg-muted);line-height:1.66;margin:0 0 18px}',
    /* ---------- 表单 ---------- */
    '.bd-field{margin-bottom:12px}',
    '.bd-label{display:block;font-size:12px;font-weight:600;color:var(--bd-fg-muted);letter-spacing:.01em;margin-bottom:7px}',
    '.bd-input{width:100%;height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--bd-line);background:var(--bd-field);color:var(--bd-fg);font:inherit;font-size:14px;line-height:38px;transition:border-color .16s ease,box-shadow .16s ease,background .16s ease;caret-color:var(--bd-accent)}',
    '.bd-input::placeholder{color:var(--bd-fg-subtle);opacity:1}',
    '.bd-input:hover{border-color:var(--bd-line-strong)}',
    '.bd-input:focus{border-color:var(--bd-accent);box-shadow:0 0 0 3px var(--bd-ring);outline:none}',
    '.bd-input:disabled{opacity:.6;cursor:not-allowed}',
    '.bd-row{display:flex;gap:8px;align-items:stretch}',
    '.bd-row .bd-input{flex:1 1 auto;width:auto;min-width:0}',
    /* ---------- 按钮 ---------- */
    '.bd-btn{height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--bd-line-strong);background:transparent;color:var(--bd-fg);font:inherit;font-size:13px;font-weight:650;letter-spacing:.01em;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .08s ease,opacity .16s ease}',
    '.bd-btn:hover{background:var(--bd-field-hover)}',
    '.bd-btn:active{transform:translateY(1px)}',
    '.bd-btn:focus-visible{outline:none;box-shadow:0 0 0 3px var(--bd-ring)}',
    '.bd-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}',
    '.bd-primary{background:var(--bd-accent);border-color:transparent;color:var(--bd-on-accent)}',
    '.bd-primary:hover{background:var(--bd-accent-hover)}',
    '.bd-block{width:100%}',
    /* ---------- 消息 / 提示 ---------- */
    '.bd-msg{display:flex;gap:8px;align-items:flex-start;margin-top:14px;font-size:12.5px;line-height:1.6;min-height:20px;color:var(--bd-fg-muted)}',
    '.bd-msg::before{content:"";width:6px;height:6px;margin-top:7px;border-radius:50%;flex:0 0 auto;background:currentColor;opacity:.75}',
    '.bd-msg:empty::before{display:none}',
    '.bd-ok{color:var(--bd-ok)}',
    '.bd-err{color:var(--bd-danger)}',
    '.bd-hint{font-size:11.5px;color:var(--bd-fg-subtle);line-height:1.7;margin:14px 0 0}',
    /* ---------- 账号信息 ---------- */
    '.bd-user{display:flex;align-items:center;gap:12px;margin:0 0 18px}',
    '.bd-avatar,.bd-avatar-fallback{width:48px;height:48px;border-radius:50%;flex:0 0 auto;box-shadow:inset 0 0 0 1px var(--bd-line)}',
    '.bd-avatar{object-fit:cover;background:var(--bd-field)}',
    '.bd-avatar-fallback{display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:var(--bd-brand-ink);background:linear-gradient(135deg,var(--bd-brand-a),var(--bd-brand-b) 48%,var(--bd-brand-c));box-shadow:inset 0 0 0 1px rgba(20,60,50,.10)}',
    '.bd-name{font-size:14.5px;font-weight:650;line-height:1.3;word-break:break-all}',
    '.bd-badge{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:var(--bd-accent);color:var(--bd-on-accent);font-size:10px;font-weight:700;letter-spacing:.02em;vertical-align:1px}',
    '.bd-actions{display:flex;flex-direction:column;gap:8px;margin-top:4px}',
    '.bd-link{color:var(--bd-accent);font-size:12px;font-weight:650;text-decoration:underline;text-underline-offset:2px;cursor:pointer}'
  ].join('')
}

/* 登录 / 账号面板的附加样式。 */
function surfaceCss() {
  return (
    pluginSurfaceCss() +
    [
      '.bd-wrap{padding:20px 20px 24px}',
      /* 登录方式页签 */
      '.bd-tabs{display:flex;gap:6px;padding:4px;margin:0 0 16px;border-radius:12px;background:var(--bd-field);border:1px solid var(--bd-line)}',
      '.bd-tab{flex:1 1 0;height:34px;border:0;border-radius:9px;background:transparent;color:var(--bd-fg-muted);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;transition:background .16s ease,color .16s ease,box-shadow .16s ease}',
      '.bd-tab:hover{color:var(--bd-fg)}',
      '.bd-tab:focus-visible{outline:none;box-shadow:0 0 0 3px var(--bd-ring)}',
      '.bd-tab[aria-selected="true"]{background:var(--bd-surface);color:var(--bd-fg);box-shadow:0 1px 2px rgba(10,30,25,.12)}',
      /* 二维码登录 */
      '.bd-qr{display:flex;flex-direction:column;align-items:center;gap:12px;margin:4px 0 2px}',
      '.bd-qr-box{width:216px;height:216px;display:flex;align-items:center;justify-content:center;padding:10px;border-radius:16px;background:#fff;box-shadow:inset 0 0 0 1px var(--bd-line),0 10px 26px -20px rgba(10,40,34,.9)}',
      '.bd-qr-box canvas{display:block;width:196px;height:196px}',
      '.bd-qr-skel{width:196px;height:196px;border-radius:10px;background:linear-gradient(100deg,var(--bd-field) 20%,var(--bd-field-hover) 40%,var(--bd-field) 60%);background-size:220% 100%;animation:bd-shimmer 1.4s linear infinite}',
      '@keyframes bd-shimmer{from{background-position:120% 0}to{background-position:-120% 0}}',
      '.bd-qr-status{font-size:12.5px;line-height:1.6;color:var(--bd-fg-muted);text-align:center;min-height:20px}',
      '.bd-qr-bad{color:var(--bd-danger)}',
      '@media (prefers-reduced-motion: reduce){.bd-qr-skel{animation:none}}'
    ].join('')
  )
}

function LoginSurface(surface) {
  var root = surface.root
  var state = {
    method: 'qr',
    mobile: '',
    code: '',
    signedIn: false,
    displayName: '',
    avatarUrl: '',
    badge: '',
    loading: false,
    lastError: '',
    busy: false,
    message: '',
    messageKind: '',
    qr: null,
    qrError: '',
    completing: false
  }
  var countdown = 0
  var timer = null
  var qrTickTimer = null
  var qrPollTimer = null
  var qrPolling = false
  var disposed = false
  var focusApplied = false
  var brandSrc = ''

  root.innerHTML = ''
  applySurfaceTheme(preferredTheme())
  var style = document.createElement('style')
  style.textContent = surfaceCss()
  root.appendChild(style)
  var wrap = document.createElement('div')
  wrap.className = 'bd-wrap bd-surface'
  root.appendChild(wrap)

  /** 把加载到的波点 logo 填进品牌图块（不整页重绘，避免输入焦点丢失）。 */
  function paintBrand() {
    if (!brandSrc) return
    var tile = wrap.querySelector('.bd-brand')
    if (!tile || tile.querySelector('img')) return
    var img = document.createElement('img')
    img.className = 'bd-brand-img'
    img.alt = ''
    img.src = brandSrc
    tile.appendChild(img)
    tile.classList.remove('bd-brand-empty')
  }

  loadSurfaceAsset(surface, 'icon.bodian', function (url) {
    brandSrc = url
    paintBrand()
  })

  function qrStatusText() {
    if (state.qrError) return state.qrError
    if (!state.qr || state.qr.loading) return '正在获取二维码…'
    if (state.qr.expired) return '二维码已过期，请刷新'
    if (state.completing) return '已扫码，正在登录…'
    var remain = Math.max(0, Math.round((state.qr.expiresAt - Date.now()) / 1000))
    var mm = Math.floor(remain / 60)
    var ss = remain % 60
    return '等待扫码 · 剩余 ' + mm + ':' + (ss < 10 ? '0' : '') + ss
  }

  function stopQrTimers() {
    if (qrTickTimer) clearInterval(qrTickTimer)
    if (qrPollTimer) clearInterval(qrPollTimer)
    qrTickTimer = null
    qrPollTimer = null
    qrPolling = false
  }

  function updateQrStatus() {
    if (disposed || !state.qr || state.qr.loading) return
    if (state.qr.expired) return
    if (Date.now() > state.qr.expiresAt) {
      state.qr.expired = true
      stopQrTimers()
      render()
      return
    }
    var node = wrap.querySelector('[data-qr-status]')
    if (node) node.textContent = qrStatusText()
  }

  function drawQr() {
    var canvas = wrap.querySelector('canvas[data-qr]')
    if (!canvas || !state.qr || !state.qr.content) return
    try {
      var matrix = qrCreateMatrix(state.qr.content)
    } catch (e) {
      state.qrError = '二维码生成失败，请刷新'
      render()
      return
    }
    var count = matrix.length
    var quiet = 4
    var scale = Math.max(2, Math.floor(196 / (count + quiet * 2)))
    var pixelSize = (count + quiet * 2) * scale
    canvas.width = pixelSize
    canvas.height = pixelSize
    var g = canvas.getContext('2d')
    if (!g) return
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, pixelSize, pixelSize)
    g.fillStyle = '#101828'
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (matrix[r][c] === 1) g.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale)
      }
    }
  }

  function startQr() {
    if (state.busy || state.signedIn) return
    stopQrTimers()
    state.qrError = ''
    state.completing = false
    state.qr = { loading: true, key: '', content: '', expiresAt: 0, expired: false }
    render()
    surface
      .invoke('login.qrStart', {})
      .then(function (res) {
        if (disposed) return
        if (!res || !res.content) throw new Error('二维码接口未返回内容')
        state.qr = {
          loading: false,
          key: res.key,
          content: res.content,
          expiresAt: num(res.expiresAt) || Date.now() + 5 * 60 * 1000,
          expired: false
        }
        render()
        startQrTimers()
      })
      .catch(function (error) {
        if (disposed) return
        state.qr = null
        state.qrError = errorText(error)
        render()
      })
  }

  function pollQr() {
    if (disposed || qrPolling || state.completing) return
    if (!state.qr || state.qr.loading || !state.qr.key || state.qr.expired) return
    qrPolling = true
    var key = state.qr.key
    surface
      .invoke('login.qrPoll', { key: key })
      .then(function (res) {
        qrPolling = false
        if (disposed || !state.qr || state.qr.key !== key) return
        var statusValue = num(res && res.status)
        if (statusValue === 3) {
          completeQr()
        } else if (statusValue === 2) {
          state.qr.expired = true
          stopQrTimers()
          render()
        }
      })
      .catch(function () {
        // 单次轮询失败按网络抖动处理，不打断二维码本身
        qrPolling = false
      })
  }

  function completeQr() {
    if (disposed || state.completing || !state.qr || !state.qr.key) return
    state.completing = true
    stopQrTimers()
    render()
    surface
      .invoke('login.qrComplete', { key: state.qr.key })
      .then(function (res) {
        if (disposed) return
        state.completing = false
        var name = (res && res.displayName) || ''
        if (res && res.signedIn) {
          state.signedIn = true
          state.displayName = name || '波点音乐用户'
          state.badge = (res && res.badge) || ''
          state.message = '登录成功' + (name ? '：' + name : '') + '，歌单会同步到澜音「歌单」页'
          state.messageKind = 'ok'
        } else {
          state.message = '登录成功' + (name ? '：' + name : '')
          state.messageKind = 'ok'
        }
        render()
      })
      .catch(function (error) {
        if (disposed) return
        state.completing = false
        state.qrError = errorText(error)
        state.message = state.qrError
        state.messageKind = 'error'
        render()
      })
  }

  function startQrTimers() {
    stopQrTimers()
    qrTickTimer = setInterval(updateQrStatus, 1000)
    qrPollTimer = setInterval(pollQr, 2000)
  }

  function setMessage(text, kind) {
    state.message = text || ''
    state.messageKind = kind || ''
    render()
  }

  function setMethod(method) {
    if (state.busy || state.signedIn || state.method === method) return
    state.method = method
    if (method === 'qr') {
      startQr()
    } else {
      stopQrTimers()
      render()
      var mobileInput = wrap.querySelector('[data-field="mobile"]')
      if (mobileInput) {
        try {
          mobileInput.focus()
        } catch (e) {
          /* 忽略 */
        }
      }
    }
  }

  function render() {
    if (disposed) return
    var h = []
    if (state.signedIn) {
      h.push('<div class="bd-head"><span class="' + brandTileClass() + '"></span>')
      h.push('<div><div class="bd-title">波点音乐</div><p class="bd-sub">账号已连接</p></div></div>')
      h.push('<div class="bd-user">')
      if (state.avatarUrl) {
        h.push(
          '<img class="bd-avatar" data-avatar src="' +
            escapeAttr(state.avatarUrl) +
            '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
        )
      }
      h.push(
        '<span class="bd-avatar-fallback" data-avatar-fallback' +
          (state.avatarUrl ? ' style="display:none"' : '') +
          ' aria-hidden="true">' +
          escapeHtml(str(state.displayName).slice(0, 1) || '?') +
          '</span>'
      )
      h.push(
        '<div><div class="bd-name">' +
          escapeHtml(state.displayName) +
          (state.badge ? '<span class="bd-badge">' + escapeHtml(state.badge) + '</span>' : '') +
          '</div><p class="bd-sub">歌单会同步到澜音「歌单」页</p></div>'
      )
      h.push('</div>')
      h.push('<div class="bd-actions">')
      h.push('<button type="button" class="bd-btn bd-primary bd-block" data-act="sync">同步歌单</button>')
      h.push('<button type="button" class="bd-btn bd-block" data-act="logout">退出登录</button>')
      h.push('</div>')
    } else {
      h.push('<div class="bd-head"><span class="' + brandTileClass() + '"></span>')
      h.push(
        '<div><div class="bd-title">波点音乐</div><p class="bd-sub">' +
          (state.method === 'qr' ? '扫码登录' : '手机号验证码登录') +
          '</p></div></div>'
      )
      h.push('<div class="bd-tabs" role="tablist" aria-label="登录方式">')
      h.push(
        '<button type="button" class="bd-tab" role="tab" data-method="qr" aria-selected="' +
          (state.method === 'qr' ? 'true' : 'false') +
          '">扫码登录</button>'
      )
      h.push(
        '<button type="button" class="bd-tab" role="tab" data-method="phone" aria-selected="' +
          (state.method === 'phone' ? 'true' : 'false') +
          '">手机号登录</button>'
      )
      h.push('</div>')

      if (state.method === 'qr') {
        h.push('<p class="bd-desc">打开波点 App「扫一扫」扫描二维码，扫码即同意登录。</p>')
        h.push('<div class="bd-qr">')
        h.push('<div class="bd-qr-box">')
        if (state.qr && state.qr.content && !state.qr.expired) {
          h.push('<canvas data-qr role="img" aria-label="波点音乐登录二维码"></canvas>')
        } else {
          h.push('<div class="bd-qr-skel" aria-hidden="true"></div>')
        }
        h.push('</div>')
        h.push(
          '<p class="bd-qr-status' +
            (state.qrError ? ' bd-qr-bad' : '') +
            '" data-qr-status role="status" aria-live="polite">' +
            escapeHtml(qrStatusText()) +
            '</p>'
        )
        h.push(
          '<button type="button" class="bd-btn" data-act="qrRefresh"' +
            (state.busy ? ' disabled' : '') +
            '>刷新二维码</button>'
        )
        h.push('</div>')
      } else {
        h.push('<p class="bd-desc">登录后同步你的歌单，并以账号权益解析播放地址。验证码会发送到你的手机。</p>')
        h.push('<div class="bd-field"><label class="bd-label" for="bd-mobile">手机号</label><div class="bd-row">')
        h.push(
          '<input id="bd-mobile" class="bd-input" data-field="mobile" type="tel" inputmode="numeric" autocomplete="tel" maxlength="11" placeholder="11 位手机号" value="' +
            escapeAttr(state.mobile) +
            '" />'
        )
        h.push(
          '<button type="button" class="bd-btn" data-act="send" ' +
            (state.busy || countdown > 0 ? 'disabled' : '') +
            '>' +
            (countdown > 0 ? countdown + 's' : '获取验证码') +
            '</button></div></div>'
        )
        h.push('<div class="bd-field"><label class="bd-label" for="bd-code">短信验证码</label>')
        h.push(
          '<input id="bd-code" class="bd-input" data-field="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位验证码" value="' +
            escapeAttr(state.code) +
            '" /></div>'
        )
        h.push(
          '<button type="button" class="bd-btn bd-primary bd-block" data-act="login" ' +
            (state.busy ? 'disabled' : '') +
            '>' +
            (state.busy ? '登录中…' : '登录') +
            '</button>'
        )
        h.push('<p class="bd-hint">凭据仅保存在本机插件存储中，不会进入澜音账号。</p>')
      }
    }
    h.push(
      '<div class="bd-msg ' +
        (state.messageKind === 'error' ? 'bd-err' : state.messageKind === 'ok' ? 'bd-ok' : '') +
        '" role="' + (state.messageKind === 'error' ? 'alert' : 'status') + '" aria-live="' + (state.messageKind === 'error' ? 'assertive' : 'polite') + '">' +
        escapeHtml(state.message || (state.lastError ? state.lastError : '')) +
        '</div>'
    )
    wrap.innerHTML = h.join('')

    var avatarImg = wrap.querySelector('[data-avatar]')
    if (avatarImg) {
      avatarImg.addEventListener('error', function () {
        avatarImg.style.display = 'none'
        var fallback = wrap.querySelector('[data-avatar-fallback]')
        if (fallback) fallback.style.display = 'flex'
      })
    }

    var inputs = wrap.querySelectorAll('[data-field]')
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', function (event) {
        state[event.target.getAttribute('data-field')] = event.target.value
        // 输入时顺手清掉上一次的红色错误提示（不整页重绘，避免焦点丢失）。
        var tip = wrap.querySelector('.bd-msg')
        if (tip && state.messageKind === 'error') {
          tip.textContent = ''
          tip.className = 'bd-msg'
          state.messageKind = ''
        }
      })
      // 回车提交：手机号框回车发验证码，验证码框回车直接登录。
      inputs[i].addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return
        event.preventDefault()
        var field = event.target.getAttribute('data-field')
        if (field === 'mobile' && !state.busy && countdown <= 0) onAction('send')
        else if (field === 'code') onAction('login')
      })
    }
    var tabs = wrap.querySelectorAll('[data-method]')
    for (var k = 0; k < tabs.length; k++) {
      tabs[k].addEventListener('click', function (event) {
        setMethod(event.currentTarget.getAttribute('data-method'))
      })
    }
    var buttons = wrap.querySelectorAll('[data-act]')
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].addEventListener('click', function (event) {
        onAction(event.currentTarget.getAttribute('data-act'))
      })
    }
    // 首次打开登录窗、且切到手机号方式时把焦点放到手机号输入框。
    if (!state.signedIn && state.method === 'phone' && !focusApplied) {
      focusApplied = true
      var mobileInput = wrap.querySelector('[data-field="mobile"]')
      if (mobileInput && !state.mobile) {
        try {
          mobileInput.focus()
        } catch (e) {
          /* 某些宿主里 focus 可能不可用，忽略即可 */
        }
      }
    }

    drawQr()
    paintBrand()
  }

  function onAction(act) {
    if (state.busy) return
    if (act === 'qrRefresh') {
      startQr()
      return
    }
    if (act === 'send') {
      state.busy = true
      setMessage('正在发送验证码…', '')
      surface
        .invoke('login.sendCode', { mobile: state.mobile })
        .then(function (res) {
          state.busy = false
          startCountdown(60)
          setMessage((res && res.message) || '验证码已发送', 'ok')
        })
        .catch(function (error) {
          state.busy = false
          setMessage(errorText(error), 'error')
        })
      return
    }
    if (act === 'login') {
      state.busy = true
      setMessage('正在登录…', '')
      surface
        .invoke('login.submit', { mobile: state.mobile, code: state.code })
        .then(function (res) {
          state.busy = false
          var name = (res && res.displayName) || ''
          if (res && res.signedIn) {
            // 立刻切换到已登录视图；宿主随后 publish() 的 state 也会再刷新一次。
            state.signedIn = true
            state.displayName = name || '波点音乐用户'
            state.badge = (res && res.badge) || ''
            state.code = ''
            setMessage('登录成功' + (name ? '：' + name : '') + '，歌单会同步到澜音「歌单」页', 'ok')
          } else {
            setMessage('登录成功' + (name ? '：' + name : ''), 'ok')
          }
        })
        .catch(function (error) {
          state.busy = false
          setMessage(errorText(error), 'error')
        })
      return
    }
    if (act === 'logout') {
      state.busy = true
      surface
        .invoke('account.logout', {})
        .then(function () {
          state.busy = false
          state.code = ''
          state.signedIn = false
          state.displayName = ''
          state.avatarUrl = ''
          state.badge = ''
          state.method = 'qr'
          state.qr = null
          state.qrError = ''
          stopQrTimers()
          setMessage('已退出波点音乐账号', 'ok')
          startQr()
        })
        .catch(function (error) {
          state.busy = false
          setMessage(errorText(error), 'error')
        })
      return
    }
    if (act === 'sync') {
      state.busy = true
      setMessage('正在同步歌单…', '')
      surface
        .invoke('library.refresh', {})
        .then(function (res) {
          state.busy = false
          setMessage('歌单同步完成，共 ' + ((res && res.count) || 0) + ' 个歌单', 'ok')
        })
        .catch(function (error) {
          state.busy = false
          setMessage(errorText(error), 'error')
        })
    }
  }

  function startCountdown(seconds) {
    countdown = seconds
    if (timer) clearInterval(timer)
    render()
    timer = setInterval(function () {
      countdown -= 1
      if (countdown <= 0) {
        countdown = 0
        clearInterval(timer)
        timer = null
      }
      // 只更新倒计时按钮的文案，不整页重绘：整页重绘会每秒重建输入框、把焦点顶掉。
      var sendBtn = wrap.querySelector('[data-act="send"]')
      if (!sendBtn) return
      sendBtn.textContent = countdown > 0 ? countdown + 's' : '获取验证码'
      if (countdown <= 0) sendBtn.disabled = state.busy
    }, 1000)
  }

  function errorText(error) {
    if (!error) return '操作失败'
    var message = error.message || String(error)
    return message.replace(/^Error:\s*/, '')
  }

  function applyState(next) {
    if (!next || typeof next !== 'object') return
    if (next.theme !== undefined) applySurfaceTheme(next.theme)
    if (next.signedIn !== undefined) state.signedIn = !!next.signedIn
    if (next.displayName !== undefined) state.displayName = str(next.displayName)
    if (next.avatarUrl !== undefined) state.avatarUrl = str(next.avatarUrl)
    if (next.badge !== undefined) state.badge = str(next.badge)
    if (next.loading !== undefined) state.loading = !!next.loading
    if (next.lastError !== undefined) state.lastError = str(next.lastError)
    if (state.signedIn) stopQrTimers()
    render()
  }

  var unsubscribe = surface.subscribe(applyState)

  // 先按宿主原生主题校正一次配色（prefers-color-scheme 只是首帧兜底）
  Promise.resolve(surface.invoke('ui.theme', {}))
    .then(function (res) {
      if (res && res.theme) applySurfaceTheme(res.theme)
    })
    .catch(function () {
      /* 主题读取失败时保留 prefers-color-scheme 的判断 */
    })

  // 首次进入时主动拉一次账号状态
  Promise.resolve(surface.invoke('account.summary', {}))
    .then(function (summary) {
      applyState({
        signedIn: !!(summary && summary.signedIn),
        displayName: summary && summary.displayName,
        avatarUrl: summary && summary.avatarUrl,
        badge: summary && summary.badge
      })
      if (!state.signedIn && state.method === 'qr') startQr()
    })
    .catch(function () {
      render()
      if (state.method === 'qr') startQr()
    })

  render()

  return function () {
    disposed = true
    if (timer) clearInterval(timer)
    stopQrTimers()
    if (typeof unsubscribe === 'function') unsubscribe()
    root.innerHTML = ''
  }
}

function qrCreateMatrix(t){var r=function(){var t=function(t,r){var e=t,n=g[r],o=null,i=0,a=null,u=[],f={},c=function(t,r){o=function(t){for(var r=new Array(t),e=0;e<t;e+=1){r[e]=new Array(t);for(var n=0;n<t;n+=1)r[e][n]=null}return r}(i=4*e+17),l(0,0),l(i-7,0),l(0,i-7),s(),h(),d(t,r),e>=7&&v(t),null==a&&(a=p(e,n,u)),w(a,r)},l=function(t,r){for(var e=-1;e<=7;e+=1)if(!(t+e<=-1||i<=t+e))for(var n=-1;n<=7;n+=1)r+n<=-1||i<=r+n||(o[t+e][r+n]=0<=e&&e<=6&&(0==n||6==n)||0<=n&&n<=6&&(0==e||6==e)||2<=e&&e<=4&&2<=n&&n<=4)},h=function(){for(var t=8;t<i-8;t+=1)null==o[t][6]&&(o[t][6]=t%2==0);for(var r=8;r<i-8;r+=1)null==o[6][r]&&(o[6][r]=r%2==0)},s=function(){for(var t=B.getPatternPosition(e),r=0;r<t.length;r+=1)for(var n=0;n<t.length;n+=1){var i=t[r],a=t[n];if(null==o[i][a])for(var u=-2;u<=2;u+=1)for(var f=-2;f<=2;f+=1)o[i+u][a+f]=-2==u||2==u||-2==f||2==f||0==u&&0==f}},v=function(t){for(var r=B.getBCHTypeNumber(e),n=0;n<18;n+=1){var a=!t&&1==(r>>n&1);o[Math.floor(n/3)][n%3+i-8-3]=a}for(n=0;n<18;n+=1){a=!t&&1==(r>>n&1);o[n%3+i-8-3][Math.floor(n/3)]=a}},d=function(t,r){for(var e=n<<3|r,a=B.getBCHTypeInfo(e),u=0;u<15;u+=1){var f=!t&&1==(a>>u&1);u<6?o[u][8]=f:u<8?o[u+1][8]=f:o[i-15+u][8]=f}for(u=0;u<15;u+=1){f=!t&&1==(a>>u&1);u<8?o[8][i-u-1]=f:u<9?o[8][15-u-1+1]=f:o[8][15-u-1]=f}o[i-8][8]=!t},w=function(t,r){for(var e=-1,n=i-1,a=7,u=0,f=B.getMaskFunction(r),c=i-1;c>0;c-=2)for(6==c&&(c-=1);;){for(var g=0;g<2;g+=1)if(null==o[n][c-g]){var l=!1;u<t.length&&(l=1==(t[u]>>>a&1)),f(n,c-g)&&(l=!l),o[n][c-g]=l,-1==(a-=1)&&(u+=1,a=7)}if((n+=e)<0||i<=n){n-=e,e=-e;break}}},p=function(t,r,e){for(var n=A.getRSBlocks(t,r),o=M(),i=0;i<e.length;i+=1){var a=e[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var u=0;for(i=0;i<n.length;i+=1)u+=n[i].dataCount;if(o.getLengthInBits()>8*u)throw"code length overflow. ("+o.getLengthInBits()+">"+8*u+")";for(o.getLengthInBits()+4<=8*u&&o.put(0,4);o.getLengthInBits()%8!=0;)o.putBit(!1);for(;!(o.getLengthInBits()>=8*u||(o.put(236,8),o.getLengthInBits()>=8*u));)o.put(17,8);return function(t,r){for(var e=0,n=0,o=0,i=new Array(r.length),a=new Array(r.length),u=0;u<r.length;u+=1){var f=r[u].dataCount,c=r[u].totalCount-f;n=Math.max(n,f),o=Math.max(o,c),i[u]=new Array(f);for(var g=0;g<i[u].length;g+=1)i[u][g]=255&t.getBuffer()[g+e];e+=f;var l=B.getErrorCorrectPolynomial(c),h=k(i[u],l.getLength()-1).mod(l);for(a[u]=new Array(l.getLength()-1),g=0;g<a[u].length;g+=1){var s=g+h.getLength()-a[u].length;a[u][g]=s>=0?h.getAt(s):0}}var v=0;for(g=0;g<r.length;g+=1)v+=r[g].totalCount;var d=new Array(v),w=0;for(g=0;g<n;g+=1)for(u=0;u<r.length;u+=1)g<i[u].length&&(d[w]=i[u][g],w+=1);for(g=0;g<o;g+=1)for(u=0;u<r.length;u+=1)g<a[u].length&&(d[w]=a[u][g],w+=1);return d}(o,n)};f.addData=function(t,r){var e=null;switch(r=r||"Byte"){case"Numeric":e=b(t);break;case"Alphanumeric":e=x(t);break;case"Byte":e=m(t);break;case"Kanji":e=L(t);break;default:throw"mode:"+r}u.push(e),a=null},f.isDark=function(t,r){if(t<0||i<=t||r<0||i<=r)throw t+","+r;return o[t][r]},f.getModuleCount=function(){return i},f.make=function(){if(e<1){for(var t=1;t<40;t++){for(var r=A.getRSBlocks(t,n),o=M(),i=0;i<u.length;i++){var a=u[i];o.put(a.getMode(),4),o.put(a.getLength(),B.getLengthInBits(a.getMode(),t)),a.write(o)}var g=0;for(i=0;i<r.length;i++)g+=r[i].dataCount;if(o.getLengthInBits()<=8*g)break}e=t}c(!1,function(){for(var t=0,r=0,e=0;e<8;e+=1){c(!0,e);var n=B.getLostPoint(f);(0==e||t>n)&&(t=n,r=e)}return r}())},f.createTableTag=function(t,r){t=t||2;var e="";e+='<table style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: "+(r=void 0===r?4*t:r)+"px;",e+='">',e+="<tbody>";for(var n=0;n<f.getModuleCount();n+=1){e+="<tr>";for(var o=0;o<f.getModuleCount();o+=1)e+='<td style="',e+=" border-width: 0px; border-style: none;",e+=" border-collapse: collapse;",e+=" padding: 0px; margin: 0px;",e+=" width: "+t+"px;",e+=" height: "+t+"px;",e+=" background-color: ",e+=f.isDark(n,o)?"#000000":"#ffffff",e+=";",e+='"/>';e+="</tr>"}return e+="</tbody>",e+="</table>"},f.createSvgTag=function(t,r,e,n){var o={};"object"==typeof arguments[0]&&(t=(o=arguments[0]).cellSize,r=o.margin,e=o.alt,n=o.title),t=t||2,r=void 0===r?4*t:r,(e="string"==typeof e?{text:e}:e||{}).text=e.text||null,e.id=e.text?e.id||"qrcode-description":null,(n="string"==typeof n?{text:n}:n||{}).text=n.text||null,n.id=n.text?n.id||"qrcode-title":null;var i,a,u,c,g=f.getModuleCount()*t+2*r,l="";for(c="l"+t+",0 0,"+t+" -"+t+",0 0,-"+t+"z ",l+='<svg version="1.1" xmlns="http://www.w3.org/2000/svg"',l+=o.scalable?"":' width="'+g+'px" height="'+g+'px"',l+=' viewBox="0 0 '+g+" "+g+'" ',l+=' preserveAspectRatio="xMinYMin meet"',l+=n.text||e.text?' role="img" aria-labelledby="'+y([n.id,e.id].join(" ").trim())+'"':"",l+=">",l+=n.text?'<title id="'+y(n.id)+'">'+y(n.text)+"</title>":"",l+=e.text?'<description id="'+y(e.id)+'">'+y(e.text)+"</description>":"",l+='<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>',l+='<path d="',a=0;a<f.getModuleCount();a+=1)for(u=a*t+r,i=0;i<f.getModuleCount();i+=1)f.isDark(a,i)&&(l+="M"+(i*t+r)+","+u+c);return l+='" stroke="transparent" fill="black"/>',l+="</svg>"},f.createDataURL=function(t,r){t=t||2,r=void 0===r?4*t:r;var e=f.getModuleCount()*t+2*r,n=r,o=e-r;return I(e,e,function(r,e){if(n<=r&&r<o&&n<=e&&e<o){var i=Math.floor((r-n)/t),a=Math.floor((e-n)/t);return f.isDark(a,i)?0:1}return 1})},f.createImgTag=function(t,r,e){t=t||2,r=void 0===r?4*t:r;var n=f.getModuleCount()*t+2*r,o="";return o+="<img",o+=' src="',o+=f.createDataURL(t,r),o+='"',o+=' width="',o+=n,o+='"',o+=' height="',o+=n,o+='"',e&&(o+=' alt="',o+=y(e),o+='"'),o+="/>"};var y=function(t){for(var r="",e=0;e<t.length;e+=1){var n=t.charAt(e);switch(n){case"<":r+="&lt;";break;case">":r+="&gt;";break;case"&":r+="&amp;";break;case'"':r+="&quot;";break;default:r+=n}}return r};return f.createASCII=function(t,r){if((t=t||1)<2)return function(t){t=void 0===t?2:t;var r,e,n,o,i,a=1*f.getModuleCount()+2*t,u=t,c=a-t,g={"██":"█","█ ":"▀"," █":"▄","  ":" "},l={"██":"▀","█ ":"▀"," █":" ","  ":" "},h="";for(r=0;r<a;r+=2){for(n=Math.floor((r-u)/1),o=Math.floor((r+1-u)/1),e=0;e<a;e+=1)i="█",u<=e&&e<c&&u<=r&&r<c&&f.isDark(n,Math.floor((e-u)/1))&&(i=" "),u<=e&&e<c&&u<=r+1&&r+1<c&&f.isDark(o,Math.floor((e-u)/1))?i+=" ":i+="█",h+=t<1&&r+1>=c?l[i]:g[i];h+="\n"}return a%2&&t>0?h.substring(0,h.length-a-1)+Array(a+1).join("▀"):h.substring(0,h.length-1)}(r);t-=1,r=void 0===r?2*t:r;var e,n,o,i,a=f.getModuleCount()*t+2*r,u=r,c=a-r,g=Array(t+1).join("██"),l=Array(t+1).join("  "),h="",s="";for(e=0;e<a;e+=1){for(o=Math.floor((e-u)/t),s="",n=0;n<a;n+=1)i=1,u<=n&&n<c&&u<=e&&e<c&&f.isDark(o,Math.floor((n-u)/t))&&(i=0),s+=i?g:l;for(o=0;o<t;o+=1)h+=s+"\n"}return h.substring(0,h.length-1)},f.renderTo2dContext=function(t,r){r=r||2;for(var e=f.getModuleCount(),n=0;n<e;n++)for(var o=0;o<e;o++)t.fillStyle=f.isDark(n,o)?"black":"white",t.fillRect(n*r,o*r,r,r)},f};t.stringToBytesFuncs={default:function(t){for(var r=[],e=0;e<t.length;e+=1){var n=t.charCodeAt(e);r.push(255&n)}return r}},t.stringToBytes=t.stringToBytesFuncs.default,t.createStringToBytes=function(t,r){var e=function(){for(var e=S(t),n=function(){var t=e.read();if(-1==t)throw"eof";return t},o=0,i={};;){var a=e.read();if(-1==a)break;var u=n(),f=n()<<8|n();i[String.fromCharCode(a<<8|u)]=f,o+=1}if(o!=r)throw o+" != "+r;return i}(),n="?".charCodeAt(0);return function(t){for(var r=[],o=0;o<t.length;o+=1){var i=t.charCodeAt(o);if(i<128)r.push(i);else{var a=e[t.charAt(o)];"number"==typeof a?(255&a)==a?r.push(a):(r.push(a>>>8),r.push(255&a)):r.push(n)}}return r}};var r,e,n,o,i,a=1,u=2,f=4,c=8,g={L:1,M:0,Q:3,H:2},l=0,h=1,s=2,v=3,d=4,w=5,p=6,y=7,B=(r=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],e=1335,n=7973,i=function(t){for(var r=0;0!=t;)r+=1,t>>>=1;return r},(o={}).getBCHTypeInfo=function(t){for(var r=t<<10;i(r)-i(e)>=0;)r^=e<<i(r)-i(e);return 21522^(t<<10|r)},o.getBCHTypeNumber=function(t){for(var r=t<<12;i(r)-i(n)>=0;)r^=n<<i(r)-i(n);return t<<12|r},o.getPatternPosition=function(t){return r[t-1]},o.getMaskFunction=function(t){switch(t){case l:return function(t,r){return(t+r)%2==0};case h:return function(t,r){return t%2==0};case s:return function(t,r){return r%3==0};case v:return function(t,r){return(t+r)%3==0};case d:return function(t,r){return(Math.floor(t/2)+Math.floor(r/3))%2==0};case w:return function(t,r){return t*r%2+t*r%3==0};case p:return function(t,r){return(t*r%2+t*r%3)%2==0};case y:return function(t,r){return(t*r%3+(t+r)%2)%2==0};default:throw"bad maskPattern:"+t}},o.getErrorCorrectPolynomial=function(t){for(var r=k([1],0),e=0;e<t;e+=1)r=r.multiply(k([1,C.gexp(e)],0));return r},o.getLengthInBits=function(t,r){if(1<=r&&r<10)switch(t){case a:return 10;case u:return 9;case f:case c:return 8;default:throw"mode:"+t}else if(r<27)switch(t){case a:return 12;case u:return 11;case f:return 16;case c:return 10;default:throw"mode:"+t}else{if(!(r<41))throw"type:"+r;switch(t){case a:return 14;case u:return 13;case f:return 16;case c:return 12;default:throw"mode:"+t}}},o.getLostPoint=function(t){for(var r=t.getModuleCount(),e=0,n=0;n<r;n+=1)for(var o=0;o<r;o+=1){for(var i=0,a=t.isDark(n,o),u=-1;u<=1;u+=1)if(!(n+u<0||r<=n+u))for(var f=-1;f<=1;f+=1)o+f<0||r<=o+f||0==u&&0==f||a==t.isDark(n+u,o+f)&&(i+=1);i>5&&(e+=3+i-5)}for(n=0;n<r-1;n+=1)for(o=0;o<r-1;o+=1){var c=0;t.isDark(n,o)&&(c+=1),t.isDark(n+1,o)&&(c+=1),t.isDark(n,o+1)&&(c+=1),t.isDark(n+1,o+1)&&(c+=1),0!=c&&4!=c||(e+=3)}for(n=0;n<r;n+=1)for(o=0;o<r-6;o+=1)t.isDark(n,o)&&!t.isDark(n,o+1)&&t.isDark(n,o+2)&&t.isDark(n,o+3)&&t.isDark(n,o+4)&&!t.isDark(n,o+5)&&t.isDark(n,o+6)&&(e+=40);for(o=0;o<r;o+=1)for(n=0;n<r-6;n+=1)t.isDark(n,o)&&!t.isDark(n+1,o)&&t.isDark(n+2,o)&&t.isDark(n+3,o)&&t.isDark(n+4,o)&&!t.isDark(n+5,o)&&t.isDark(n+6,o)&&(e+=40);var g=0;for(o=0;o<r;o+=1)for(n=0;n<r;n+=1)t.isDark(n,o)&&(g+=1);return e+=Math.abs(100*g/r/r-50)/5*10},o),C=function(){for(var t=new Array(256),r=new Array(256),e=0;e<8;e+=1)t[e]=1<<e;for(e=8;e<256;e+=1)t[e]=t[e-4]^t[e-5]^t[e-6]^t[e-8];for(e=0;e<255;e+=1)r[t[e]]=e;var n={glog:function(t){if(t<1)throw"glog("+t+")";return r[t]},gexp:function(r){for(;r<0;)r+=255;for(;r>=256;)r-=255;return t[r]}};return n}();function k(t,r){if(void 0===t.length)throw t.length+"/"+r;var e=function(){for(var e=0;e<t.length&&0==t[e];)e+=1;for(var n=new Array(t.length-e+r),o=0;o<t.length-e;o+=1)n[o]=t[o+e];return n}(),n={getAt:function(t){return e[t]},getLength:function(){return e.length},multiply:function(t){for(var r=new Array(n.getLength()+t.getLength()-1),e=0;e<n.getLength();e+=1)for(var o=0;o<t.getLength();o+=1)r[e+o]^=C.gexp(C.glog(n.getAt(e))+C.glog(t.getAt(o)));return k(r,0)},mod:function(t){if(n.getLength()-t.getLength()<0)return n;for(var r=C.glog(n.getAt(0))-C.glog(t.getAt(0)),e=new Array(n.getLength()),o=0;o<n.getLength();o+=1)e[o]=n.getAt(o);for(o=0;o<t.getLength();o+=1)e[o]^=C.gexp(C.glog(t.getAt(o))+r);return k(e,0).mod(t)}};return n}var A=function(){var t=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12,7,37,13],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],r=function(t,r){var e={};return e.totalCount=t,e.dataCount=r,e},e={};return e.getRSBlocks=function(e,n){var o=function(r,e){switch(e){case g.L:return t[4*(r-1)+0];case g.M:return t[4*(r-1)+1];case g.Q:return t[4*(r-1)+2];case g.H:return t[4*(r-1)+3];default:return}}(e,n);if(void 0===o)throw"bad rs block @ typeNumber:"+e+"/errorCorrectionLevel:"+n;for(var i=o.length/3,a=[],u=0;u<i;u+=1)for(var f=o[3*u+0],c=o[3*u+1],l=o[3*u+2],h=0;h<f;h+=1)a.push(r(c,l));return a},e}(),M=function(){var t=[],r=0,e={getBuffer:function(){return t},getAt:function(r){var e=Math.floor(r/8);return 1==(t[e]>>>7-r%8&1)},put:function(t,r){for(var n=0;n<r;n+=1)e.putBit(1==(t>>>r-n-1&1))},getLengthInBits:function(){return r},putBit:function(e){var n=Math.floor(r/8);t.length<=n&&t.push(0),e&&(t[n]|=128>>>r%8),r+=1}};return e},b=function(t){var r=a,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+2<r.length;)t.put(o(r.substring(n,n+3)),10),n+=3;n<r.length&&(r.length-n==1?t.put(o(r.substring(n,n+1)),4):r.length-n==2&&t.put(o(r.substring(n,n+2)),7))}},o=function(t){for(var r=0,e=0;e<t.length;e+=1)r=10*r+i(t.charAt(e));return r},i=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);throw"illegal char :"+t};return n},x=function(t){var r=u,e=t,n={getMode:function(){return r},getLength:function(t){return e.length},write:function(t){for(var r=e,n=0;n+1<r.length;)t.put(45*o(r.charAt(n))+o(r.charAt(n+1)),11),n+=2;n<r.length&&t.put(o(r.charAt(n)),6)}},o=function(t){if("0"<=t&&t<="9")return t.charCodeAt(0)-"0".charCodeAt(0);if("A"<=t&&t<="Z")return t.charCodeAt(0)-"A".charCodeAt(0)+10;switch(t){case" ":return 36;case"$":return 37;case"%":return 38;case"*":return 39;case"+":return 40;case"-":return 41;case".":return 42;case"/":return 43;case":":return 44;default:throw"illegal char :"+t}};return n},m=function(r){var e=f,n=t.stringToBytes(r),o={getMode:function(){return e},getLength:function(t){return n.length},write:function(t){for(var r=0;r<n.length;r+=1)t.put(n[r],8)}};return o},L=function(r){var e=c,n=t.stringToBytesFuncs.SJIS;if(!n)throw"sjis not supported.";!function(){var t=n("友");if(2!=t.length||38726!=(t[0]<<8|t[1]))throw"sjis not supported."}();var o=n(r),i={getMode:function(){return e},getLength:function(t){return~~(o.length/2)},write:function(t){for(var r=o,e=0;e+1<r.length;){var n=(255&r[e])<<8|255&r[e+1];if(33088<=n&&n<=40956)n-=33088;else{if(!(57408<=n&&n<=60351))throw"illegal char at "+(e+1)+"/"+n;n-=49472}n=192*(n>>>8&255)+(255&n),t.put(n,13),e+=2}if(e<r.length)throw"illegal char at "+(e+1)}};return i},D=function(){var t=[],r={writeByte:function(r){t.push(255&r)},writeShort:function(t){r.writeByte(t),r.writeByte(t>>>8)},writeBytes:function(t,e,n){e=e||0,n=n||t.length;for(var o=0;o<n;o+=1)r.writeByte(t[o+e])},writeString:function(t){for(var e=0;e<t.length;e+=1)r.writeByte(t.charCodeAt(e))},toByteArray:function(){return t},toString:function(){var r="";r+="[";for(var e=0;e<t.length;e+=1)e>0&&(r+=","),r+=t[e];return r+="]"}};return r},S=function(t){var r=t,e=0,n=0,o=0,i={read:function(){for(;o<8;){if(e>=r.length){if(0==o)return-1;throw"unexpected end of file./"+o}var t=r.charAt(e);if(e+=1,"="==t)return o=0,-1;t.match(/^\s$/)||(n=n<<6|a(t.charCodeAt(0)),o+=6)}var i=n>>>o-8&255;return o-=8,i}},a=function(t){if(65<=t&&t<=90)return t-65;if(97<=t&&t<=122)return t-97+26;if(48<=t&&t<=57)return t-48+52;if(43==t)return 62;if(47==t)return 63;throw"c:"+t};return i},I=function(t,r,e){for(var n=function(t,r){var e=t,n=r,o=new Array(t*r),i={setPixel:function(t,r,n){o[r*e+t]=n},write:function(t){t.writeString("GIF87a"),t.writeShort(e),t.writeShort(n),t.writeByte(128),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(0),t.writeByte(255),t.writeByte(255),t.writeByte(255),t.writeString(","),t.writeShort(0),t.writeShort(0),t.writeShort(e),t.writeShort(n),t.writeByte(0);var r=a(2);t.writeByte(2);for(var o=0;r.length-o>255;)t.writeByte(255),t.writeBytes(r,o,255),o+=255;t.writeByte(r.length-o),t.writeBytes(r,o,r.length-o),t.writeByte(0),t.writeString(";")}},a=function(t){for(var r=1<<t,e=1+(1<<t),n=t+1,i=u(),a=0;a<r;a+=1)i.add(String.fromCharCode(a));i.add(String.fromCharCode(r)),i.add(String.fromCharCode(e));var f,c,g,l=D(),h=(f=l,c=0,g=0,{write:function(t,r){if(t>>>r!=0)throw"length over";for(;c+r>=8;)f.writeByte(255&(t<<c|g)),r-=8-c,t>>>=8-c,g=0,c=0;g|=t<<c,c+=r},flush:function(){c>0&&f.writeByte(g)}});h.write(r,n);var s=0,v=String.fromCharCode(o[s]);for(s+=1;s<o.length;){var d=String.fromCharCode(o[s]);s+=1,i.contains(v+d)?v+=d:(h.write(i.indexOf(v),n),i.size()<4095&&(i.size()==1<<n&&(n+=1),i.add(v+d)),v=d)}return h.write(i.indexOf(v),n),h.write(e,n),h.flush(),l.toByteArray()},u=function(){var t={},r=0,e={add:function(n){if(e.contains(n))throw"dup key:"+n;t[n]=r,r+=1},size:function(){return r},indexOf:function(r){return t[r]},contains:function(r){return void 0!==t[r]}};return e};return i}(t,r),o=0;o<r;o+=1)for(var i=0;i<t;i+=1)n.setPixel(i,o,e(i,o));var a=D();n.write(a);for(var u=function(){var t=0,r=0,e=0,n="",o={},i=function(t){n+=String.fromCharCode(a(63&t))},a=function(t){if(t<0);else{if(t<26)return 65+t;if(t<52)return t-26+97;if(t<62)return t-52+48;if(62==t)return 43;if(63==t)return 47}throw"n:"+t};return o.writeByte=function(n){for(t=t<<8|255&n,r+=8,e+=1;r>=6;)i(t>>>r-6),r-=6},o.flush=function(){if(r>0&&(i(t<<6-r),t=0,r=0),e%3!=0)for(var o=3-e%3,a=0;a<o;a+=1)n+="="},o.toString=function(){return n},o}(),f=a.toByteArray(),c=0;c<f.length;c+=1)u.writeByte(f[c]);return u.flush(),"data:image/gif;base64,"+u};return t}();r.stringToBytesFuncs["UTF-8"]=function(t){return function(t){for(var r=[],e=0;e<t.length;e++){var n=t.charCodeAt(e);n<128?r.push(n):n<2048?r.push(192|n>>6,128|63&n):n<55296||n>=57344?r.push(224|n>>12,128|n>>6&63,128|63&n):(e++,n=65536+((1023&n)<<10|1023&t.charCodeAt(e)),r.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|63&n))}return r}(t)};var e=r(0,"M");e.addData(t),e.make();for(var n=e.getModuleCount(),o=[],i=0;i<n;i++){for(var a=[],u=0;u<n;u++)a.push(e.isDark(i,u)?1:0);o.push(a)}return o}

function escapeHtml(value) {
  return str(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

/* ================================================================== *
 * Web Surface：私人推荐启动页
 * ================================================================== */

/* 启动页样式：复用共享 token，补电台启动态。 */
function recommendCss() {
  return (
    pluginSurfaceCss() +
    [
      '.bd-rad{padding:34px 22px 28px;text-align:center}',
      '.bd-rad-brand{width:56px;height:56px;border-radius:18px;overflow:hidden;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--bd-brand-a),var(--bd-brand-b) 48%,var(--bd-brand-c));color:var(--bd-brand-ink);box-shadow:0 0 0 1px rgba(20,60,50,.10),0 16px 32px -22px rgba(10,40,34,.95)}',
      '.bd-rad-brand .bd-brand-img{width:100%;height:100%;object-fit:cover;display:block}',
      '.bd-rad-title{font-size:15.5px;font-weight:650;letter-spacing:-.012em;line-height:1.35;margin:0 0 8px}',
      '.bd-rad-desc{font-size:12.5px;color:var(--bd-fg-muted);line-height:1.66;margin:0}',
      '.bd-rad-song{margin:14px 0 6px;font-size:13.5px;font-weight:650;line-height:1.5;word-break:break-word}',
      '.bd-rad-song small{display:block;margin-top:3px;font-size:12px;font-weight:400;color:var(--bd-fg-muted)}',
      '.bd-rad-run{display:flex;align-items:flex-end;justify-content:center;gap:4px;height:24px;margin:0 auto 16px}',
      '.bd-rad-run i{display:block;width:5px;height:8px;border-radius:3px;background:var(--bd-accent);animation:bdbar 1.05s ease-in-out infinite}',
      '.bd-rad-run i:nth-child(2){animation-delay:.16s}',
      '.bd-rad-run i:nth-child(3){animation-delay:.32s}',
      '.bd-rad-run i:nth-child(4){animation-delay:.12s}',
      '@keyframes bdbar{0%,100%{height:8px;opacity:.5}50%{height:22px;opacity:1}}',
      '.bd-rad-progress{height:3px;margin:18px 0 0;border-radius:999px;background:var(--bd-line);overflow:hidden}',
      '.bd-rad-progress i{display:block;height:100%;width:100%;border-radius:999px;background:var(--bd-accent);transform-origin:left center;animation:bdrain 1.4s linear forwards}',
      '@keyframes bdrain{from{transform:scaleX(1)}to{transform:scaleX(0)}}',
      '.bd-rad-hint{font-size:11.5px;color:var(--bd-fg-subtle);line-height:1.7;margin:14px 0 0}',
      '.bd-rad-err{font-size:12.5px;color:var(--bd-danger);line-height:1.6;margin:10px 0 0;word-break:break-word}',
      '.bd-rad-act{display:flex;gap:8px;justify-content:center;margin-top:18px}',
      '.bd-rad-act .bd-btn{height:36px;padding:0 16px;font-size:12.5px}',
      '@media (prefers-reduced-motion: reduce){.bd-rad-run i{animation:none;height:13px;opacity:.85}.bd-rad-progress i{animation:none;transform:scaleX(1)}}'
    ].join('')
  )
}

/**
 * 私人推荐入口（侧边栏 → web Surface）。
 * 点击后打开一个很短的抽屉：立刻调用 recommend.start 替换播放队列并开播，
 * 成功后自动关闭抽屉、进入电台播放；失败才停留并给出重试。
 */
function RecommendSurface(surface) {
  var root = surface.root
  var state = {
    status: 'starting',
    title: '',
    artist: '',
    count: 0,
    error: ''
  }
  var disposed = false
  var closeTimer = null

  root.innerHTML = ''
  applySurfaceTheme(preferredTheme())
  var style = document.createElement('style')
  style.textContent = recommendCss()
  root.appendChild(style)
  var wrap = document.createElement('div')
  wrap.className = 'bd-rad bd-surface'
  wrap.setAttribute('aria-live', 'polite')
  root.appendChild(wrap)

  var brandSrc = ''

  /** 把加载到的波点 logo 填进品牌图块（不整页重绘）。 */
  function paintBrand() {
    if (!brandSrc) return
    var tile = wrap.querySelector('.bd-rad-brand')
    if (!tile || tile.querySelector('img')) return
    var img = document.createElement('img')
    img.className = 'bd-brand-img'
    img.alt = ''
    img.src = brandSrc
    tile.appendChild(img)
    tile.classList.remove('bd-brand-empty')
  }

  loadSurfaceAsset(surface, 'icon.bodian', function (url) {
    brandSrc = url
    paintBrand()
  })

  function errorText(error) {
    if (!error) return '开启失败，请稍后重试'
    return String(error.message || error).replace(/^Error:\s*/, '')
  }

  function closeSoon() {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(function () {
      if (disposed) return
      try {
        surface.close()
      } catch (e) {
        /* 抽屉可能已经被宿主关闭 */
      }
    }, 1400)
  }

  function render() {
    if (disposed) return
    var html = ['<div class="bd-rad-brand bd-brand-empty"></div>']
    if (state.status === 'starting') {
      html.push('<div class="bd-rad-run" aria-hidden="true"><i></i><i></i><i></i><i></i></div>')
      html.push('<h2 class="bd-rad-title">正在开启私人推荐</h2>')
      html.push('<p class="bd-rad-desc">正在获取推荐歌曲并替换播放队列</p>')
    } else if (state.status === 'success') {
      html.push('<h2 class="bd-rad-title">私人推荐已开始</h2>')
      if (state.title) {
        html.push(
          '<p class="bd-rad-song">《' +
            escapeHtml(state.title) +
            '》' +
            (state.artist ? '<small>' + escapeHtml(state.artist) + '</small>' : '') +
            '</p>'
        )
      }
      html.push('<p class="bd-rad-desc">共 ' + state.count + ' 首 · 已切换顺序播放</p>')
      html.push('<p class="bd-rad-hint">播到最后一首时会自动把新推荐加到列表末尾；按 F 打开播放页</p>')
      html.push('<div class="bd-rad-progress" aria-hidden="true"><i></i></div>')
    } else {
      html.push('<h2 class="bd-rad-title">没能开启私人推荐</h2>')
      html.push('<p class="bd-rad-err">' + escapeHtml(state.error) + '</p>')
      html.push('<div class="bd-rad-act">')
      html.push('<button type="button" class="bd-btn bd-primary" data-act="retry">重试</button>')
      html.push('<button type="button" class="bd-btn" data-act="close">关闭</button>')
      html.push('</div>')
    }
    wrap.innerHTML = html.join('')
    var buttons = wrap.querySelectorAll('[data-act]')
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function (event) {
        var act = event.currentTarget.getAttribute('data-act')
        if (act === 'retry') {
          start()
          return
        }
        try {
          surface.close()
        } catch (e) {
          /* 忽略 */
        }
      })
    }

    paintBrand()
  }

  function start() {
    if (disposed) return
    state.status = 'starting'
    render()
    Promise.resolve(surface.invoke('recommend.start', {}))
      .then(function (res) {
        if (disposed) return
        state.status = 'success'
        state.title = str(res && res.title)
        state.artist = str(res && res.artist)
        state.count = num(res && res.count)
        render()
        closeSoon()
      })
      .catch(function (error) {
        if (disposed) return
        state.status = 'error'
        state.error = errorText(error)
        render()
      })
  }

  // 主题校正 + 跟随宿主主题切换
  var unsubscribe = surface.subscribe(function (next) {
    if (next && next.theme) applySurfaceTheme(next.theme)
  })
  Promise.resolve(surface.invoke('ui.theme', {}))
    .then(function (res) {
      if (res && res.theme) applySurfaceTheme(res.theme)
    })
    .catch(function () {
      /* 保留 prefers-color-scheme 判断 */
    })

  start()

  return function () {
    disposed = true
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = null
    if (typeof unsubscribe === 'function') unsubscribe()
    root.innerHTML = ''
  }
}

/* ================================================================== *
 * 导出
 * ================================================================== */

exports.activate = activate

/* exports.surfaces 必须【按 surface id 作键】，且键集合必须与 modules.surfaces[].id 完全一致。
   多一个键（例如同时再挂 'view.login'）会被安装器当成"未声明的 surface"而报
   Unknown visible surface: xxx。 */
exports.surfaces = {
  login: LoginSurface,
  recommend: RecommendSurface
}
exports.resources = {
  "icon.bodian": {
    "type": "base64",
    "mime": "image/webp",
    "value": "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"
  }
}
