import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: "Ceru Music",
  base: process.env.BASE_URL ?? '/CeruMusic/',
  description: "Ceru Music 是基于 Electron 和 Vue 开发的跨平台桌面音乐播放器工具，一个跨平台的音乐播放器应用，支持基于合规插件获取公开音乐信息与播放功能。",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: '使用文档', link: '/guide/' }
    ],

    sidebar: [
      {
        text: 'CeruMusic',
        items: [
          { text: '使用教程', link: '/guide/' },
          { text: '软件设计文档', link: '/guide/design' }
        ]
      },
      {
        text: '澜音&插件',
        items: [
          { text: '插件类使用', link: '/guide/CeruMusicPluginHost' },
          { text: '澜音插件开发文档（重点）', link: '/guide/CeruMusicPluginDev' }
        ]
      }
    ],

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
    }
  },
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: (process.env.BASE_URL ?? '/CeruMusic/') + 'logo.svg' }]]
})
// Smooth scrolling functions
