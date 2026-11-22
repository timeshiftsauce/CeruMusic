export class SurfaceCapacity {
  private readonly groups = new Map<string | undefined, Set<symbol>>()
  stopped = false

  reserve(slot?: string): () => void {
    if (this.stopped) throw Error('插件已停止')
    const group = this.groups.get(slot) ?? new Set<symbol>()
    if (group.size >= (slot === undefined ? 16 : 200)) {
      throw Error(slot === undefined ? '插件页面数量超过限制' : '插件槽位实例数量超过限制')
    }
    const token = Symbol()
    group.add(token)
    this.groups.set(slot, group)
    return () => {
      if (group.delete(token) && !group.size) this.groups.delete(slot)
    }
  }

  stop() {
    this.stopped = true
    this.groups.clear()
  }
}
