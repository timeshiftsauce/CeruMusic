<script setup lang="ts">
import { ref } from 'vue'
import Versions from '@renderer/components/Versions.vue'
import { useAutoUpdate } from '@renderer/composables/useAutoUpdate'
import { useSettingsStore } from '@renderer/store/Settings'
import { storeToRefs } from 'pinia'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const autoUpdate = ref(settings.value.autoUpdate)
const updateAutoUpdate = () => {
  settingsStore.updateSettings({
    autoUpdate: autoUpdate.value
  })
}

const appVersion = ref('1.0.0')
const isCheckingUpdate = ref(false)
const { checkForUpdates } = useAutoUpdate()

const getAppVersion = async () => {
  try {
    const version = await window.api.appInfo.getVersion()
    if (version) {
      appVersion.value = version
    }
  } catch (error) {
    console.warn('Failed to get app version via IPC:', error)
  }
}

// 初始化时获取版本号
getAppVersion()

const handleCheckUpdate = async () => {
  isCheckingUpdate.value = true
  try {
    await checkForUpdates()
  } catch (error) {
    console.error('检查更新失败:', error)
  } finally {
    isCheckingUpdate.value = false
  }
}

const openLink = (url: string) => {
  window.open(url, '_blank')
}
</script>

<template>
  <div class="settings-section">
    <!-- 应用信息 -->
    <div class="setting-group">
      <div class="app-header">
        <div class="app-logo">
          <img src="/logo.svg" alt="Ceru Music" />
        </div>
        <div class="app-info">
          <div class="app-title-row">
            <h2>Cerulean Music</h2>
            <span class="app-version">v{{ appVersion }}</span>
          </div>
          <p class="app-subtitle">澜音 播放器</p>
          <p class="app-description">
            澜音是一个跨平台的音乐播放器应用，支持基于合规插件获取公开音乐信息与播放功能。
          </p>
        </div>
      </div>
    </div>

    <!-- 版本信息 -->
    <div id="about-version" class="setting-group">
      <h3>版本信息</h3>
      <div class="version-section">
        <Versions />
        <div class="update-actions">
          <div class="update-option">
            <t-switch v-model:value="autoUpdate" @change="updateAutoUpdate"></t-switch>
            <div>应用启动时检查更新</div>
          </div>
          <t-button theme="primary" :loading="isCheckingUpdate" @click="handleCheckUpdate">
            {{ isCheckingUpdate ? '检查中...' : '检查更新' }}
          </t-button>
        </div>
      </div>
    </div>

    <!-- 技术栈 -->
    <div id="about-tech" class="setting-group">
      <h3>技术栈&服务&友商</h3>
      <div class="tech-stack">
        <div class="tech-item">
          <span class="tech-name">Electron</span>
          <span class="tech-desc">跨平台桌面应用框架</span>
        </div>
        <div class="tech-item">
          <span class="tech-name">Vue 3</span>
          <span class="tech-desc">响应式前端框架</span>
        </div>
        <div class="tech-item">
          <span class="tech-name">TypeScript</span>
          <span class="tech-desc">类型安全的 JavaScript</span>
        </div>
        <div class="tech-item">
          <span class="tech-name">Pinia</span>
          <span class="tech-desc">Vue 状态管理工具</span>
        </div>
        <div class="tech-item">
          <span class="tech-name">Vite</span>
          <span class="tech-desc">快速前端构建工具</span>
        </div>
        <div
          class="tech-item link"
          style="cursor: pointer"
          @click="openLink('https://github.com/Steve-xmh/applemusic-like-lyrics')"
        >
          <span class="tech-name">AMLL</span>
          <span class="tech-desc"> 歌词组件 </span>
        </div>
        <div
          class="tech-item link"
          style="cursor: pointer"
          @click="openLink('https://sadidc.com/aff/VQAXGBZT')"
        >
          <span class="tech-name">伤心的云</span>
          <span class="tech-desc"
            >🔗 强烈推荐 服务器低至一元 1000mbps超高带宽,16h16g 38.99元/月
          </span>
        </div>
        <div
          class="tech-item link"
          style="cursor: pointer"
          @click="openLink('https://www.rainyun.com/sqj_')"
        >
          <span class="tech-name">雨云</span>
          <span class="tech-desc">🔗 提供的性价比云服务支持，新人半价起，服务器低至7.5元</span>
        </div>
      </div>
    </div>

    <!-- 开发团队 -->
    <div id="about-team" class="setting-group">
      <h3>开发团队</h3>
      <div class="developer-list">
        <div class="developer-item link" @click="openLink('https://shiqianjiang.cn/')">
          <div class="developer-avatar">
            <img src="/head.jpg" alt="时迁酱" />
          </div>
          <div class="developer-info">
            <h4>时迁酱</h4>
            <p>产品总体设计与开发</p>
          </div>
        </div>
        <div class="developer-item link" @click="openLink('https://wldss.cn/')">
          <div class="developer-avatar">
            <img src="/wldss.png" alt="无聊的霜霜" />
          </div>
          <div class="developer-info">
            <h4>无聊的霜霜</h4>
            <p>首页设计 & AI助手</p>
          </div>
        </div>
        <div class="developer-item">
          <div class="developer-avatar">
            <img src="/star.png" alt="Star" />
          </div>
          <div class="developer-info">
            <h4>Star</h4>
            <p>插件管理相关功能 & 部分接口封装</p>
          </div>
        </div>
        <div class="developer-item">
          <div class="developer-avatar">
            <img src="/lemon.jpg" alt="lemon" />
          </div>
          <div class="developer-info">
            <h4>lemon</h4>
            <p>修复部分bug & 新增部分功能（简称：打杂）</p>
          </div>
        </div>
        <div class="developer-item link" @click="openLink('https://github.com/ITManCHINA/')">
          <div class="developer-avatar">
            <img src="/furina.jpg" alt="ITMan_CHINA" />
          </div>
          <div class="developer-info">
            <h4>ITMan_CHINA</h4>
            <p>神秘的AI驾驶员<br />开源社区街溜子<br />某不知名TTML歌词作者</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 法律声明 -->
    <div id="about-legal" class="setting-group">
      <h3>法律声明</h3>
      <div class="legal-notice">
        <div class="notice-item">
          <h4>🔒 数据与内容责任</h4>
          <p>
            本项目不直接获取、存储、传输任何音乐数据或版权内容，仅提供插件运行框架。
            用户通过插件获取的所有数据，其合法性由插件提供者及用户自行负责。
          </p>
        </div>
        <div class="notice-item">
          <h4>⚖️ 版权合规要求</h4>
          <p>
            用户承诺仅通过合规插件获取音乐相关信息，且获取、使用版权内容的行为符合
            《中华人民共和国著作权法》及相关法律法规，不侵犯任何第三方合法权益。
          </p>
        </div>
        <div class="notice-item">
          <h4>🚫 使用限制</h4>
          <p>
            本项目仅允许用于非商业、纯技术学习目的，禁止用于任何商业运营、盈利活动，
            禁止修改后用于侵犯第三方权益的场景。
          </p>
        </div>
      </div>
      <h3 style="margin-top: 2rem">关于我们</h3>
      <div class="legal-notice">
        <div class="notice-item">
          <h4>😊 时迁酱</h4>
          <p>
            你好呀好呀～我是 (时迁酱)
            <br />
            一枚普普通通的高中生，因为好奇+喜欢，悄悄自学了一点编程✨！
            <br />
            <br />
            没想到今天你能用上我做的软件——「澜音」，它其实是我学 Electron 时孵出来的小demo！
            <br />
            看到它真的能运行、还有人愿意用，我真的超级开心＋骄傲的！💖
            <br />
            <br />
            当然啦，平时还是要乖乖写作业上课哒～但我还是会继续挤出时间，让澜音慢慢长大，越走越远哒！💪
            <br />
            <br />
            如果你也喜欢它，或者想给我加点零食鼓励🧋，欢迎打赏赞助哟～谢谢可爱的你！！
            <img
              src="https://oss.shiqianjiang.cn/storage/default/20250907/image-2025082711173bb1bba3608ef15d0e1fb485f80f29c728186.png"
              alt="赞赏"
              style="width: 100%; padding: 20px 30%"
            />
            什么你也想学习编程？我教你吖！QQ:2115295703
          </p>
          <br />
          <h4>...待补充</h4>
        </div>
      </div>
    </div>

    <!-- 联系方式 -->
    <div class="setting-group">
      <h3>联系方式</h3>
      <div class="contact-info">
        <p>如有技术问题或合作意向（仅限技术交流），请通过以下方式联系：</p>
        <div class="contact-actions">
          <t-button theme="primary" @click="openLink('https://qm.qq.com/q/8c25dPfylG')">
            官方QQ群(1057783951)
          </t-button>
          <t-button
            theme="primary"
            variant="outline"
            @click="openLink('https://ceru.docs.shiqianjiang.cn/')"
          >
            官方网站
          </t-button>
          <t-button
            theme="default"
            @click="openLink('https://github.com/timeshiftsauce/CeruMusic/issues')"
          >
            问题反馈
          </t-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-section {
  animation: fadeInUp 0.4s ease-out;
  animation-fill-mode: both;
}

.setting-group {
  background: var(--settings-group-bg);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--settings-group-border);
  box-shadow: 0 1px 3px var(--settings-group-shadow);
  animation: fadeInUp 0.4s ease-out;
  animation-fill-mode: both;

  @for $i from 1 through 5 {
    &:nth-child(#{$i}) {
      animation-delay: #{$i * 0.1}s;
    }
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--settings-text-primary);
  }

  > p {
    margin: 0 0 1.5rem;
    color: var(--settings-text-secondary);
    font-size: 0.875rem;
  }
}

// 关于页面样式
.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 0;

  .app-logo {
    width: 4rem;
    height: 4rem;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  .app-info {
    flex: 1;

    .app-title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.25rem;

      h2 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--settings-text-primary);
      }

      .app-version {
        background: var(--td-brand-color-1);
        color: var(--td-brand-color-6);
        padding: 0.25rem 0.75rem;
        border-radius: 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        border: 1px solid var(--td-brand-color-3);
      }
    }

    .app-subtitle {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      color: var(--td-brand-color-5);
    }

    .app-description {
      margin: 0;
      color: var(--settings-text-secondary);
      line-height: 1.5;
    }
  }
}

.tech-stack {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 0.75rem;

  .tech-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--settings-tech-item-bg);
    border-radius: 0.5rem;
    border: 1px solid var(--settings-tech-item-border);
    transition: 0.3s;
    gap: 1rem;

    .tech-name {
      font-weight: 600;
      flex-shrink: 0;
      color: var(--settings-text-primary);
    }

    .tech-desc {
      font-size: 0.875rem;
      color: var(--settings-text-secondary);
    }

    &.link:hover {
      background-color: var(--td-brand-color-1);
      border: 1px solid var(--td-brand-color-5);
    }

    &.link:active {
      transform: scale(0.9);
    }
  }
}

.developer-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  cursor: pointer;

  .developer-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--settings-developer-item-bg);
    border-radius: 0.75rem;
    border: 1px solid var(--settings-developer-item-border);
    transition: all 0.2s ease;

    &:hover {
      box-shadow: 0 4px 6px -1px var(--settings-group-shadow);
    }
    &.link:hover {
      background-color: var(--td-brand-color-1);
      border: 1px solid var(--td-brand-color-5);
    }
    .developer-avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .developer-info {
      flex: 1;

      h4 {
        margin: 0 0 0.25rem;
        font-size: 1rem;
        font-weight: 600;
        color: var(--settings-text-primary);
      }

      p {
        margin: 0;
        font-size: 0.875rem;
        color: var(--settings-text-secondary);
      }
    }
  }
}

.legal-notice {
  .notice-item {
    margin-bottom: 1.5rem;

    &:last-child {
      margin-bottom: 0;
    }

    h4 {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--settings-text-primary);
    }

    p {
      margin: 0;
      font-size: 0.875rem;
      color: var(--settings-text-secondary);
      line-height: 1.5;
    }
  }
}

// 版本信息样式
.version-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: relative;

  .update-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .update-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  }
}

.contact-info {
  p {
    margin: 0 0 1rem;
    color: #64748b;
    line-height: 1.5;
  }

  .contact-actions {
    display: flex;
    gap: 0.75rem;
  }
}

@media (max-width: 768px) {
  .app-header {
    flex-direction: column;
    text-align: center;
    gap: 1rem;
  }

  .tech-stack {
    grid-template-columns: 1fr;
  }

  .developer-list {
    grid-template-columns: 1fr;
  }

  .contact-actions {
    flex-direction: column;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
