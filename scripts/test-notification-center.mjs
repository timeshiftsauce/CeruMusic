import assert from 'node:assert/strict'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

// Real components + Pinia store, deterministic API at the boundary.
const modules = {
  'virtual:inbox-socket': `
    window.__sockets=[];
    export class SocketRequest {
      async connect(){const listeners=new Map(); const socket={connected:true,on:(event,fn)=>listeners.set(event,fn),removeAllListeners:()=>listeners.clear(),disconnect:()=>{socket.connected=false},emit:(event)=>listeners.get(event)?.()}; window.__sockets.push(socket);return socket}
    }`,
  'virtual:inbox-auth': `import {defineStore} from 'pinia'; import {ref} from 'vue';
    export const useAuthStore=defineStore('auth',()=>({isAuthenticated:ref(true),user:ref({sub:'alice'})}));`,
  'virtual:inbox-api': `
    const notice=(i)=>({id:'notice-'+i,category:'notice',kind:'announcement',title:'更新通知 '+i,
      content:'# 新功能已经到来\\n'+Array(16).fill('欢迎来到澜音社区。这里记录音乐与生活。').join('\\n\\n'),format:'markdown',maxHeight:100,read:false,createdAt:'2026-09-22T12:00:00Z'});
    const messages=[...Array.from({length:10},(_,i)=>({ ...notice(i),id:'like-'+i,category:'interaction',kind:'post_like',actorName:'音乐同好 '+i,title:'赞了你的笔记',content:'一段与音乐有关的记忆',postId:'post-'+i,format:'plain' })),
      ...Array.from({length:112},(_,i)=>notice(i)),...Array.from({length:35},(_,i)=>({...notice(i),id:'comment-'+i,category:'comment',kind:'comment',title:'评论了你的笔记',actorName:'听众 '+i,content:'很好听！',format:'plain'}))];
    window.__fixture={messages,reads:[],failRead:false,clears:0};
    export const notificationsAPI={
      counts:async()=>messages.filter(x=>!x.read&&!x.deleted).reduce((a,x)=>(a.all++,a[x.category]++,a),{all:0,notice:0,interaction:0,comment:0}),
      list:async(category,cursor)=>{const rows=messages.filter(x=>!x.deleted&&(category==='all'||x.category===category));const start=cursor?rows.findIndex(x=>x.id===cursor)+1:0; const items=rows.slice(start,start+30);return {items:structuredClone(items),nextCursor:rows.length>start+30?items.at(-1).id:null}},
      read:async(ids)=>{window.__fixture.reads.push([...ids]); if(window.__fixture.failRead)throw Error('offline');messages.forEach(x=>{if(ids.includes(x.id))x.read=true});return {ids}},
      clear:async()=>{window.__fixture.clears++;let count=0;messages.forEach(x=>{if(x.read){x.deleted=true;count++}});return {count}}
    };`,
  'virtual:inbox-fixture': `import {createApp,h} from 'vue';import {createPinia} from 'pinia';import TDesign from 'tdesign-vue-next';import 'tdesign-vue-next/es/style/index.css';
    import {createRouter,createMemoryHistory,RouterView} from 'vue-router';
    import Bell from '/src/renderer/src/components/notifications/NotificationBell.vue';
    import Center from '/src/renderer/src/components/notifications/NotificationCenter.vue';
    import {useNotificationsStore} from '/src/renderer/src/store/Notifications.ts';
    import {useAuthStore} from 'virtual:inbox-auth';
    const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',name:'music',component:{render:()=>h('p','音乐页面')}},{path:'/community',name:'community',component:{render:()=>h('p','社区页面')}}]});
    const app=createApp({render:()=>h('div',{style:'height:100vh;background:#f2f7f7;padding:40px;box-sizing:border-box'},[h('h1','Ceru Music'),h('p','音乐与回应，都在这里。'),h(Bell),h(RouterView),h(Center)])});
    app.use(createPinia());app.use(TDesign);app.use(router);app.mount('#app');window.inbox=useNotificationsStore();window.auth=useAuthStore();window.router=router;`,
  'virtual:inbox-post': `import {h} from 'vue'; export default {props:['postId','initialReplyTo'],emits:['close'],render(){return h('div',{'data-post-id':this.postId},[h('span','笔记详情'),h('button',{onClick:()=>this.$emit('close')},'关闭笔记')])}}`
}
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: '.tmp/vite-notification-test',
  logLevel: 'error',
  optimizeDeps: {
    entries: [],
    include: [
      'vue',
      'pinia',
      'tdesign-vue-next',
      'naive-ui',
      'tdesign-icons-vue-next',
      'marked',
      'dompurify',
      'gsap'
    ]
  },
  resolve: {
    alias: { '@renderer': resolve('src/renderer/src'), '@common': resolve('src/common') }
  },
  plugins: [
    {
      name: 'notification-test-boundaries',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id in modules) return '\0' + id
        if (id.endsWith('/utils/request') && importer?.includes('useNotificationConnection'))
          return '\0virtual:inbox-socket'
        if (id.endsWith('/api/notifications') || id.endsWith('/api/notifications.ts'))
          return '\0virtual:inbox-api'
        if (
          (id === './Auth' && importer?.includes('store/Notifications')) ||
          id.endsWith('/store/Auth')
        )
          return '\0virtual:inbox-auth'
        if (id.endsWith('/community/PostDetailModal.vue')) return '\0virtual:inbox-post'
      },
      load(id) {
        return modules[id.replace(/^\0/, '')]
      },
      configureServer(s) {
        s.middlewares.use('/__notification_test', (_req, res) => {
          res.setHeader('Content-Type', 'text/html')
          res.end(
            '<html><meta charset="UTF-8"><body style="margin:0"><div id="app"></div><script type="module" src="/@id/virtual:inbox-fixture"></script></body></html>'
          )
        })
      }
    },
    vue()
  ],
  server: { host: '127.0.0.1', port: 0 }
})
await server.listen()
await mkdir('.tmp', { recursive: true })
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
const errors = []
page.on('pageerror', (error) => {
  errors.push(error.message)
  console.error(error.message)
})
page.on('console', (message) => {
  if (message.type() === 'error') console.error(message.text())
})
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__notification_test`)
  await page.waitForFunction(() => window.inbox?.counts.all === 157)
  assert.equal(
    (
      await page
        .locator('.n-badge-sup .n-base-slot-machine-current-number__inner')
        .allTextContents()
    ).join(''),
    '99+'
  )
  for (const count of [1, 99, 157]) {
    await page.evaluate((value) => {
      window.inbox.counts.all = value
    }, count)
    await page.waitForFunction(
      (expected) =>
        Array.from(
          document.querySelectorAll('.n-badge-sup .n-base-slot-machine-current-number__inner')
        )
          .map((el) => el.textContent)
          .join('') === expected,
      count > 99 ? '99+' : String(count)
    )
    const fits = await page.locator('.notification-bell').evaluate((button) => {
      const bounds = button.getBoundingClientRect()
      const badge = button.querySelector('.n-badge-sup').getBoundingClientRect()
      return (
        badge.left >= bounds.left &&
        badge.right <= bounds.right &&
        badge.top >= bounds.top &&
        badge.bottom <= bounds.bottom
      )
    })
    assert.ok(fits, 'Naive UI badge stays inside the settings-sized hit area')
  }
  await page.locator('.notification-bell').click()
  await page.waitForFunction(() => window.inbox.items.length === 30)
  await page.waitForFunction(
    () =>
      document.querySelector('.t-drawer__content-wrapper').getBoundingClientRect().x <
      window.innerWidth
  )
  const geometry = await page.evaluate(() => {
    const panel = document.querySelector('.t-drawer__content-wrapper').getBoundingClientRect()
    const header = document.querySelector('.inbox-header').getBoundingClientRect()
    const close = document.querySelector('.inbox-close').getBoundingClientRect()
    const bell = document.querySelector('.notification-bell').getBoundingClientRect()
    return {
      top: panel.top,
      bottom: panel.bottom,
      viewport: innerHeight,
      closeY: close.y + close.height / 2,
      headerY: header.y + header.height / 2,
      bell: bell.width
    }
  })
  assert.equal(geometry.top, 72)
  assert.equal(geometry.viewport - geometry.bottom, 88)
  assert.ok(
    Math.abs(geometry.closeY - geometry.headerY) < 1,
    'close button aligns with the header center'
  )
  assert.equal(geometry.bell, 36, 'bell retains the settings button hit area')
  assert.equal(
    await page.evaluate(
      () => window.inbox.items.filter((x) => x.category === 'interaction' && x.read).length
    ),
    10
  )
  assert.equal(
    await page.evaluate(
      () => window.inbox.items.filter((x) => x.category === 'notice' && x.read).length
    ),
    0,
    'offscreen announcements must remain unread'
  )
  await page.waitForFunction(() => window.__fixture.reads.length === 1)
  assert.equal(
    await page.evaluate(() => window.__fixture.reads[0].length),
    10,
    'interaction batch is sent together'
  )
  assert.equal(
    await page.locator('.interaction.session-new').count(),
    10,
    'auto-read likes stay highlighted for this opening'
  )
  await page.locator('.inbox-tabs button').nth(2).click()
  await page.waitForFunction(() => window.inbox.items.length === 10)
  await page.evaluate(() => window.inbox.synchronize())
  assert.equal(
    await page.locator('.interaction.session-new').count(),
    10,
    'tab changes and realtime refresh preserve new-message highlights'
  )
  await page.locator('.inbox-tabs button').nth(0).click()
  await page.waitForFunction(() => window.inbox.items.length === 30)
  assert.equal(
    await page.locator('.interaction.session-new').count(),
    10,
    'returning to All preserves highlights'
  )
  await page.screenshot({ path: '.tmp/notification-session-new.png', fullPage: true })
  await page.locator('.inbox-close').click()
  await page.waitForFunction(() => window.inbox.sessionNewIds.size === 0)
  await page.locator('.notification-bell').click()
  await page.waitForFunction(() => window.inbox.items.length === 30)
  assert.equal(
    await page.locator('.interaction.session-new').count(),
    0,
    'reopening does not highlight previously read likes'
  )
  await page.locator('.inbox-tabs button').nth(1).click()
  await page.waitForFunction(
    () => window.inbox.items[0]?.id === 'notice-0' && window.inbox.items[0].read
  )
  assert.equal(await page.evaluate(() => window.inbox.items.at(-1).read), false)
  await page.locator('.notice-card .expand').first().click()
  await page.waitForFunction(() => document.querySelector('.notice-body').clientHeight > 200)
  await page.locator('.notice-card .expand').first().click()
  await page.waitForFunction(() => document.querySelector('.notice-body').clientHeight <= 102)
  // Fast scrolling updates local flags immediately, then coalesces acknowledgements.
  const before = await page.evaluate(() => window.__fixture.reads.length)
  for (const top of [400, 800, 1200])
    await page.locator('.inbox-scroll').evaluate((el, y) => {
      el.scrollTop = y
    }, top)
  await page.waitForFunction(() => window.inbox.items.filter((x) => x.read).length > 3)
  await page.evaluate(() => window.inbox.flushRead())
  assert.ok(
    await page.evaluate((n) => window.__fixture.reads.length - n <= 2, before),
    'scrolling should not issue one request per card'
  )
  await page.locator('.inbox-scroll').evaluate((el) => {
    el.scrollTop = 0
  })
  await page.screenshot({ path: '.tmp/notification-center.png', fullPage: true })
  await page.locator('.inbox-tabs button').nth(3).click()
  await page.waitForFunction(() => window.inbox.items[0]?.id === 'comment-0')
  assert.equal(await page.evaluate(() => window.inbox.items.filter((x) => x.read).length), 30)
  assert.equal(
    await page.evaluate(() => window.inbox.counts.comment),
    5,
    'only the loaded 30 of 35 comments are read'
  )
  await page.evaluate(() => window.inbox.flushRead())
  assert.equal(
    await page.locator('.interaction.session-new').count(),
    30,
    'new comments retain highlights after receipts are sent'
  )
  await page.locator('.inbox-tabs button').nth(2).click()
  await page.waitForFunction(() => window.inbox.items[0]?.id === 'like-0')
  assert.equal(
    await page.locator('.interaction.session-new').count(),
    0,
    'old likes stay unhighlighted during the new opening'
  )
  await page.locator('.inbox-tabs button').nth(3).click()
  await page.waitForFunction(() => window.inbox.items[0]?.id === 'comment-0')
  assert.equal(
    await page.locator('.interaction.session-new').count(),
    30,
    'comment highlights survive switching away and back'
  )
  await page.evaluate(() => {
    window.__fixture.failRead = true
    window.inbox.markRead([{ ...window.__fixture.messages.find((x) => x.id === 'comment-34') }])
  })
  assert.equal(
    await page.evaluate(() => window.inbox.counts.comment),
    4,
    'read updates are immediate even offline'
  )
  assert.equal(await page.evaluate(() => window.inbox.flushRead()), false)
  assert.equal(
    await page.evaluate(() => window.inbox.clearRead()),
    false,
    'do not silently clear while acknowledgements failed'
  )
  await page.evaluate(() => {
    window.__fixture.failRead = false
  })
  assert.equal(await page.evaluate(() => window.inbox.flushRead()), true)
  await page.evaluate(() => window.inbox.clearRead())
  assert.ok(
    await page.evaluate(() =>
      window.__fixture.messages.filter((x) => x.deleted).every((x) => x.read)
    ),
    'clear retains unread messages'
  )
  // The transparent outside layer covers the sides and floating top/bottom gaps.
  await page.locator('.inbox-header h2').click()
  assert.equal(await page.evaluate(() => window.inbox.open), true, 'inside clicks keep it open')
  for (const [x, y] of [
    [20, 450],
    [1200, 30],
    [1200, 850]
  ]) {
    await page.mouse.click(x, y)
    await page.waitForFunction(() => !window.inbox.open)
    await page.locator('.notification-bell').click()
    await page.locator('.inbox-header h2').waitFor({ state: 'visible' })
  }
  await page.locator('.inbox-close').click()
  await page.evaluate(() => {
    const base = window.__fixture.messages.find((x) => x.id === 'notice-0')
    window.__fixture.messages.unshift(
      ...['moderation-1', 'moderation-2'].map((id) => ({
        ...base,
        id,
        deleted: false,
        read: false,
        kind: 'moderation',
        format: 'plain',
        maxHeight: 180,
        title: '你的回复已下线',
        postId: 'moderated-post',
        content:
          '所属笔记：作者的「天亮以前说再见」\n回复对象：@小明\n原因：内容违反社区规范\n回复内容：你好'
      }))
    )
    window.inbox.category = 'notice'
  })
  await page.locator('.notification-bell').click()
  await page.waitForFunction(
    () => window.inbox.items[0]?.id === 'moderation-1' && window.inbox.items[0].read
  )
  const shortHeight = await page
    .locator('.notice-body')
    .first()
    .evaluate((el) => {
      const natural = el.firstElementChild.getBoundingClientRect().height
      return { height: el.getBoundingClientRect().height, natural }
    })
  assert.ok(
    Math.abs(shortHeight.height - shortHeight.natural) < 1,
    'first render and read update must not leave a fixed blank height'
  )
  assert.ok(shortHeight.height < 180, 'short notice is naturally compact')
  await page.locator('.inbox-close').click()
  await page.locator('.notification-bell').click()
  await page.locator('.notice-body').first().waitFor({ state: 'visible' })
  assert.equal(
    await page
      .locator('.notice-body')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
    shortHeight.height
  )
  await page.waitForFunction(
    () =>
      Math.abs(
        document
          .querySelector('.notification-drawer .t-drawer__content-wrapper')
          .getBoundingClientRect().right - innerWidth
      ) < 1
  )
  await page.screenshot({ path: '.tmp/notification-moderation.png', fullPage: true })
  await page.locator('.view-post').first().click()
  await page.waitForFunction(
    () => window.router.currentRoute.value.name === 'community' && !window.inbox.open
  )
  await page.locator('[data-post-id="moderated-post"]').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '关闭笔记' }).click()
  await page.locator('.notification-bell').click()
  await page.locator('.notice-title').first().click()
  await page.locator('[data-post-id="moderated-post"]').waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(() => window.router.currentRoute.value.name), 'community')
  // Lost live hints do not lose database messages: reconnect and query them.
  await page.evaluate(() => {
    const fixture = window.__fixture
    const base = fixture.messages.find((x) => x.id === 'notice-0')
    fixture.messages.unshift(
      ...Array.from({ length: 65 }, (_, i) => ({
        ...base,
        id: 'offline-' + i,
        read: false,
        deleted: false
      }))
    )
    const socket = window.__sockets.at(-1)
    socket.connected = false
    socket.emit('disconnect')
  })
  await page.waitForFunction(() => window.__sockets.length === 2)
  await page.waitForFunction(() => window.inbox.counts.notice >= 65)
  await page.locator('.notification-bell').click()
  await page.waitForFunction(() => window.inbox.items[0]?.id === 'offline-0')
  await page.evaluate(async () => {
    await window.inbox.load()
    await window.inbox.load()
  })
  assert.equal(
    await page.evaluate(() => window.inbox.items.filter((x) => x.id.startsWith('offline-')).length),
    65,
    'all offline messages remain pageable'
  )
  await page.evaluate(() => {
    const base = window.__fixture.messages[0]
    window.__fixture.messages.unshift({ ...base, id: 'live-new', read: false })
    for (let i = 0; i < 50; i++) window.__sockets.at(-1).emit('notifications:changed')
  })
  await page.waitForFunction(() => window.inbox.items[0]?.id === 'live-new')
  assert.ok(
    await page.evaluate(() => window.inbox.items.length >= 90),
    'live refresh preserves the loaded window'
  )
  assert.equal(
    await page.evaluate(() => new Set(window.inbox.items.map((x) => x.id)).size),
    await page.evaluate(() => window.inbox.items.length),
    'duplicate hints never duplicate messages'
  )
  await page.evaluate(() => {
    window.auth.isAuthenticated = false
  })
  await page.waitForFunction(
    () => window.inbox.counts.all === 0 && window.inbox.items.length === 0 && !window.inbox.open
  )
  assert.ok(
    await page.evaluate(() => window.__sockets.every((socket) => !socket.connected)),
    'logout disconnects notification sockets'
  )
  if (process.env.NOTIFICATION_MARKDOWN_PREVIEW) {
    await page.addStyleTag({ url: '/src/renderer/src/assets/base.css' })
    await page.evaluate(() => {
      const base = window.__fixture.messages.find((item) => item.id === 'notice-0')
      window.__fixture.messages.unshift({
        ...base,
        id: 'markdown-preview',
        deleted: false,
        read: false,
        maxHeight: 600,
        title: '社区更新 · 让交流更清楚',
        content: [
          '## 和音乐同好，聊得更近一点',
          '现在，你可以在消息中心查看 **收到的评论**，也可以直接回复对方。',
          '> 每一份分享，都值得被认真回应。\n> 感谢你让澜音社区更加温暖。',
          '- 点击通知，直达对应笔记\n- 支持 `Markdown` 排版与链接',
          '```text\n分享音乐，也分享此刻的心情。\n```',
          '| 消息类型 | 查看位置 |\n| --- | --- |\n| 评论与点赞 | 消息中心 |',
          '[了解本次更新](https://example.com/update) · *愿你今天也有好音乐相伴。*'
        ].join('\n\n')
      })
      window.auth.isAuthenticated = true
    })
    await page.locator('.notification-bell').click()
    await page.waitForFunction(() => window.inbox.items[0]?.id === 'markdown-preview')
    await page.waitForFunction(
      () =>
        Math.abs(
          document
            .querySelector('.notification-drawer .t-drawer__content-wrapper')
            .getBoundingClientRect().right - innerWidth
        ) < 1
    )
    await page.screenshot({ path: '.tmp/notification-markdown-light.png', fullPage: true })
    await page.evaluate(() => document.documentElement.setAttribute('theme-mode', 'dark'))
    await page.screenshot({ path: '.tmp/notification-markdown-dark.png', fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log(
    'Notification UI: realtime refresh, 65 offline messages recovered, duplicate hints, Naive UI badge bounds, compact card heights, community navigation, viewport reads, batch paging, offline retry, clear-read, outside-click dismissal and logout isolation passed.'
  )
} catch (error) {
  console.error(
    'Notification fixture state:',
    await page.evaluate(() => ({
      url: location.href,
      counts: window.inbox?.counts,
      items: window.inbox?.items?.length,
      sockets: window.__sockets?.length,
      body: document.body.innerText.slice(0, 1000)
    }))
  )
  throw error
} finally {
  await browser.close()
  await server.close()
}
