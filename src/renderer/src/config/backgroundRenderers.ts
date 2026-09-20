export const backgroundRenderers = [
  {
    value: 'pixi',
    label: '经典流动',
    name: 'Pixi',
    fullName: 'PixiRenderer',
    description: '将封面叠成多层，旋转、移动并强烈模糊，呈现柔和的彩色云雾。',
    detail: '经典背景效果，不随音乐鼓点变化。',
    supportsBeat: false
  },
  {
    value: 'mesh',
    label: '网格渐变',
    name: 'Mesh',
    fullName: 'MeshGradientRenderer',
    description:
      '将封面映射到变形网格，形成流动、扭曲的色块。已额外柔化封面轮廓，让色彩过渡更自然。',
    detail: '开启鼓点效果后，低频驱动缩放、旋转与明暗变化。',
    supportsBeat: true
  },
  {
    value: 'isolation',
    label: '四色渐变',
    name: 'Isolation',
    fullName: 'IsolationRenderer',
    description:
      '提取封面的四个主色，重新生成流动渐变，不保留封面图案；支持明暗波动和减少渐变色带。',
    detail: 'AMLL 0.6.0 新增，目前不随音乐鼓点变化。',
    supportsBeat: false
  }
] as const

export type BackgroundRendererType = (typeof backgroundRenderers)[number]['value']

export function getBackgroundRenderer(value: string) {
  return backgroundRenderers.find((renderer) => renderer.value === value) ?? backgroundRenderers[0]
}
