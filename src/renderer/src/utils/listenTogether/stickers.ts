/**
 * 一起听 —— 贴纸资源注册表
 *
 * 设计要点:
 *   - 用静态 ESM import 让 Vite 把 PNG 进打包流水线(产出 hash 化 URL,可被
 *     主进程 file://、生产构建 cdn 都正确解析),避免 `new URL('@assets/...')`
 *     在 production 下相对路径错位。
 *   - 协议层只传 sticker id(如 'sticker-5')。即便对端版本贴纸资源对不上,
 *     也可以降级显示 label;反之即使发送方没有该贴纸,id 仍是稳定的字符串。
 *   - id 命名采用 `sticker-<index>`,index 与文件名后缀对齐,方便排查问题。
 *   - 顺序即面板展示顺序 —— 这里按用户给定的"图片描述顺序"重排(而非按
 *     文件名数字升序),保证打开面板时第一行就是高频"打招呼"类贴纸。
 */

import s0 from '@renderer/assets/smallBag/image-1778940200831-0.png'
import s1 from '@renderer/assets/smallBag/image-1778940201021-1.png'
import s2 from '@renderer/assets/smallBag/image-1778940201255-2.png'
import s3 from '@renderer/assets/smallBag/image-1778940201410-3.png'
import s4 from '@renderer/assets/smallBag/image-1778940201588-4.png'
import s5 from '@renderer/assets/smallBag/image-1778940201728-5.png'
import s6 from '@renderer/assets/smallBag/image-1778940201872-6.png'
import s7 from '@renderer/assets/smallBag/image-1778940202023-7.png'
import s8 from '@renderer/assets/smallBag/image-1778940202184-8.png'
import s9 from '@renderer/assets/smallBag/image-1778940202333-9.png'
import s10 from '@renderer/assets/smallBag/image-1778940202483-10.png'
import s11 from '@renderer/assets/smallBag/image-1778940202623-11.png'
import s12 from '@renderer/assets/smallBag/image-1778940202767-12.png'
import s13 from '@renderer/assets/smallBag/image-1778940202912-13.png'
import s14 from '@renderer/assets/smallBag/image-1778940203058-14.png'
import s15 from '@renderer/assets/smallBag/image-1778940203214-15.png'

export interface Sticker {
  /** 协议传输用 id —— 务必保持稳定,改名会导致老消息无法渲染 */
  id: string
  /** 静态导入后的 URL */
  src: string
  /** 图片下方的中文描述,也作为通知/复制 fallback */
  label: string
}

/**
 * 面板展示顺序(从左到右、从上到下)
 *
 * 用户提供的文件名 → 描述映射:
 *   -0 好听！  -1 一起听歌  -2 哇塞   -3 感动
 *   -4 单曲循环 -5 等你哦   -6 来啦~  -7 哈哈哈
 *   -8 谢谢你  -9 晚安      -10 没事哒 -11 随便听听
 *   -12 等歌中… -13 拜拜    -14 棒！  -15 抱抱
 *
 * 这里按"打招呼/正向反馈/状态/告别"分组排版,方便 4 列网格快速定位。
 */
export const STICKERS: Sticker[] = [
  { id: 'sticker-1', src: s1, label: '一起听歌' },
  { id: 'sticker-6', src: s6, label: '来啦~' },
  { id: 'sticker-5', src: s5, label: '等你哦' },
  { id: 'sticker-12', src: s12, label: '等歌中…' },

  { id: 'sticker-0', src: s0, label: '好听！' },
  { id: 'sticker-14', src: s14, label: '棒！' },
  { id: 'sticker-2', src: s2, label: '哇塞' },
  { id: 'sticker-3', src: s3, label: '感动' },

  { id: 'sticker-7', src: s7, label: '哈哈哈' },
  { id: 'sticker-15', src: s15, label: '抱抱' },
  { id: 'sticker-8', src: s8, label: '谢谢你' },
  { id: 'sticker-10', src: s10, label: '没事哒' },

  { id: 'sticker-4', src: s4, label: '单曲循环' },
  { id: 'sticker-11', src: s11, label: '随便听听' },
  { id: 'sticker-9', src: s9, label: '晚安' },
  { id: 'sticker-13', src: s13, label: '拜拜' }
]

/**
 * id → 贴纸快查表(O(1) 渲染)。
 * 接收消息时用 `STICKER_MAP[msg.content]` 取贴纸,取不到则回退到纯文本展示
 * `content`(老/新客户端兼容)。
 */
export const STICKER_MAP: Record<string, Sticker> = Object.fromEntries(
  STICKERS.map((s) => [s.id, s])
)

/**
 * 给通知/复制等需要纯文本的场景提供贴纸的可读描述。
 * 找不到时直接返回原 id —— 不抛错,保证通知链路绝不阻塞。
 */
export function describeSticker(id: string): string {
  return STICKER_MAP[id]?.label || id
}

/**
 * 颜文字预设
 *
 * 设计要点:
 *   - 与图片贴纸不同:颜文字点击后**直接插入输入框**作为普通文本,
 *     走原本的 text 消息通道(协议无需扩展、所有端通用)。
 *   - 50 个常用条目,覆盖问候/开心/卖萌/捂脸/惊讶/无奈/晚安等高频场景。
 *   - 这里只存字符串,不存描述 —— 颜文字本身即表达,加文字反而拥挤。
 *   - 排序大致按"使用频率/情绪强度"分块,便于网格中扫描。
 */
export const KAOMOJI: string[] = [
  // 问候 / 招手
  '(/≧▽≦)/',
  'ヾ(≧▽≦*)o',
  '(*^▽^*)',
  '(◍•ᴗ•◍)',
  'ヾ(•ω•`)o',
  // 开心 / 兴奋
  '(✿◡‿◡)',
  '(★ω★)/',
  '(๑•̀ㅂ•́)و✧',
  '(≧∇≦)ﾉ',
  '٩(◕‿◕)۶',
  '(づ｡◕‿‿◕｡)づ',
  '(❁´◡`❁)',
  '(*≧ω≦)',
  '٩(๑❛ᴗ❛๑)۶',
  // 卖萌 / 撒娇
  '(´▽`ʃ♡ƪ)',
  '(/ω＼)',
  '( • ̀ω•́ )',
  '(｡♡‿♡｡)',
  '(◍•ᴗ•◍)❤',
  '(o´∀`o)',
  // 无奈 / 捂脸
  '(´。＿。｀)',
  '( •́ _ •̀ )',
  '(¬‿¬)',
  '(◞‸◟)',
  '(┬┬﹏┬┬)',
  '(；′⌒`)',
  'φ(>ω<*)',
  // 惊讶 / 震惊
  '(°ロ°)',
  '(⊙_⊙)',
  '( ﾟдﾟ)',
  'Σ(ﾟдﾟ;)',
  '(°o°)',
  // 思考 / 探究
  '(¬_¬)',
  '(￣ω￣;)',
  '(・∀・)',
  '(￣▽￣)~*',
  // OK / 比心 / 鼓掌
  '(ง •_•)ง',
  '(•̀ᴗ•́)و ̑̑',
  'ヽ(✿ﾟ▽ﾟ)ノ',
  '٩(ˊᗜˋ*)و',
  '( •̀ ω •́ )✧',
  '(つ✧ω✧)つ',
  // 哭 / 委屈
  '(╥﹏╥)',
  '(っ˘̩╭╮˘̩)っ',
  'ヽ(*。>Д<)o゜',
  '( T_T)\\(^-^ )',
  // 拜拜 / 晚安
  '( ´ ▽ ` )ﾉ',
  'ヾ(￣▽￣)Bye~Bye~',
  '(￣o￣) zzZZzzZZ',
  '(。-ω-)zzz',
  '(*￣3￣)╭'
]
