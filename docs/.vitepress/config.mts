import { defineConfig } from 'vitepress'
import note from 'markdown-it-footnote'

const pluginSidebar = {
  text: '插件开发 · v2',
  link: '/guide/plugins/v2/',
  items: [
    {
      text: '开始',
      collapsed: false,
      items: [
        { text: '简介', link: '/guide/plugins/v2/' },
        { text: '常用概念', link: '/guide/plugins/v2/concepts' }
      ]
    },
    {
      text: '动手教程',
      collapsed: false,
      items: [
        {
          text: '入门 · 第一个插件',
          collapsed: true,
          items: [
            { text: '1. 快速上手', link: '/guide/plugins/v2/quick-start' },
            { text: '2. 写一个命令', link: '/guide/plugins/v2/first-command' },
            { text: '3. 理解搜索', link: '/guide/plugins/v2/first-search' },
            { text: '4. 保存数据', link: '/guide/plugins/v2/first-storage' },
            { text: '5. 安装与交付', link: '/guide/plugins/v2/first-release' }
          ]
        },
        {
          text: '项目一 · HTTP 音源',
          collapsed: false,
          items: [
            { text: '先运行完整项目', link: '/guide/plugins/v2/tutorial-source/' },
            { text: '实现 Provider', link: '/guide/plugins/v2/tutorial-source/provider' },
            { text: '验证与真实服务', link: '/guide/plugins/v2/tutorial-source/release' }
          ]
        },
        {
          text: '项目二 · Navidrome',
          collapsed: false,
          items: [
            { text: '先运行完整项目', link: '/guide/plugins/v2/tutorial-navidrome/' },
            { text: '连接与认证', link: '/guide/plugins/v2/tutorial-navidrome/connection' },
            { text: 'Vue 连接页', link: '/guide/plugins/v2/tutorial-navidrome/surface' },
            { text: '搜索、播放与歌词', link: '/guide/plugins/v2/tutorial-navidrome/provider' },
            { text: '验证与实机安装', link: '/guide/plugins/v2/tutorial-navidrome/release' }
          ]
        },
        {
          text: '项目三 · 账号与原生音乐库',
          collapsed: false,
          items: [
            { text: '先运行完整项目', link: '/guide/plugins/v2/tutorial-account-native/' },
            { text: '工程与 Manifest', link: '/guide/plugins/v2/tutorial-account-native/manifest' },
            { text: 'Vue 登录与账号', link: '/guide/plugins/v2/tutorial-account-native/login' },
            {
              text: '现有歌单页区块',
              link: '/guide/plugins/v2/tutorial-account-native/native-library'
            },
            {
              text: '导航、播放与导入',
              link: '/guide/plugins/v2/tutorial-account-native/playback'
            },
            {
              text: '真实接口与发布',
              link: '/guide/plugins/v2/tutorial-account-native/release'
            }
          ]
        }
      ]
    },
    {
      text: '基础 API · 按需查阅',
      collapsed: true,
      items: [
        { text: '工程与 Manifest', link: '/guide/plugins/v2/manifest' },
        { text: '运行时与模块', link: '/guide/plugins/v2/runtime' },
        { text: '权限', link: '/guide/plugins/v2/permissions' },
        { text: '配置与数据迁移', link: '/guide/plugins/v2/configuration' },
        { text: 'Storage 容量与共享', link: '/guide/plugins/v2/storage' }
      ]
    },
    {
      text: '音乐与网络 API',
      collapsed: true,
      items: [
        { text: 'Provider 与标准数据', link: '/guide/plugins/v2/providers' },
        { text: '歌词与音质', link: '/guide/plugins/v2/lyrics' },
        { text: '歌单导入', link: '/guide/plugins/v2/playlist-import' },
        { text: 'HTTP 请求', link: '/guide/plugins/v2/http' },
        { text: 'Socket 连接', link: '/guide/plugins/v2/sockets' }
      ]
    },
    {
      text: '界面与进阶',
      collapsed: true,
      items: [
        { text: '原生配置抽屉', link: '/guide/plugins/v2/ui-schema' },
        { text: '原生内容与账号菜单', link: '/guide/plugins/v2/ui-native' },
        { text: 'Web / Vue / React', link: '/guide/plugins/v2/surfaces' },
        { text: '选择其他模板', link: '/guide/plugins/v2/templates' },
        { text: '宿主服务支持表', link: '/guide/plugins/v2/host-services' },
        { text: '桌面扩展与类型差异', link: '/guide/plugins/v2/desktop-extensions' },
        { text: 'Guest 兼容环境', link: '/guide/plugins/v2/guests' }
      ]
    },
    {
      text: '工具与版本参考',
      collapsed: true,
      items: [
        { text: '脚手架与 CLI', link: '/guide/plugins/v2/cli' },
        { text: '版本与兼容', link: '/guide/plugins/v2/compatibility' },
        { text: '0.3.5 工具链更新', link: '/guide/plugins/v2/sdk-upgrade' },
        { text: '构建与发布', link: '/guide/plugins/v2/publishing' },
        { text: '签名与个性化发行', link: '/guide/plugins/v2/issuance' },
        { text: '从 v1 迁移', link: '/guide/plugins/v2/migration' },
        { text: '故障排查', link: '/guide/plugins/v2/troubleshooting' },
        { text: '完整类型参考', link: '/guide/plugins/v2/reference' }
      ]
    }
  ]
}

const legacyPluginSidebar = {
  text: '插件 1.0 · 历史文档',
  collapsed: true,
  items: [
    { text: 'v1 插件开发指南', link: '/guide/CeruMusicPluginDev' },
    { text: 'v1 Host 类使用', link: '/guide/CeruMusicPluginHost' }
  ]
}

export default defineConfig({
  lang: 'zh-CN',
  title: 'Ceru Music',
  base: '/',
  head: [
    ['link', { rel: 'icon', href: '/logo.svg' }],
    ['meta', { name: 'author', href: '时迁酱，无聊的霜霜，star' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'Ceru Music,音乐播放器,音乐播放器工具,音乐播放器软件,音乐播放器下载,音乐播放器下载地址,澜音播放器,免费的音乐播放器,cerumusic,时迁酱,周晨鹭,无聊的霜霜,star,洛雪音乐,洛雪'
      }
    ],
    ['meta', { name: 'baidu-site-verification', content: 'codeva-ocKFImCsOO' }],
    [
      'script',
      {
        defer: 'defer',
        src: 'https://umami.shiqianjiang.cn/script.js',
        'data-website-id': '173d8bd2-740c-46ee-b581-9c0c003ae5ea'
      }
    ] //<script defer src="http://211.101.247.38:3500/script.js" data-website-id="173d8bd2-740c-46ee-b581-9c0c003ae5ea"></script>
  ],
  description:
    'Ceru Music 是基于 Electron 和 Vue 开发的跨平台桌面音乐播放器工具，一个跨平台的音乐播放器应用，支持基于合规插件获取公开音乐信息与播放功能。',
  markdown: {
    config(md) {
      md.use(note)
    }
  },
  themeConfig: {
    returnToTopLabel: '返回顶部',
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: '使用文档', link: '/guide/' },
      { text: '插件开发', link: '/guide/plugins/v2/' },
      { text: '接口文档', link: 'https://api.ceru.shiqianjiang.cn/api-docs' }
    ],

    sidebar: {
      '/guide/plugins/v2/': [pluginSidebar, legacyPluginSidebar],
      '/': [
        {
          text: 'CeruMusic',
          items: [
            { text: '安装教程', link: '/guide/' },
            {
              text: '使用教程',
              collapsed: false,
              items: [
                { text: '搜索与播放', link: '/guide/used/search-and-play' },
                { text: '音乐播放列表', link: '/guide/used/playList' },
                { text: '歌曲下载', link: '/guide/used/download' },
                { text: '本地音乐', link: '/guide/used/local-music' },
                { text: '外观与主题', link: '/guide/used/appearance' },
                { text: '音效与均衡器', link: '/guide/used/audio-effects' },
                { text: '快捷键', link: '/guide/used/hotkeys' },
                { text: '听歌识曲与分享', link: '/guide/used/recognize-and-share' },
                { text: '一起听', link: '/guide/used/listen-together' },
                { text: '数据存储', link: '/guide/used/storage' },
                { text: 'Scheme URL', link: '/guide/used/scheme-url' }
              ]
            },
            { text: '常见问题 FAQ', link: '/guide/faq' },
            { text: '更新日志', link: '/guide/updateLog' },
            { text: '更新计划', link: '/guide/update' }
          ]
        },
        pluginSidebar,
        legacyPluginSidebar,
        {
          text: '开发者接口',
          items: [
            { text: 'v2 抽屉与存储（旧入口）', link: '/guide/CeruMusicPluginUIStorage' },
            { text: '澜音后端对接文档', link: '/guide/api' },
            { text: '一起听 · 接口对接（开发者）', link: '/guide/listen-together-api' }
          ]
        },
        {
          text: '鸣谢名单',
          link: '/guide/sponsorship'
        },
        {
          text: '参考资源',
          items: [
            { text: '如何高效提问', link: '/guide/source/qa' },
            { text: '官方Q群', link: '/guide/source/qq_group' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/timeshiftsauce/CeruMusic' },
      { icon: 'gitee', link: 'https://gitee.com/sqjcode/CeruMuisc' },
      { icon: 'qq', link: 'https://qm.qq.com/q/IDpQnbGd06' },
      { icon: 'beatsbydre', link: 'https://shiqianjiang.cn' },
      { icon: 'bilibili', link: 'https://space.bilibili.com/696709986' }
    ],
    footer: {
      message: 'Released under the Apache License 2.0 License.',
      copyright: `Copyright © 2025-${new Date().getFullYear()} 时迁酱`
    },
    editLink: {
      pattern: 'https://github.com/timeshiftsauce/CeruMusic/edit/main/docs/:path'
    },
    search: {
      provider: 'local'
    },
    outline: {
      level: [2, 4],
      label: '文章导航'
    },
    docFooter: {
      next: '下一篇',
      prev: '上一篇'
    },
    lastUpdatedText: '上次更新'
  },
  sitemap: {
    hostname: 'https://ceru.docs.shiqianjiang.cn'
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern'
        },
        sass: {
          api: 'modern'
        }
      }
    }
  },
  lastUpdated: true
})
// Smooth scrolling functions
