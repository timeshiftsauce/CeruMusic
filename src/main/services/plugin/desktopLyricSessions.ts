type Surface = { pluginId: string; surfaceId: string; sessionId: string }

export class DesktopLyricSessions {
  private epoch = 0
  private active?: Surface

  constructor(private readonly close: (session: Surface) => Promise<void>) {}

  async mount<Session extends Surface>(create: () => Promise<Session>): Promise<Session> {
    const epoch = ++this.epoch
    await this.releaseActive()
    if (epoch !== this.epoch) throw Error('桌面歌词视图已关闭')
    const session = await create()
    if (epoch !== this.epoch) {
      await this.close(session)
      throw Error('桌面歌词视图已关闭')
    }
    this.active = session
    return session
  }

  owns(pluginId: string, surfaceId: string, sessionId: string): boolean {
    return !!this.active && this.active.pluginId === pluginId &&
      this.active.surfaceId === surfaceId && this.active.sessionId === sessionId
  }

  receives(pluginId: string, sessionId: string): boolean {
    return !!this.active && this.active.pluginId === pluginId && this.active.sessionId === sessionId
  }

  async dispose(): Promise<void> {
    ++this.epoch
    await this.releaseActive()
  }

  private async releaseActive(): Promise<void> {
    const previous = this.active
    this.active = undefined
    if (previous) await this.close(previous)
  }
}
