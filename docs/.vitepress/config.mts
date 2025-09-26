import { defineConfig } from 'vitepress'
import note from 'markdown-it-footnote'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Ceru Music',
  base: '/',
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
      { text: '使用文档', link: '/guide/' }
    ],

    sidebar: [
      {
        text: 'CeruMusic',
        items: [
          { text: '安装教程', link: '/guide/' },
          {
            text: '使用教程',
            items: [{ text: '音乐播放列表', link: '/guide/used/playList' }]
          },
          { text: '软件设计文档', link: '/guide/design' },
          { text: '更新日志', link: '/guide/updateLog' },
          { text: '更新计划', link: '/guide/update' }
        ]
      },
      {
        text: '澜音&插件',
        items: [
          { text: '插件类使用', link: '/guide/CeruMusicPluginHost' },
          { text: '澜音插件开发文档（重点）', link: '/guide/CeruMusicPluginDev' }
        ]
      },{
        text: '鸣谢名单',
        link: '/guide/sponsorship'
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
  lastUpdated: true,
  head: [['link', { rel: 'icon', href: '/logo.svg' }]]
})
console.log(process.env.BASE_URL_DOCS)
// Smooth scrolling functions
