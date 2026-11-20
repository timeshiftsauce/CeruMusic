import tdesignStyles from 'tdesign-vue-next/dist/tdesign.min.css?inline'
import lyricStyles from '@applemusic-like-lyrics/core/style.css?inline'
import { componentStyles } from '@shiqianjiang/ceru-plugin-core/component-runtime'

let sheet: CSSStyleSheet | undefined
/** Parse the host's component CSS once, then adopt it in each closed root. */
export function pluginComponentSheet() {
  if (!sheet) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync([tdesignStyles, componentStyles, lyricStyles].join('\n'))
  }
  return sheet
}
