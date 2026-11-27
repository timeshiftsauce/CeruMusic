/**
 * 笔记正文的断行点
 *
 * 笔记里经常一整行都是插件导入链接(100+ 字符),而详情右栏只有 ~400px:
 * 必须换行,但不能像 break-all 那样把 hello 拆成 he/llo。
 * 浏览器默认只在 - 处断开,行首会剩 "https://v4.gh-" 这种半截行;
 * 这里把 "/" 拆出来,后面补 <wbr>,让长链接只在路径分隔处折行 ——
 * 正常单词不受影响,复制出来的文本也不会多出字符。
 */
import { h, type FunctionalComponent } from 'vue'
import { STICKER_MAP } from '@renderer/utils/listenTogether/stickers'

/** 保留路径分隔符和贴纸标记，让正文可以逐段渲染。 */
export function splitNoteText(content: string): string[] {
  return content.split(/(\/|\[sticker-\d+\])/)
}

/**
 * 渲染笔记正文 —— 普通文字照常排版,链接只在 "/" 后有断行点。
 * 保留原文换行(pre-wrap),长链接放不下时按路径分段折行。
 */
export const NoteText: FunctionalComponent<{ text: string }> = (props) =>
  h(
    'span',
    { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } },
    splitNoteText(props.text).map((part, index) => {
      if (index % 2 === 0) return part
      if (part === '/') return [part, h('wbr')]
      const sticker = STICKER_MAP[part.slice(1, -1)]
      if (!sticker) return part
      return h('img', {
        src: sticker.src,
        alt: sticker.label,
        title: sticker.label,
        style: {
          width: 'var(--note-sticker-size, 4em)',
          height: 'var(--note-sticker-size, 4em)',
          verticalAlign: 'middle'
        }
      })
    })
  )
