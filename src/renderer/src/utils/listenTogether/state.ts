/**
 * 一起听运行时状态 —— 跨模块的同步状态访问点
 *
 * 为什么需要这个模块:ControlAudio store 和 crossfade 模块在判断"当前是否在房间"
 * 时如果直接 import ListenTogether store 会产生循环依赖(ListenTogether 依赖
 * ControlAudio)。同时,这些热路径(start/stop/timeupdate)不能用动态 import。
 *
 * ListenTogether store 在 isInRoom 变化时调用 setLtInRoom 更新此处的标志,
 * 其他模块通过 isLtInRoom() 同步读取。
 */

let _inRoom = false

export function setLtInRoom(value: boolean): void {
  _inRoom = value
}

export function isLtInRoom(): boolean {
  return _inRoom
}
