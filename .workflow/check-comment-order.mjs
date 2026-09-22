/**
 * 校验:评论列表的「顺序 + 分页」行为
 *
 *  顺序 —— 与后端 listComments 对齐:一级评论倒序(新→旧)、回复正序(旧→新)
 *    1) 初始顺序跟随后端
 *    2) 新发的一级评论插到最前(不是末尾)
 *    3) 新回复追加在所属根评论末尾,不影响根评论顺序
 *  分页 —— 分页单位是「一级评论」,滚到底自动加载下一页
 *    4) 翻到第 2 页:重叠项按 id 去重(offset 分页 + 本地插评论会漂移)
 *    5) 到底后显示「已显示全部评论」,不再重复请求
 *
 * 跑法(在 CeruMusic 根目录): node .workflow/check-comment-order.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { parse, compileScript, compileStyleAsync } from '@vue/compiler-sfc'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const root = resolve('src/renderer/src/components/community')
const output = resolve('.workflow/comment-order')
await mkdir(output, { recursive: true })
let styles = []

const mock = {
  '@renderer/api/community': `export const communityAPI={
    getPost:async()=>window.fixturePost,
    listComments:async(id,page,pageSize)=>window.listCommentsImpl(page,pageSize),
    listReplies:async(rootId,page,pageSize)=>window.listRepliesImpl(rootId,page,pageSize),
    createComment:async p=>window.createCommentImpl(p),
    toggleLike:async()=>({liked:true}),
    deleteComment:async()=>true,
    toggleCommentLike:async()=>({liked:true}),
    report:async()=>true,
    deletePost:async()=>true,
    updatePost:async()=>({}),
    uploadImage:async()=>({url:''})
  }`,
  '@renderer/store/Auth':
    'export const useAuthStore=()=>({isAuthenticated:true,user:{sub:"1"}})',
  '@renderer/api/cloudSongList':
    'export const cloudSongListAPI={getSongListDetail:()=>new Promise(()=>{})}',
  '@renderer/api/songList':
    'export default {getAll:async()=>({success:true,data:[]}),search:async()=>({success:true,data:[]}),create:async()=>({success:false})}',
  '@renderer/store/LocalUserDetail':
    'export const LocalUserDetailStore=()=>({userInfo:{}})',
  '@renderer/utils/communitySupport': 'export const showSupportNotice=()=>{}',
  '@renderer/utils/ossImage':
    'export const ossAvatar=x=>x,ossCard=x=>x,ossThumb=x=>x,ossDetail=x=>x',
  'vue-router': 'export const useRouter=()=>({push(){}})'
}

await build({
  stdin: {
    contents: `
import { h, createApp } from 'vue';
import TDesign from 'tdesign-vue-next';
import Modal from '../../components/community/PostDetailModal.vue';

const at = d => new Date(Date.UTC(2026, 0, d)).toISOString();
/* 每条评论都塞长文本 —— 首屏必须高过视口,否则哨兵一进屏就自动翻页,
 * 就测不到"滚动触发"这条路径了 */
const filler = '凑高度的长文本,'.repeat(60);
const mk = i => ({ id:'c'+i, postId:'p1', userId:'u'+i, username:'用户'+i,
  content:'第'+i+'条评论 '+filler, parentId:null, createdAt:at(100-i), likeCount:0 });

window.fixturePost = { id:'p1', userId:'author', username:'作者', userAvatar:'', content:'笔记正文',
  images:[], attachment:null, createdAt:at(1), likeCount:0, commentCount:20, liked:false };
/* 顺序刻意按后端真实返回摆:根评论倒序(c1 最新 → c8),回复紧跟自己的根。
 * c1 有 52 条回复,首屏按「每根一页」只带回前 50 条 → 出现「加载更多回复 (2)」 */
const ts = min => new Date(Date.UTC(2026, 0, 20, 0, 0, min)).toISOString();
const mkReply = (i, rootId, minute) => ({ id:'r'+i, postId:'p1', userId:'u9', username:'回复者'+i,
  content:'第'+i+'条回复', parentId:rootId, replyToUsername:'用户1', createdAt:ts(minute), likeCount:0 });
window.fixtureComments = [ { ...mk(1), replyCount: 52 },
  ...Array.from({ length: 50 }, (_, k) => mkReply(k + 1, 'c1', k)),
  ...[2,3,4,5,6,7,8].map(mk) ];
/* 第 2 页:offset=8 处故意把 c8 再发一次(模拟"翻页前有人发了新评论"的漂移) */
window.pageTwo = [ mk(8), ...[9,10,11,12,13].map(mk) ];
window.pageTwoReplies = [ mkReply(51,'c1',50), mkReply(52,'c1',51) ];
window.commentCalls = [];
window.replyCalls = [];
window.listCommentsImpl = (page, pageSize) => {
  window.commentCalls.push({ page, pageSize });
  const items = page === 1 ? window.fixtureComments : window.pageTwo;
  return Promise.resolve({ items, total: 20, rootTotal: 13, page, pageSize, hasMore: page === 1 });
};
window.listRepliesImpl = (rootId, page, pageSize) => {
  window.replyCalls.push({ rootId, page, pageSize });
  return Promise.resolve({ items: window.pageTwoReplies, total: 52, page, pageSize, hasMore: false });
};
window.createCommentImpl = ({ content, parentId }) => Promise.resolve({
  id: 'new-' + content, postId: 'p1', userId:'1', username:'我', content,
  parentId: parentId || null, replyToUsername: null,
  createdAt: new Date().toISOString(), likeCount:0, status:'normal'
});
window.createCommentImpl = ({ content, parentId }) => Promise.resolve({
  id: 'new-' + content, postId: 'p1', userId:'1', username:'我', content,
  parentId: parentId || null, replyToUsername: null,
  createdAt: new Date().toISOString(), likeCount:0, status:'normal'
});

createApp({ render: () => h(Modal, { postId:'p1', initialPost: window.fixturePost }) })
  .use(TDesign).mount('#app');
`,
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  format: 'iife',
  outfile: join(output, 'preview.js'),
  loader: { '.ttf': 'dataurl' },
  define: {
    'process.env.NODE_ENV': '"production"',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  },
  plugins: [
    {
      name: 'sfc',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => {
          if (Object.hasOwn(mock, a.path)) return { path: a.path, namespace: 'mock' }
          if (a.path.startsWith('@renderer/'))
            return { path: resolve('src/renderer/src', a.path.slice(10)) }
          if (a.path.startsWith('@common/')) {
            const p = resolve('src/common', a.path.slice(8))
            return { path: existsSync(p + '.ts') ? p + '.ts' : p }
          }
          return undefined
        })
        b.onLoad({ filter: /.*/, namespace: 'mock' }, (a) => ({ contents: mock[a.path] }))
        b.onLoad({ filter: /\.vue$/ }, async (a) => {
          const { descriptor, errors } = parse(await readFile(a.path, 'utf8'), { filename: a.path })
          if (errors.length) throw errors[0]
          const id = 'data-v-' + Buffer.from(a.path).toString('hex').slice(-18)
          for (const s of descriptor.styles) {
            const compiled = await compileStyleAsync({
              source: s.content,
              filename: a.path,
              id,
              scoped: s.scoped,
              preprocessLang: s.lang,
              preprocessCustomRequire: (m) => require(m === 'sass' ? 'sass-embedded' : m)
            })
            if (compiled.errors.length) throw compiled.errors[0]
            styles.push(compiled.code)
          }
          const script = compileScript(descriptor, { id, inlineTemplate: true, genDefaultAs: 'component' })
          return {
            contents: script.content + `\ncomponent.__scopeId=${JSON.stringify(id)}; export default component`,
            loader: 'ts',
            resolveDir: dirname(a.path)
          }
        })
      }
    }
  ]
})

/* 样式必须真的加载:没有 CSS 时 .content-area 不会被限高、页面整体在滚,
 * 哨兵会提前进入视口,分页与滚动行为全都测不准 */
const css = styles
  .join('\n')
  .replace(
    /url\((['"]?)(\.\.\/\.\.\/assets\/[^)'" ]+)\1\)/g,
    (_, quote, p) => `url("${pathToFileURL(resolve(root, p)).href}")`
  )
await writeFile(
  join(output, 'preview.css'),
  (await readFile('node_modules/tdesign-vue-next/dist/tdesign.css', 'utf8')) + '\n' + css
)
await writeFile(
  join(output, 'index.html'),
  `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="preview.css"><style>:root{--td-brand-color:#fa6487;--td-brand-color-light:#fff0f4}html,body,#app{height:100%}body{margin:0}</style><div id="app"></div><script src="preview.js"></script>`
)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.goto(pathToFileURL(join(output, 'index.html')).href)
  await page.locator('.comments-content .comment').first().waitFor({ state: 'attached' })

  /** 一级评论顺序(按 DOM 文本) */
  const rootOrder = () =>
    page.$$eval('.comments-content .comment', (els) =>
      els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())
    )
  /** 某条根评论下的回复顺序 */
  const repliesOf = (text) =>
    page.$$eval(
      '.comments-content .comment',
      (els, t) => {
        const el = els.find((e) => e.textContent.includes(t))
        return el
          ? [...el.querySelectorAll('.reply')].map((r) => r.textContent.replace(/\s+/g, ' ').trim())
          : null
      },
      text
    )

  // 1) 初始顺序 = 后端给的顺序(根倒序)
  let order = await rootOrder()
  assert.equal(order.length, 8, `应有 8 个一级评论,实际 ${order.length}`)
  assert.ok(order[0].includes('第1条评论'), `首条应是最新的根评论,实际: ${order[0]}`)
  assert.ok(order[7].includes('第8条评论'), '末条应是最旧的根评论')
  const firstPageCalls = await page.evaluate(() => window.commentCalls.length)
  assert.equal(firstPageCalls, 1, `首屏只应请求一次,实际 ${firstPageCalls}`)
  console.log('PASS 1: 初始根评论顺序跟随后端(倒序),只拉第 1 页')

  // 2) 发一级评论 → 必须出现在最前面
  await page.fill('.comment-input input', '我来评论')
  await page.click('.comment-input button')
  await page.waitForTimeout(300)
  order = await rootOrder()
  assert.equal(order.length, 9, `发完应有 9 个一级评论,实际 ${order.length}`)
  assert.ok(order[0].includes('我来评论'), `新评论应在最前,实际首条: ${order[0]}`)
  assert.ok(!order[8].includes('我来评论'), '新评论不应还在末尾')
  console.log('PASS 2: 新发的一级评论插到最前')

  // 3) 回复某条根评论 → 追加在该根评论的回复末尾,根顺序不变
  await page
    .locator('.comments-content .comment', { hasText: '第1条评论' })
    .locator('button', { hasText: '回复' })
    .first()
    .click()
  await page.fill('.comment-input input', '我的回复')
  await page.click('.comment-input button')
  await page.waitForTimeout(300)

  const firstReplies = await repliesOf('第1条评论')
  assert.equal(
    firstReplies?.length,
    51,
    `第1条评论下应加载了 51 条回复(首屏 50 + 新发 1),实际 ${firstReplies?.length}`
  )
  assert.ok(firstReplies.at(-1).includes('我的回复'), '新回复应挂在该根评论的回复末尾')
  order = await rootOrder()
  assert.ok(order[0].includes('我来评论') && order[8].includes('第8条评论'), '回复不应改变根评论顺序')
  console.log('PASS 3: 新回复追加在所属根评论末尾,根评论顺序不受影响')

  // 4) 滚到底自动翻页 + 去重(第 2 页里的 c8 与已加载的重复)
  const beforeScroll = await rootOrder()
  assert.equal(beforeScroll.length, 9, '翻页前应仍是 9 个根评论')
  await page.locator('.content-area').evaluate(el => { el.scrollTop = el.scrollHeight })
  await page.waitForTimeout(400)
  order = await rootOrder()
  assert.equal(order.length, 14, `翻页后应有 14 个根评论(9 + 第2页 5 条新的),实际 ${order.length}`)
  const duplicated = order.filter(text => text.includes('第8条评论')).length
  assert.equal(duplicated, 1, `第 8 条评论出现了 ${duplicated} 次,说明没按 id 去重`)
  assert.ok(order.at(-1).includes('第13条评论'), '第 2 页内容应追加在列表末尾')
  const calls = await page.evaluate(() => window.commentCalls)
  assert.deepEqual(
    calls.map(c => c.page),
    [1, 2],
    `请求页码应为 [1,2],实际 ${JSON.stringify(calls.map(c => c.page))}`
  )
  assert.equal(calls[0].pageSize, 50, `首屏每页应为 50,实际 ${calls[0].pageSize}`)
  console.log('PASS 4: 滚到底自动加载第 2 页,重叠项按 id 去重')

  // 5) 到底不再重复请求
  await page.locator('.content-area').evaluate(el => { el.scrollTop = el.scrollHeight })
  await page.waitForTimeout(400)
  const afterCalls = await page.evaluate(() => window.commentCalls.length)
  assert.equal(afterCalls, 2, `到底后不应再请求,实际请求了 ${afterCalls} 次`)
  assert.ok(
    await page.locator('.comments-more', { hasText: '已显示全部评论' }).isVisible(),
    '到底后应显示「已显示全部评论」'
  )
  console.log('PASS 5: 到底显示「已显示全部评论」且不再请求')

  // 6) 回复分页:首屏每根只带一页,剩下的点「加载更多回复」按根翻页
  const replyButton = page.locator('.comments-content .comment', { hasText: '第1条评论' })
    .locator('.c-more-replies')
  assert.ok(await replyButton.isVisible(), '回复未加载完的根评论应显示「加载更多回复」')
  const label = (await replyButton.textContent()).trim()
  assert.ok(label.includes('加载更多回复 (2)'), `按钮应剩余 2 条,实际文案: ${label}`)

  await replyButton.click()
  await page.waitForTimeout(300)
  const repliesAfter = await repliesOf('第1条评论')
  assert.equal(repliesAfter?.length, 53, `加载后应有 53 条回复,实际 ${repliesAfter?.length}`)
  /* 关键:新加载进来的旧回复要插在「我刚发的那条」前面,而不是甩到最后 */
  assert.ok(repliesAfter[49].includes('第50条回复'), '第 50 条应仍在原位')
  assert.ok(repliesAfter[50].includes('第51条回复'), '新加载的旧回复应插到本地新回复之前')
  assert.ok(repliesAfter[51].includes('第52条回复'), '第 52 条也应插到本地新回复之前')
  assert.ok(repliesAfter.at(-1).includes('我的回复'), '本地新发的回复仍应排在最后')

  const replyCalls = await page.evaluate(() => window.replyCalls)
  assert.deepEqual(
    replyCalls.map(c => [c.rootId, c.page, c.pageSize]),
    [['c1', 2, 50]],
    `应按根评论请求第 2 页(每页 50),实际 ${JSON.stringify(replyCalls)}`
  )
  assert.equal(await replyButton.count(), 0, '全部加载完后按钮应消失')
  console.log('PASS 6: 回复按根分页,点「加载更多回复」补进正确位置')

  assert.deepEqual(pageErrors, [], `页面报错: ${pageErrors.join(' | ')}`)
  console.log('\n全部通过(6/6)')
} finally {
  await browser.close()
}
