import { DialogPlugin } from 'tdesign-vue-next'

/**
 * 自伤信号命中时的援助提示
 *
 * 后端口径:DeepseekService 判定 action='review'(本人情绪表达)时,
 * community.service 会把 `support` 挂到发布响应上(形状见 api/community.ts 的 SelfHarmSupport)。
 *
 * 这里刻意不复用那个类型:本文件要被 jest 直接跑,而 `@renderer` 别名只在
 * tsconfig.web.json 里,根 tsconfig / jest 解析不了 —— 用结构类型绕开。
 *
 * 用弹窗而不是 toast —— 这种提示一闪而过就白搭了。
 */
export function showSupportNotice(
  support?: { title: string; text: string; hotline?: string } | null
): void {
  if (!support) return
  const dialog = DialogPlugin.alert({
    header: support.title,
    body: `${support.text}${support.hotline ? `\n\n心理援助热线：${support.hotline}` : ''}`,
    confirmBtn: '我知道了',
    onConfirm: () => dialog.hide()
  })
}
