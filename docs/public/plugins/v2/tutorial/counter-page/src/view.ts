import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'

export default defineSurface((surface) => {
  const button = document.createElement('button')
  const output = document.createElement('p')
  button.textContent = '计数 +1'
  output.textContent = '点击按钮，从后台读取并保存计数'
  surface.root.append(button, output)

  const click = async () => {
    button.disabled = true
    try {
      await surface.invoke('counter.increment', null)
    } catch {
      output.textContent = '操作失败，请查看插件日志后重试'
    } finally {
      button.disabled = false
    }
  }
  button.addEventListener('click', click)
  const unsubscribe = surface.subscribe((state) => {
    output.textContent = '计数：' + String(state.count ?? 0)
  })
  return () => {
    unsubscribe()
    button.removeEventListener('click', click)
    button.remove()
    output.remove()
  }
})
