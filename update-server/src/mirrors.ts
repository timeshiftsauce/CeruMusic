/**
 * 更新/GitHub 下载镜像池（gh-proxy 风格）。
 *
 * 这是镜像池的**唯一权威来源**，由 /update 响应下发（`mirrors: string[]`）。
 * 客户端「选择下载方式」弹窗会并发测速这些前缀，全部列出供用户选择。
 * 拼接规则：`<镜像前缀>https://github.com/owner/repo/releases/download/...`
 * （前缀需以 `/` 结尾）。
 *
 * 维护方式：用 `node scripts/probe-mirrors.mjs` 本地测速，多跑几轮取交集
 * （单轮结果受网络波动影响），再用 `--write` 剔除长期超时的条目。
 * 本列表 = 2026-10-10 三轮探测（9s 超时）的稳定交集，按延迟升序。
 * 客户端只在更新服务器不可达时用极少量内置兜底降级，无需同步维护。
 */
export const UPDATE_MIRRORS: readonly string[] = [
  'https://v4.gh-proxy.org/',
  'https://github.xxlab.tech/',
  'https://ghproxy.sakuramoe.dev/',
  'https://gh.padao.fun/',
  'https://github.cnxiaobai.com/',
  'https://ghproxy.mirror.skybyte.me/',
  'https://30006000.xyz/',
  'https://gh.39.al/',
  'https://git.40609891.xyz/',
  'https://gh.noki.icu/',
  'https://ghm.078465.xyz/',
  'https://ghfast.top/',
  'https://gh.nxnow.top/',
  'https://git.tangbai.cc/',
  'https://github.chenc.dev/',
  'https://ghproxy.cn/',
  'https://ghproxy.net/',
  'https://g.blfrp.cn/',
  'https://ghproxy.monkeyray.net/',
  'https://gh.aaa.team/',
  'https://gh-proxy.com/'
]
