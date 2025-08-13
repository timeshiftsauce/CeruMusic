# Ceru Music 产品设计文档

## 项目概述

Ceru Music 是一个基于 Electron + Vue 3 的跨平台桌面音乐播放器，支持多音乐平台数据源，提供流畅的音乐播放体验。

## 项目架构

### 技术栈

- **前端框架**: Vue 3 + TypeScript + Composition API
- **桌面框架**: Electron (v37.2.3)
- **UI组件库**: TDesign Vue Next (v1.15.2)
- ![image-20250813180317221](D:\code\Ceru-Music\docs\assets\image-20250813180317221.png)
- **状态管理**: Pinia (v3.0.3)
- **路由管理**: Vue Router (v4.5.1)
- **构建工具**: Vite + electron-vite
- **包管理器**: PNPM
- **Node pnpm 版本**：

  ```bash
  PS D:\code\Ceru-Music> node -v
  v22.17.0
  PS D:\code\Ceru-Music> pnpm -v
  10.14.0
  ```

-

### 架构设计

```asp
Ceru Music
├── 主进程 (Main Process)
│   ├── 应用生命周期管理
│   ├── 窗口管理
│   ├── 系统集成 (托盘、快捷键)
│   └── 文件系统操作
├── 渲染进程 (Renderer Process)
│   ├── Vue 3 应用
│   ├── 用户界面
│   ├── 音乐播放控制
│   └── 数据展示
└── 预加载脚本 (Preload Script)
    └── 安全的 IPC 通信桥梁
```

### 目录结构

```
src/
├── main/                   # 主进程代码
│   ├── index.ts           # 主进程入口
│   ├── window.ts          # 窗口管理
│   └── services/          # 主进程服务
├── preload/               # 预加载脚本
│   └── index.ts          # IPC 通信接口
└── renderer/              # 渲染进程 (Vue 应用)
    ├── src/
    │   ├── components/    # Vue 组件
    │   ├── views/         # 页面视图
    │   ├── stores/        # Pinia 状态管理
    │   ├── services/      # API 服务
    │   ├── utils/         # 工具函数
    │   └── types/         # TypeScript 类型定义
    └── index.html         # 应用入口
```

## 项目开发使用方式

### 开发环境启动

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 代码检查
pnpm lint

# 类型检查
pnpm typecheck
```

### 构建打包

```bash
# 构建当前平台
pnpm build

# 构建 Windows 版本
pnpm build:win

# 构建 macOS 版本
pnpm build:mac

# 构建 Linux 版本
pnpm build:linux
```

## 音乐数据源接口设计

### 接口1: 网易云音乐原生接口 (主要数据源)

#### 获取音乐信息

- **请求地址**: `https://music.163.com/api/song/detail`
- **请求参数**: `ids=[ID1,ID2,ID3,...]` 音乐ID列表
- **示例**: `https://music.163.com/api/song/detail?ids=[36270426]`

#### 获取音乐直链

- **请求地址**: `https://music.163.com/song/media/outer/url`
- **请求参数**: `id=123` 音乐ID
- **示例**: `https://music.163.com/song/media/outer/url?id=36270426.mp3`

#### 获取歌词

- **请求地址**: `https://music.163.com/api/song/lyric`
- **请求参数**:
  - `id=123` 音乐ID
  - `lv=-1` 获取歌词
  - `yv=-1` 获取逐字歌词
  - `tv=-1` 获取歌词翻译
- **示例**: `https://music.163.com/api/song/lyric?id=36270426&lv=-1&yv=-1&tv=-1`

#### 搜索歌曲

- **请求地址**: `https://music.163.com/api/search/get/web`
- **请求参数**:
  - `s` 歌名
  - `type=1` 搜索类型
  - `offset=0` 偏移量
  - `limit=10` 搜索结果数量
- **示例**: `https://music.163.com/api/search/get/web?s=来自天堂的魔鬼&type=1&offset=0&limit=10`

### 接口2: Meting API (备用数据源)

#### 参数说明

- **server**: 数据源
  - `netease` 网易云音乐(默认)
  - `tencent` QQ音乐
- **type**: 类型
  - `name` 歌曲名
  - `artist` 歌手
  - `url` 链接
  - `pic` 封面
  - `lrc` 歌词
  - `song` 单曲
  - `playlist` 歌单
- **id**: 类型ID（封面ID/单曲ID/歌单ID）

#### 使用示例

```
https://api.qijieya.cn/meting/?type=url&id=1969519579
https://api.qijieya.cn/meting/?type=song&id=591321
https://api.qijieya.cn/meting/?type=playlist&id=2619366284
```

### 接口3: 备选接口

- **地址**: https://doc.vkeys.cn/api-doc/
- **说明**: 不建议使用，延迟较高

### 接口4: 自部署接口 (备用)

- **地址**: `https://music.shiqianjiang.cn?id=你是我的风景&server=netease`
- **说明**: 不支持分页，用于获取歌曲源、歌词源等
- **文档**: [API文档](./api.md)

## 核心功能设计

### 通用请求函数设计

```typescript
// 音乐服务接口定义
interface MusicService {
  search({keyword: string, page?: number, limit?: number}): Promise<SearchResult>
  getSongDetail({id: string)}: Promise<SongDetail>
  getSongUrl({id: string}): Promise<string>
  getLyric({id: string}): Promise<LyricData>
  getPlaylist({id: string}): Promise<PlaylistData>
}

// 通用请求函数
async function request(method: string, ...args: any{},isLoading=false): Promise<any> {
  try {
    switch (method) {
      case 'search':
        return await musicService.search(args)
      case 'getSongDetail':
        return await musicService.getSongDetail(args)
      case 'getSongUrl':
        return await musicService.getSongUrl(args)
      case 'getLyric':
        return await musicService.getLyric(args)
      default:
        throw new Error(`未知的方法: ${method}`)
    }
  } catch (error) {
    console.error(`请求失败: ${method}`, error)
    throw error
  }
}

// 使用示例
request('search', '周杰伦', 1, 20).then((result) => {
  console.log('搜索结果:', result)
})
```

### 状态管理设计 (Pinia + LocalStorage)

```typescript
// stores/music.ts
import { defineStore } from 'pinia'

export const useMusicStore = defineStore('music', {
  state: () => ({
    // 当前播放歌曲
    currentSong: null as Song | null,
    // 播放列表
    playlist: [] as Song[],
    // 播放状态
    isPlaying: false,
    // 播放模式 (顺序、随机、单曲循环)
    playMode: 'order' as 'order' | 'random' | 'repeat',
    // 音量
    volume: 0.8,
    // 播放进度
    currentTime: 0,
    duration: 0
  }),

  actions: {
    // 播放歌曲
    async playSong(song: Song) {
      this.currentSong = song
      this.isPlaying = true
      this.saveToStorage()
    },

    // 添加到播放列表
    addToPlaylist(songs: Song[]) {
      this.playlist.push(...songs)
      this.saveToStorage()
    },

    // 保存到本地存储
    saveToStorage() {
      localStorage.setItem(
        'music-state',
        JSON.stringify({
          currentSong: this.currentSong,
          playlist: this.playlist,
          playMode: this.playMode,
          volume: this.volume
        })
      )
    },

    // 从本地存储恢复
    loadFromStorage() {
      const saved = localStorage.getItem('music-state')
      if (saved) {
        const state = JSON.parse(saved)
        Object.assign(this, state)
      }
    }
  }
})
```

### 虚拟滚动列表设计

使用 TDesign 的虚拟滚动组件展示大量歌曲数据：

```vue
<template>
  <t-virtual-scroll :data="songList" :height="600" :item-height="60" :buffer="10">
    <template #default="{ data: song, index }">
      <div class="song-item" @click="playSong(song)">
        <div class="song-cover">
          <img :src="song.pic" :alt="song.name" />
        </div>
        <div class="song-info">
          <div class="song-name">{{ song.name }}</div>
          <div class="song-artist">{{ song.artist }}</div>
        </div>
        <div class="song-duration">{{ formatTime(song.duration) }}</div>
      </div>
    </template>
  </t-virtual-scroll>
</template>
```

### 本地数据存储设计

#### 播放列表存储

```typescript
// 方案1: LocalStorage (简单方案)
class PlaylistStorage {
  private key = 'ceru-playlists'

  save(playlists: Playlist[]) {
    localStorage.setItem(this.key, JSON.stringify(playlists))
  }

  load(): Playlist[] {
    const data = localStorage.getItem(this.key)
    return data ? JSON.parse(data) : []
  }
}

// 方案2: Node.js 文件存储 (最优方案，支持分享)
class FileStorage {
  private filePath = path.join(app.getPath('userData'), 'playlists.json')

  async save(playlists: Playlist[]) {
    await fs.writeFile(this.filePath, JSON.stringify(playlists, null, 2))
  }

  async load(): Promise<Playlist[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return []
    }
  }

  // 导出播放列表
  async export(playlist: Playlist, exportPath: string) {
    await fs.writeFile(exportPath, JSON.stringify(playlist, null, 2))
  }

  // 导入播放列表
  async import(importPath: string): Promise<Playlist> {
    const data = await fs.readFile(importPath, 'utf-8')
    return JSON.parse(data)
  }
}
```

## 用户体验设计

### 首次启动流程

```typescript
// stores/app.ts
export const useAppStore = defineStore('app', {
  state: () => ({
    isFirstLaunch: true,
    hasCompletedWelcome: false,
    userPreferences: {
      theme: 'auto' as 'light' | 'dark' | 'auto',
      language: 'zh-CN',
      defaultMusicSource: 'netease',
      autoPlay: false
    }
  }),

  actions: {
    checkFirstLaunch() {
      const hasLaunched = localStorage.getItem('has-launched')
      this.isFirstLaunch = !hasLaunched

      if (this.isFirstLaunch) {
        // 跳转到欢迎页面
        router.push('/welcome')
      } else {
        // 加载用户配置
        this.loadUserPreferences()
        router.push('/home')
      }
    },

    completeWelcome(preferences?: Partial<UserPreferences>) {
      if (preferences) {
        Object.assign(this.userPreferences, preferences)
      }

      this.hasCompletedWelcome = true
      localStorage.setItem('has-launched', 'true')
      localStorage.setItem('user-preferences', JSON.stringify(this.userPreferences))

      router.push('/home')
    }
  }
})
```

### 欢迎页面设计

![image-20250813180856660](D:\code\Ceru-Music\docs\assets\image-20250813180856660.png)

```vue
<template>
  <div class="welcome-container">
    <t-steps :current="currentStep" class="welcome-steps">
      <t-step title="欢迎使用" content="欢迎使用 Ceru Music" />
      <t-step title="基础设置" content="配置您的偏好设置" />
      <t-step title="完成设置" content="开始您的音乐之旅" />
    </t-steps>

    <transition name="slide" mode="out-in">
      <component :is="currentStepComponent" @next="nextStep" @skip="skipWelcome" />
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import WelcomeStep1 from './steps/WelcomeStep1.vue'
import WelcomeStep2 from './steps/WelcomeStep2.vue'
import WelcomeStep3 from './steps/WelcomeStep3.vue'

const currentStep = ref(0)
const steps = [WelcomeStep1, WelcomeStep2, WelcomeStep3]

const currentStepComponent = computed(() => steps[currentStep.value])

function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
  } else {
    completeWelcome()
  }
}

function skipWelcome() {
  appStore.completeWelcome()
}
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}
.slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
</style>
```

##### 界面UI参考

![image-20250813180944752](D:\code\Ceru-Music\docs\assets\image-20250813180944752.png)

## 页面动画设计

### 路由过渡动画

```vue
<template>
  <router-view v-slot="{ Component, route }">
    <transition :name="getTransitionName(route)" mode="out-in">
      <component :is="Component" :key="route.path" />
    </transition>
  </router-view>
</template>

<script setup lang="ts">
function getTransitionName(route: any) {
  // 根据路由层级决定动画方向
  const depth = route.path.split('/').length
  return depth > 2 ? 'slide-left' : 'slide-right'
}
</script>

<style>
/* 滑动动画 */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-100%);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-100%);
}
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

/* 淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
```

## 核心组件设计

### 音乐播放器组件

```vue
<template>
  <div class="music-player">
    <div class="player-info">
      <img :src="currentSong?.pic" class="song-cover" />
      <div class="song-details">
        <div class="song-name">{{ currentSong?.name }}</div>
        <div class="song-artist">{{ currentSong?.artist }}</div>
      </div>
    </div>

    <div class="player-controls">
      <t-button variant="text" @click="previousSong">
        <t-icon name="skip-previous" />
      </t-button>
      <t-button :variant="isPlaying ? 'filled' : 'outline'" @click="togglePlay">
        <t-icon :name="isPlaying ? 'pause' : 'play'" />
      </t-button>
      <t-button variant="text" @click="nextSong">
        <t-icon name="skip-next" />
      </t-button>
    </div>

    <div class="player-progress">
      <span class="time-current">{{ formatTime(currentTime) }}</span>
      <t-slider v-model="progress" :max="duration" @change="seekTo" class="progress-slider" />
      <span class="time-duration">{{ formatTime(duration) }}</span>
    </div>
  </div>
</template>
```

## 开发规范

### 代码规范

- 使用 TypeScript 进行类型检查
- 遵循 ESLint 配置的代码规范
- 使用 Prettier 进行代码格式化
- 组件命名使用 PascalCase
- 文件命名使用 kebab-case

### Git 提交规范

```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建过程或辅助工具的变动
```

### 性能优化

- 使用虚拟滚动处理大列表
- 图片懒加载
- 组件按需加载
- 音频预加载和缓存
- 防抖和节流优化用户交互

## 待补充功能

1. **歌词显示**: 滚动歌词、逐字高亮
2. **音效处理**: 均衡器、音效增强
3. **主题系统**: 多主题切换、自定义主题
4. **快捷键**: 全局快捷键支持
5. **系统集成**: 媒体键支持、系统通知
6. **云同步**: 播放列表云端同步
7. **插件系统**: 支持第三方插件扩展
8. **音乐推荐**: 基于听歌历史的智能推荐

---

_本设计文档将随着项目开发进度持续更新和完善。_
