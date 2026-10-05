import * as path from 'path'
import * as fs from 'fs/promises'
import * as crypto from 'crypto'
import axios from 'axios'
import { configManager } from '../ConfigManager'
import { applyPlaybackRequestHeaders } from '../plugin/playbackRequests'
import { getRequestAgentsFor } from '../networkProxy'
import { compareQualities } from '@shiqianjiang/ceru-plugin-sdk/quality'
import { songCacheKey as sharedSongCacheKey } from '@common/musicItem'
import { getMusicMetaCache, MusicMetaCache } from './MetaCache'
import { sortByEvictionPriority } from './eviction'

/** 缓存索引条目：记录要回收（LRU）所需的访问元数据 */
interface CacheEntry {
  /** 缓存文件绝对路径 */
  file: string
  /** 文件字节数（用于容量统计，避免每次 stat） */
  size: number
  /** 最后访问时间（毫秒时间戳），LRU 依据 */
  lastAccess: number
  /** 命中次数，LFU 依据 */
  hits: number
  /** 该缓存对应的音质，供缓存升级时比较 */
  quality?: string
}

const INDEX_FILE = 'cache-index.json'
const DEFAULT_MAX_CACHE_BYTES = 15 * 1024 * 1024 * 1024 // 15 GiB

/** 把字节数格式化成便于阅读的字符串 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1)
  return `${Number((bytes / k ** i).toFixed(2))} ${units[i]}`
}

/** 缓存内容分类（音频 / 封面 / 歌词）的占用明细 */
export interface CacheBreakdownItem {
  key: 'audio' | 'cover' | 'lyric'
  count: number
  size: number
  sizeFormatted: string
  /** 占缓存总量的百分比（0-100） */
  percent: number
}

export interface QualityBreakdownItem {
  /** 音质标识（128k / 320k / flac ...），未知时为「未知」 */
  quality: string
  count: number
  size: number
  sizeFormatted: string
  /** 占「音频总量」的百分比（0-100），各档相加约等于 100 */
  percent: number
}

export interface CacheInfo {
  /** 音频文件数量（封面/歌词数量见 breakdown） */
  count: number
  size: number
  sizeFormatted: string
  maxBytes: number
  maxFormatted: string
  maxQuality: string
  percent: number
  /** 按内容分类的占用明细，供设置页展示 */
  breakdown: CacheBreakdownItem[]
  /** 按音质聚合的占用明细（仅音频），用于扇形图 */
  qualityBreakdown: QualityBreakdownItem[]
}

export class MusicCacheService {
  private cacheIndex: Map<string, CacheEntry> = new Map()
  /** 封面图片本体索引（key 为 songCacheKey） */
  private coverFileIndex: Map<string, CacheEntry> = new Map()
  /** 文本元数据（歌词/封面 URL）走 SQLite */
  private meta: MusicMetaCache
  /** 串行化淘汰，避免并发写入时重复计算容量 */
  private evicting: Promise<unknown> | null = null
  /** 命中计数落盘防抖定时器 —— 避免每次播放都写一次索引文件 */
  private persistTimer: NodeJS.Timeout | null = null
  private static readonly PERSIST_DEBOUNCE_MS = 10_000

  constructor(metaCache?: MusicMetaCache) {
    this.meta = metaCache ?? getMusicMetaCache()
    this.initCache()
  }

  private getCacheDirectory(): string {
    // 使用配置管理服务获取缓存目录
    const directories = configManager.getDirectories()
    return directories.cacheDir
  }

  // 动态获取缓存目录
  public get cacheDir(): string {
    return this.getCacheDirectory()
  }

  // 动态获取索引文件路径
  public get indexFilePath(): string {
    return path.join(this.cacheDir, 'cache-index.json')
  }

  public get lyricIndexFilePath(): string {
    return path.join(this.cacheDir, 'cache-lyric-index.json')
  }

  /** 封面图片本体存磁盘，跟音频文件分开目录，避免与音频扩展名混淆 */
  public get coverDir(): string {
    return path.join(this.cacheDir, 'covers')
  }

  public get coverIndexFilePath(): string {
    return path.join(this.cacheDir, 'cache-cover-index.json')
  }

  private async initCache() {
    try {
      // 确保缓存目录存在
      await fs.mkdir(this.cacheDir, { recursive: true })

      // 加载缓存索引
      await this.loadCacheIndex()
      await this.loadCoverFileIndex()
      // 旧版歌词 JSON 索引 → SQLite 一次性迁移
      await this.migrateLegacyLyricIndex()
    } catch (error) {
      console.error('初始化音乐缓存失败:', error)
    }
  }

  private async loadCacheIndex() {
    try {
      const indexData = await fs.readFile(this.indexFilePath, 'utf-8')
      const index = JSON.parse(indexData) as Record<string, any>
      const entries = new Map<string, CacheEntry>()
      let size = 0
      for (const [key, value] of Object.entries(index)) {
        if (typeof value === 'string') {
          // 旧格式：key -> filePath。补全 size/lastAccess（用文件 mtime 兜底）。
          let fileSize = 0
          let mtime = Date.now()
          try {
            const stat = await fs.stat(value)
            fileSize = stat.size
            mtime = stat.mtimeMs
          } catch {
            continue // 文件已丢失，直接丢弃该条
          }
          entries.set(key, {
            file: value,
            size: fileSize,
            lastAccess: mtime,
            hits: 0
          })
          size += fileSize
        } else if (value && typeof value.file === 'string') {
          const entry: CacheEntry = {
            file: value.file,
            size: Number(value.size) || 0,
            lastAccess: Number(value.lastAccess) || Date.now(),
            hits: Number(value.hits) || 0,
            quality: typeof value.quality === 'string' ? value.quality : undefined
          }
          entries.set(key, entry)
          size += entry.size
        }
      }
      this.cacheIndex = entries
      console.log(`缓存索引已加载: ${entries.size} 条, 合计 ${(size / 1024 ** 3).toFixed(2)} GiB`)
    } catch (error) {
      // 索引文件不存在或损坏，创建新的
      this.cacheIndex = new Map()
      await this.saveCacheIndex()
    }
  }

  /**
   * 把旧版 `cache-lyric-index.json` 迁移到 SQLite。
   *
   * 旧索引形如 `{ [md5Key]: "/abs/path/xxx.lrc" }`，文件内容可能是纯文本歌词，
   * 也可能是后来写入的 JSON 字符串（结构化 CrLyric）。两种都原样搬进 DB，
   * 读取端再自行判断。迁移成功后删除旧 JSON 与磁盘上的 .lrc 文件。
   */
  private async migrateLegacyLyricIndex() {
    const legacyPath = this.lyricIndexFilePath
    let raw: string
    try {
      raw = await fs.readFile(legacyPath, 'utf-8')
    } catch {
      return // 没有旧索引，正常路径
    }

    try {
      const index = JSON.parse(raw) as Record<string, string>
      const entries = Object.entries(index)
      let migrated = 0

      for (const [key, filePath] of entries) {
        if (typeof filePath !== 'string') continue
        // 已经有新数据就不覆盖
        if (this.meta.has('lyric', key)) continue
        try {
          const content = await fs.readFile(filePath, 'utf-8')
          if (!content) continue
          this.meta.put('lyric', key, content)
          migrated++
          // 迁移成功后删掉旧的 .lrc 文件
          await fs.unlink(filePath).catch(() => {})
        } catch {
          // 单个文件读不到就跳过，不影响整体迁移
        }
      }

      // 旧 JSON 索引完成使命，删除（无论迁移了几条）
      await fs.unlink(legacyPath).catch(() => {})
      console.log(`歌词缓存索引已迁移到 SQLite: ${migrated}/${entries.length} 条`)
    } catch (error) {
      // JSON 损坏：直接删掉，避免每次启动都失败
      console.warn('旧歌词索引解析失败，已清除:', error)
      await fs.unlink(legacyPath).catch(() => {})
    }
  }

  private async saveCacheIndex() {
    try {
      const indexObj = Object.fromEntries(this.cacheIndex)
      await fs.writeFile(this.indexFilePath, JSON.stringify(indexObj, null, 2))
    } catch (error) {
      console.error('保存缓存索引失败:', error)
    }
  }

  /**
   * 防抖落盘：命中缓存时 hits/lastAccess 变了，但没必要每次播放都写文件。
   * 延迟合并成一次写入；淘汰、新增缓存等关键路径仍立即落盘。
   */
  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      void this.saveCacheIndex()
    }, MusicCacheService.PERSIST_DEBOUNCE_MS)
    // 不要让定时器阻碍进程退出
    this.persistTimer.unref?.()
  }

  /** 立即把待写入的索引刷到磁盘（应用退出前调用） */
  async flushCacheIndex(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    await this.saveCacheIndex()
  }

  // ============ 缓存策略配置 ============

  /** 缓存容量上限（字节）。默认 15 GiB。0 / 负数 视为「不限制」。 */
  public getMaxCacheBytes(): number {
    const configured = configManager.get<number>('cacheMaxBytes', DEFAULT_MAX_CACHE_BYTES)
    const value = Number(configured)
    if (!Number.isFinite(value) || value <= 0) return 0
    return value
  }

  /** 缓存音质上限：高于此音质不缓存。默认 'flac'。空串 / 不设置 视为「不限制」。 */
  public getMaxCacheQuality(): string {
    return String(configManager.get<string>('cacheMaxQuality', 'flac') || '')
  }

  /**
   * 判断某音质是否允许缓存。
   * 需要传入该音源的音质顺序（从低到高），因为音质名称没有全局排名。
   * 未指定上限时一律允许；无法比较时也允许（宁可缓存，不要漏缓存）。
   */
  public shouldCacheQuality(
    quality: string | undefined,
    qualityOrder: readonly string[] = []
  ): boolean {
    const limit = this.getMaxCacheQuality()
    if (!limit || !quality) return true
    if (!qualityOrder.length) return true
    const cmp = compareQualities(qualityOrder, quality, limit)
    if (cmp === undefined) return true
    // cmp > 0 表示 quality 高于 limit
    return cmp <= 0
  }

  private generateCacheKey(songId: string): string {
    return crypto.createHash('md5').update(`${songId}`).digest('hex')
  }

  /**
   * 本地音乐不参与缓存。
   *
   * 本地歌曲的文件就在磁盘上，缓存一份副本既浪费空间又没有收益。
   * 统一在这里判定，省得各调用点各自漏判。
   */
  public isCacheable(song: { source?: string; pluginResource?: any } | undefined): boolean {
    if (!song) return false
    const provider = song.pluginResource?.providerId || song.source || ''
    return provider !== 'local'
  }

  /**
   * 一首歌的缓存 key —— 音频文件、歌词、封面共用同一个 key。
   * 实现放在 @common/musicItem，与渲染层共享，避免两边构造不一致导致缓存互相命中不了。
   */
  public songCacheKey(song: {
    pluginResource?: any
    songmid?: string | number
    hash?: string
    name?: string
    singer?: string
    source?: string
  }): string {
    return sharedSongCacheKey(song)
  }

  /**
   * 缓存文件扩展名。
   * 歌源 URL 常带签名、无扩展名（`...?sign=...`），单靠 pathname 猜不出来；
   * 优先用响应的 content-type，其次 URL，最后回退 .mp3。
   * 注意 Chromium 对 file:// 不做内容嗅探，扩展名错会导致无法播放。
   */
  private resolveCacheExtension(url: string, contentType?: string): string {
    const fromMime = (mime?: string): string | null => {
      if (!mime) return null
      const m = mime.split(';')[0].trim().toLowerCase()
      switch (m) {
        case 'audio/mpeg':
        case 'audio/mp3':
          return '.mp3'
        case 'audio/mp4':
        case 'audio/x-m4a':
        case 'audio/m4a':
          return '.m4a'
        case 'audio/aac':
          return '.aac'
        case 'audio/flac':
        case 'audio/x-flac':
          return '.flac'
        case 'audio/ogg':
          return '.ogg'
        case 'audio/wav':
        case 'audio/x-wav':
          return '.wav'
        case 'audio/ape':
        case 'audio/x-ape':
          return '.ape'
        default:
          // 未知 audio/* 子类型时交给 URL 扩展名判断
          return null
      }
    }

    const fromUrl = (): string | null => {
      try {
        const ext = path.extname(new URL(url).pathname).toLowerCase()
        return ext && ext.length <= 6 ? ext : null
      } catch {
        return null
      }
    }

    return fromMime(contentType) || fromUrl() || '.mp3'
  }

  private getCacheFilePath(cacheKey: string, ext: string): string {
    return path.join(this.cacheDir, `${cacheKey}${ext}`)
  }

  /**
   * 读取音频缓存。
   *
   * 关键：缓存里记录着「这份文件是什么音质」。只有当**请求音质不高于**缓存音质时
   * 才命中 —— 这样用户把音质选到 128k 时不会硬塞给他 FLAC（音质比要求高但流量/解码
   * 都不对），而已有更高音质缓存时也不必降级重下。
   *
   * @param quality 本次请求的音质
   * @param qualityOrder 该音源的音质顺序（从低到高）
   */
  async getCachedMusicUrl(
    songId: string,
    quality?: string,
    qualityOrder: readonly string[] = []
  ): Promise<string | null> {
    const cacheKey = this.generateCacheKey(songId)

    // 检查是否已缓存
    const entry = this.cacheIndex.get(cacheKey)
    if (entry) {
      // 音质不匹配（请求的比缓存的高）→ 视为未命中，交给上层回源重取，
      // 下载完成后会以更高音质替换掉旧的缓存文件。
      if (quality && entry.quality && qualityOrder.length > 0) {
        const cmp = compareQualities(qualityOrder, quality, entry.quality)
        if (cmp === 1) {
          console.log(`缓存音质 ${entry.quality} 低于请求 ${quality}，重新拉取`)
          return null
        }
      }

      try {
        // 验证文件是否存在
        await fs.access(entry.file)
        // 命中即累加使用次数 + 刷新最后访问时间（两项都是淘汰依据）
        entry.hits += 1
        entry.lastAccess = Date.now()
        // 防抖落盘，保证重启后淘汰依据不丢
        this.schedulePersist()
        console.log(`使用缓存文件: ${entry.file}`)
        return this.toFileUrl(entry.file)
      } catch (error) {
        // 文件不存在，从缓存索引中移除
        console.warn(`缓存文件不存在，移除索引: ${entry.file}`)
        this.cacheIndex.delete(cacheKey)
        await this.saveCacheIndex()
      }
    }

    return null
  }

  /**
   * 缓存歌曲（音频本体）。同一首歌只保留一份。
   *
   * 音质上限的语义：高于上限的音质不缓存（省空间）。
   * 若已缓存同一首歌：
   * - 新音质更高 → 用新的替换旧的（缓存「升级」）
   * - 新音质不高于已缓存 → 跳过，避免同曲多份
   *
   * @param quality 本次解析使用的音质
   * @param qualityOrder 该音源的音质顺序（从低到高），用于比较音质高低
   */
  async cacheMusic(
    songId: string,
    url: string,
    quality?: string,
    qualityOrder: readonly string[] = []
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(songId)

    if (!this.shouldCacheQuality(quality, qualityOrder)) {
      console.log(`音质 ${quality} 高于缓存上限 ${this.getMaxCacheQuality()}，跳过缓存`)
      return
    }

    // 已缓存同一首歌：只有新音质更高才替换，否则直接复用现有文件。
    const existing = this.cacheIndex.get(cacheKey)
    if (existing) {
      const better =
        quality &&
        existing.quality &&
        qualityOrder.length > 0 &&
        compareQualities(qualityOrder, quality, existing.quality) === 1
      if (!better) {
        console.log(`已有缓存音质 ${existing.quality ?? '未知'}，跳过重复缓存`)
        return
      }
      console.log(`缓存升级: ${existing.quality} → ${quality}`)
    }

    try {
      await this.downloadAndCache(songId, url, cacheKey, quality, qualityOrder)
    } catch (error) {
      console.error(`缓存歌曲失败: ${songId}`, error)
      throw error
    }
  }

  /**
   * 读取缓存的歌词对象（结构化 CrLyric）。
   * 注意：入参是已生成的 cacheKey，内部不再做二次 hash。
   */
  async getCachedLyricObject<T = any>(cacheKey: string): Promise<T | null> {
    const raw = this.readLyricByKey(cacheKey)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      // 旧文本歌词（非 JSON）—— 视为未命中，交给调用方回源
      return null
    }
  }

  /** 写入缓存的歌词对象（结构化 CrLyric）。入参是已生成的 cacheKey。 */
  cacheLyricObject(cacheKey: string, lyric: unknown): void {
    try {
      this.writeLyricByKey(cacheKey, JSON.stringify(lyric))
    } catch (error) {
      console.error('缓存歌词对象失败:', error)
    }
  }

  /** 按已生成的 cacheKey 写入文本歌词（导出链路使用） */
  async cacheLyric(cacheKey: string, lyric: string): Promise<void> {
    this.writeLyricByKey(cacheKey, lyric)
  }

  /** 按已生成的 cacheKey 读取文本歌词（导出链路使用） */
  async getCachedLyric(cacheKey: string): Promise<string | null> {
    return this.readLyricByKey(cacheKey)
  }

  // ============ 封面缓存 ============
  //
  // 只缓存图片「本体」（下面的 getCachedCoverFile / cacheCoverFile）。
  // 刻意不缓存封面 URL：歌源链接多带签名会过期，缓存 URL 会让失效链接长期生效。

  /**
   * 本地绝对路径 → 可被渲染进程加载的 file:// URL。
   *
   * Windows 上不能简单拼 `file://` + `G:\a\b.jpg` —— 那是非法 URL
   * （盘符会被当成主机名，反斜杠也不合法），`<img>` 会直接加载失败。
   * 正确形式是 `file:///G:/a/b.jpg`：三斜杠 + 正斜杠。
   */
  private toFileUrl(file: string): string {
    const normalized = file.replace(/\\/g, '/')
    return `file:///${normalized.replace(/^\/+/, '')}`
  }

  /**
   * 读取封面图片本体（已落盘的本地文件），返回可直接喂给 <img>/fetch 的 file:// URL。
   *
   * 只缓存 URL 是不够的 —— 渲染层每次播放仍要联网下载整张图片，
   * 这正是「音频已缓存但切歌仍卡」的主因。这里把二进制也存到本地。
   */
  async getCachedCoverFile(songCacheKey: string): Promise<string | null> {
    const entry = this.coverFileIndex.get(songCacheKey)
    if (!entry) return null
    try {
      await fs.access(entry.file)
      entry.lastAccess = Date.now()
      entry.hits += 1
      this.schedulePersist()
      return this.toFileUrl(entry.file)
    } catch {
      // 文件被外部删除，清掉索引条目
      this.coverFileIndex.delete(songCacheKey)
      await this.saveCoverFileIndex()
      return null
    }
  }

  /**
   * 写入封面图片本体。只在首次写入时落盘，后续命中直接复用，
   * 避免同一首歌反复写同一张图。
   */
  async cacheCoverFile(songCacheKey: string, data: Buffer, ext: string): Promise<string> {
    const existing = this.coverFileIndex.get(songCacheKey)
    if (existing) {
      try {
        await fs.access(existing.file)
        return this.toFileUrl(existing.file)
      } catch {
        this.coverFileIndex.delete(songCacheKey)
      }
    }

    const hash = this.generateCacheKey(songCacheKey)
    const file = path.join(this.coverDir, `${hash}${ext}`)
    await fs.mkdir(this.coverDir, { recursive: true })
    await fs.writeFile(file, data)
    this.coverFileIndex.set(songCacheKey, {
      file,
      size: data.byteLength,
      lastAccess: Date.now(),
      hits: 1
    })
    await this.saveCoverFileIndex()
    this.scheduleEviction()
    return this.toFileUrl(file)
  }

  /** 删除某首歌的封面缓存（文件损坏时由渲染层请求清理，便于下次重新下载） */
  async invalidateCoverFile(songCacheKey: string): Promise<void> {
    const entry = this.coverFileIndex.get(songCacheKey)
    if (!entry) return
    await fs.unlink(entry.file).catch(() => {})
    this.coverFileIndex.delete(songCacheKey)
    await this.saveCoverFileIndex()
  }

  private async loadCoverFileIndex() {
    try {
      const raw = await fs.readFile(this.coverIndexFilePath, 'utf-8')
      const obj = JSON.parse(raw) as Record<string, any>
      const map = new Map<string, CacheEntry>()
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value.file === 'string') {
          map.set(key, {
            file: value.file,
            size: Number(value.size) || 0,
            lastAccess: Number(value.lastAccess) || Date.now(),
            hits: Number(value.hits) || 0
          })
        }
      }
      this.coverFileIndex = map
    } catch {
      this.coverFileIndex = new Map()
    }
  }

  private async saveCoverFileIndex() {
    try {
      const obj = Object.fromEntries(this.coverFileIndex)
      await fs.writeFile(this.coverIndexFilePath, JSON.stringify(obj, null, 2))
    } catch (error) {
      console.error('保存封面缓存索引失败:', error)
    }
  }

  private readLyricByKey(cacheKey: string): string | null {
    return this.meta.get('lyric', cacheKey)
  }

  private writeLyricByKey(cacheKey: string, content: string): void {
    try {
      this.meta.put('lyric', cacheKey, content)
    } catch (error) {
      console.error(`缓存歌词失败: ${cacheKey}`, error)
    }
  }

  private async downloadAndCache(
    songId: string,
    url: string,
    cacheKey: string,
    quality?: string,
    _qualityOrder: readonly string[] = []
  ): Promise<string> {
    let tempPath = ''
    try {
      console.log(`开始下载歌曲: ${songId}`)

      const agents = getRequestAgentsFor(url)
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        // 代理由主进程网络设置决定;显式关闭以避免环境变量代理干扰
        proxy: false,
        ...(agents ? { httpAgent: agents.httpAgent, httpsAgent: agents.httpsAgent } : {}),
        headers: applyPlaybackRequestHeaders(url, {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }),
        // 4xx/5xx 也要进 catch,否则会把错误页当成歌曲写进缓存
        validateStatus: (status) => status >= 200 && status < 300
      })

      const contentType = String(response.headers?.['content-type'] || '')
      if (/^(text\/|application\/(json|xml|xhtml))/i.test(contentType)) {
        throw new Error(`响应不是音频 (content-type: ${contentType || 'unknown'})`)
      }

      const ext = this.resolveCacheExtension(url, contentType)
      const cacheFilePath = this.getCacheFilePath(cacheKey, ext)
      // 先写临时文件,成功后 rename —— 避免半截文件被当成完整缓存
      tempPath = `${cacheFilePath}.part`
      const writer = require('fs').createWriteStream(tempPath)

      response.data.pipe(writer)

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve())
        writer.on('error', (error: Error) => reject(error))
        response.data.on('error', (error: Error) => reject(error))
      })

      const stat = await fs.stat(tempPath)
      if (stat.size <= 0) throw new Error('下载内容为空')

      // 缓存升级：先记下旧文件路径，写成功后再删，避免中间失败导致无缓存可用
      const previousFile = this.cacheIndex.get(cacheKey)?.file

      await fs.rename(tempPath, cacheFilePath)
      tempPath = ''

      // 更新缓存索引（size 供容量统计、hits/lastAccess 供淘汰打分、quality 供升级比较）
      this.cacheIndex.set(cacheKey, {
        file: cacheFilePath,
        size: stat.size,
        lastAccess: Date.now(),
        // 刚写入即视为使用过 1 次（本次播放），否则新条目 hits=0 会立刻垫底被淘汰
        hits: 1,
        quality
      })
      await this.saveCacheIndex()

      // 新文件已落盘，旧的（可能是低音质那份）删掉，同一首歌只留一份
      if (previousFile && previousFile !== cacheFilePath) {
        await fs.unlink(previousFile).catch(() => {})
      }

      console.log(`歌曲缓存完成: ${cacheFilePath}`)

      // 超出容量上限时按 LRU 淘汰旧缓存（不阻塞本次播放）
      this.scheduleEviction()

      return this.toFileUrl(cacheFilePath)
    } catch (error) {
      if (tempPath) await fs.unlink(tempPath).catch(() => {})
      console.error(`下载歌曲失败: ${songId}`, error)
      throw error
    }
  }

  // ============ LFU + LRU 混合淘汰 ============

  /** 异步触发一次淘汰；若已有淘汰在进行则复用，避免重复扫描。 */
  private scheduleEviction(): void {
    if (this.evicting) return
    this.evicting = this.evictByLru()
      .catch((error) => console.error('缓存淘汰失败:', error))
      .finally(() => {
        this.evicting = null
      })
  }

  /**
   * 按「使用次数 + 最后访问时间」的加权分淘汰，直到总量降到上限以内。
   * 打分规则见 eviction.ts —— 与歌词/封面（SQLite）共用同一口径。
   */
  async evictByLru(): Promise<{ evicted: number; freedBytes: number }> {
    const maxBytes = this.getMaxCacheBytes()
    if (maxBytes <= 0) return { evicted: 0, freedBytes: 0 }

    let total = this.getIndexedSize()
    if (total <= maxBytes) return { evicted: 0, freedBytes: 0 }

    // 分低者先淘汰；同一次播放刚写入的条目 hits=1 且时间最新，不会立刻被删
    const entries = [...this.cacheIndex.values()]
    const ordered = sortByEvictionPriority(entries)
    const keyOf = new Map<CacheEntry, string>()
    for (const [key, entry] of this.cacheIndex) keyOf.set(entry, key)

    let evicted = 0
    let freedBytes = 0
    for (const entry of ordered) {
      if (total <= maxBytes) break
      const key = keyOf.get(entry)
      if (key === undefined) continue
      try {
        await fs.unlink(entry.file)
      } catch (error: any) {
        // 文件可能已被手动删除：仍然从索引移除，避免僵尸条目
        if (error?.code !== 'ENOENT') {
          console.warn('淘汰缓存文件失败:', entry.file, error?.message)
          continue
        }
      }
      this.cacheIndex.delete(key)
      total -= entry.size
      freedBytes += entry.size
      evicted++
    }

    if (evicted > 0) {
      await this.saveCacheIndex()
      console.log(
        `缓存 LRU 淘汰完成: 删除 ${evicted} 个文件, 释放 ${(freedBytes / 1024 ** 3).toFixed(2)} GiB, ` +
          `当前 ${(this.getIndexedSize() / 1024 ** 3).toFixed(2)} GiB`
      )
    }

    // 音频文件清完仍超限时，先淘汰封面文件（比音频易重建），再动 SQLite 元数据
    const coverBytes = this.getCoverFileSize()
    if (total > maxBytes && coverBytes > 0) {
      const entries = [...this.coverFileIndex.values()]
      const coverKeyOf = new Map<CacheEntry, string>()
      for (const [key, entry] of this.coverFileIndex) coverKeyOf.set(entry, key)

      for (const entry of sortByEvictionPriority(entries)) {
        if (total <= maxBytes) break
        try {
          await fs.unlink(entry.file)
        } catch {
          // 文件已不在也继续从索引里移除，避免僵尸条目
        }
        const key = coverKeyOf.get(entry)
        if (key !== undefined) this.coverFileIndex.delete(key)
        total -= entry.size
        freedBytes += entry.size
        evicted++
      }
      await this.saveCoverFileIndex()
    }

    // 最后才是元数据（歌词/封面 URL）
    if (total > maxBytes) {
      // 先扣掉音频占用，剩余额度给元数据；歌词优先保留，封面更易重建
      const audioBytes = this.getFileSize() + this.getCoverFileSize()
      const metaBudget = Math.max(0, maxBytes - audioBytes)
      const lyricBytes = this.meta.totalSize('lyric')
      // 封面 URL 本身可再生（重新请求一次即可），预算紧张时优先牺牲封面
      const lyricBudget = Math.min(lyricBytes, metaBudget)
      const coverBudget = Math.max(0, metaBudget - lyricBudget)

      const cover = this.meta.evictToLimit('cover', coverBudget)
      const lyric = this.meta.evictToLimit('lyric', lyricBudget)
      evicted += lyric.evicted + cover.evicted
      freedBytes += lyric.freedBytes + cover.freedBytes
    }

    return { evicted, freedBytes }
  }

  /** 仅音频文件占用的字节数 */
  private getFileSize(): number {
    let total = 0
    for (const entry of this.cacheIndex.values()) total += entry.size || 0
    return total
  }

  /** 索引中记录的总字节数（音频文件 + 封面文件 + SQLite 元数据） */
  private getIndexedSize(): number {
    return (
      this.getFileSize() +
      this.getCoverFileSize() +
      this.meta.totalSize('lyric') +
      this.meta.totalSize('cover')
    )
  }

  /** 封面文件占用字节数 */
  private getCoverFileSize(): number {
    let total = 0
    for (const entry of this.coverFileIndex.values()) total += entry.size || 0
    return total
  }

  async clearCache(): Promise<void> {
    try {
      console.log('开始清空缓存目录:', this.cacheDir)

      // 不能重载磁盘索引：内存里的 cacheIndex 才是最完整的（含尚未落盘的 hits/lastAccess）
      let deletedFromIndex = 0
      for (const entry of this.cacheIndex.values()) {
        try {
          await fs.unlink(entry.file)
          deletedFromIndex++
          console.log('删除缓存文件:', entry.file)
        } catch (error: any) {
          console.warn('删除文件失败:', entry.file, error.message)
        }
      }

      // 删除封面图片本体（放在 covers/ 子目录里）
      for (const entry of this.coverFileIndex.values()) {
        try {
          await fs.unlink(entry.file)
          deletedFromIndex++
        } catch (error: any) {
          console.warn('删除封面文件失败:', entry.file, error.message)
        }
      }

      // 删除缓存目录中的所有其他文件（包括可能遗漏的文件）；covers/ 是目录，需递归
      let deletedFromDir = 0
      const removeDirContents = async (dir: string) => {
        let items: string[]
        try {
          items = await fs.readdir(dir)
        } catch {
          return
        }
        for (const item of items) {
          const itemPath = path.join(dir, item)
          try {
            const stats = await fs.stat(itemPath)
            if (stats.isDirectory()) {
              await removeDirContents(itemPath)
            } else if (item !== INDEX_FILE && item !== path.basename(this.coverIndexFilePath)) {
              await fs.unlink(itemPath)
              deletedFromDir++
              console.log('删除目录文件:', itemPath)
            }
          } catch (error: any) {
            console.warn('删除目录文件失败:', itemPath, error.message)
          }
        }
      }
      await removeDirContents(this.cacheDir)

      // 清空缓存索引（含封面文件索引；SQLite 中的歌词/封面 URL 一并清掉）
      this.cacheIndex.clear()
      await this.saveCacheIndex()
      this.coverFileIndex.clear()
      await this.saveCoverFileIndex()
      this.meta.clear()

      console.log(
        `音乐缓存已清空 - 从索引删除: ${deletedFromIndex}个文件, 从目录删除: ${deletedFromDir}个文件`
      )
    } catch (error) {
      console.error('清空缓存失败:', error)
      throw error
    }
  }

  getDirectorySize = async (dirPath: string): Promise<number> => {
    let totalSize = 0

    try {
      const items = await fs.readdir(dirPath)

      for (const item of items) {
        const itemPath = path.join(dirPath, item)
        const stats = await fs.stat(itemPath)

        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath)
        } else {
          totalSize += stats.size
        }
      }
    } catch {
      // 忽略无法访问的文件/目录
    }

    return totalSize
  }

  async getCacheInfo(): Promise<CacheInfo> {
    // 不能重载磁盘索引：会把内存中尚未落盘的 hits/lastAccess 覆盖掉

    const audioExts = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.wma', '.ape']
    const coverExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']

    let audioBytes = 0
    let audioCount = 0
    let coverBytes = 0
    let coverCount = 0

    const scanDir = async (
      dir: string,
      exts: string[],
      onHit: (size: number) => void
    ): Promise<void> => {
      let items: string[]
      try {
        items = await fs.readdir(dir)
      } catch {
        return
      }
      for (const item of items) {
        const itemPath = path.join(dir, item)
        try {
          const stats = await fs.stat(itemPath)
          if (stats.isDirectory()) {
            await scanDir(itemPath, exts, onHit)
          } else if (exts.includes(path.extname(item).toLowerCase())) {
            onHit(stats.size)
          }
        } catch (error: any) {
          console.warn('无法访问文件:', itemPath, error.message)
        }
      }
    }

    await scanDir(this.cacheDir, audioExts, (size) => {
      audioBytes += size
      audioCount++
    })
    await scanDir(this.coverDir, coverExts, (size) => {
      coverBytes += size
      coverCount++
    })

    // SQLite 中的歌词文本 + 封面 URL（图片本体已由上面的目录扫描计入，不重复）
    const lyricBytes = this.meta.totalSize('lyric')
    const lyricCount = this.meta.count('lyric')

    if (audioBytes === 0 && this.cacheIndex.size) {
      // 目录读取异常时退回索引数据
      audioBytes = this.getFileSize()
      audioCount = this.cacheIndex.size
    }

    const totalSize = audioBytes + coverBytes + lyricBytes
    const maxBytes = this.getMaxCacheBytes()
    const pct = (bytes: number) => (totalSize > 0 ? (bytes / totalSize) * 100 : 0)

    // 按音质聚合（只统计音频）：用于设置页的扇形图。
    // 直接读内存索引的 quality 字段，不必再扫磁盘。
    const byQuality = new Map<string, { count: number; size: number }>()
    for (const entry of this.cacheIndex.values()) {
      const q = entry.quality || '未知'
      const bucket = byQuality.get(q) ?? { count: 0, size: 0 }
      bucket.count += 1
      bucket.size += entry.size || 0
      byQuality.set(q, bucket)
    }
    const qualityBreakdown = [...byQuality.entries()]
      .map(([quality, v]) => ({
        quality,
        count: v.count,
        size: v.size,
        sizeFormatted: formatBytes(v.size),
        // 占比以「音频总量」为基数，这样各档音质相加正好 100%
        percent: audioBytes > 0 ? (v.size / audioBytes) * 100 : 0
      }))
      .sort((a, b) => b.size - a.size)

    console.log(
      `缓存信息 - 音频 ${audioCount} 个/${audioBytes}B, 封面 ${coverCount} 个/${coverBytes}B, 歌词 ${lyricCount} 个/${lyricBytes}B`
    )

    return {
      count: audioCount,
      size: totalSize,
      sizeFormatted: formatBytes(totalSize),
      maxBytes,
      maxFormatted: maxBytes > 0 ? formatBytes(maxBytes) : '不限制',
      maxQuality: this.getMaxCacheQuality() || '不限制',
      percent: maxBytes > 0 ? Math.min(100, (totalSize / maxBytes) * 100) : 0,
      qualityBreakdown,
      breakdown: [
        {
          key: 'audio',
          count: audioCount,
          size: audioBytes,
          sizeFormatted: formatBytes(audioBytes),
          percent: pct(audioBytes)
        },
        {
          key: 'cover',
          count: coverCount,
          size: coverBytes,
          sizeFormatted: formatBytes(coverBytes),
          percent: pct(coverBytes)
        },
        {
          key: 'lyric',
          count: lyricCount,
          size: lyricBytes,
          sizeFormatted: formatBytes(lyricBytes),
          percent: pct(lyricBytes)
        }
      ]
    }
  }
}

// 单例实例
export const musicCacheService = new MusicCacheService()
