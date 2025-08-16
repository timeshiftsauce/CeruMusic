import { h, defineComponent } from 'vue'

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

// 播放控制相关图标
export const PlayCircleIcon = createIconComponent('music')
export const PauseCircleIcon = createIconComponent('a-tingzhiwukuang')
export const SkipBackIcon = createIconComponent('xiangzuo')
export const SkipForwardIcon = createIconComponent('xiangyou')
export const VolumeIcon = createIconComponent('a-yinleyinxiaoduomeiti')
export const Volume1Icon = createIconComponent('a-yinleyinxiaoduomeiti')
export const Volume2Icon = createIconComponent('a-yinleyinxiaoduomeiti')
export const VolumeXIcon = createIconComponent('a-quxiaoguanbi')
export const MinimizeIcon = createIconComponent('zuixiaohua1')
export const MaximizeIcon = createIconComponent('a-suduxingneng')
export const XIcon = createIconComponent('a-quxiaoguanbi')
export const HeartIcon = createIconComponent('remen')
export const DownloadIcon = createIconComponent('fuzhi') // 使用复制图标代替下载图标
export const MoreIcon = createIconComponent('gengduo')
