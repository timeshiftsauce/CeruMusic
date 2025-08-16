import { h, defineComponent } from 'vue'
import iconJson from './iconfont.json'

// 创建图标组件的工厂函数
const createIconComponent = (iconId: string) => {
  return defineComponent({
    name: `Icon${iconId}`,
    render() {
      return h(
        'svg',
        {
          class: 'icon',
          'aria-hidden': 'true'
        },
        [
          h('use', {
            'xlink:href': `#icon-${iconId}`
          })
        ]
      )
    }
  })
}

const fonts = {} as Record<string, ReturnType<typeof createIconComponent>>

for (const item of iconJson.glyphs) {
  fonts[item.font_class as string] = createIconComponent(item.font_class)
}

export default fonts
