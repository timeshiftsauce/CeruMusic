<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

type Platform = 'netease' | 'qq' | 'kugou' | 'kuwo'
type RemotePlaylist = { id: string; name: string; cover?: string; count?: number }
const accounts = ref<Record<Platform, boolean>>({ netease: false, qq: false, kugou: false, kuwo: false })
const loading = ref<Platform | null>(null)
const syncing = ref<Platform | null>(null)
const pickerPlatform = ref<Platform | null>(null)
const kuwoLoginOpen = ref(false)
const kuwoUsername = ref('')
const kuwoPassword = ref('')
const remotePlaylists = ref<RemotePlaylist[]>([])
const selectedIds = ref<string[]>([])
const selectAll = ref(false)
let stopListening: (() => void) | undefined

const refresh = async () => {
  accounts.value = await window.api.platformAccounts.status()
}

const signIn = async (platform: Platform) => {
  if (platform === 'kuwo') {
    kuwoLoginOpen.value = true
    return
  }
  loading.value = platform
  try {
    await window.api.platformAccounts.openLogin(platform)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '无法打开平台登录窗口')
  } finally {
    loading.value = null
  }
}

const submitKuwoLogin = async () => {
  if (!kuwoUsername.value.trim() || !kuwoPassword.value) {
    MessagePlugin.warning('请输入酷我账号和密码')
    return
  }
  loading.value = 'kuwo'
  try {
    await window.api.platformAccounts.kuwoLogin(kuwoUsername.value.trim(), kuwoPassword.value)
    accounts.value.kuwo = true
    kuwoLoginOpen.value = false
    kuwoPassword.value = ''
    MessagePlugin.success('酷我音乐登录成功')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '酷我音乐登录失败')
  } finally {
    loading.value = null
  }
}

const signOut = async (platform: Platform) => {
  try {
    await window.api.platformAccounts.logout(platform)
    accounts.value[platform] = false
    MessagePlugin.success('已退出平台账号')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '退出登录失败')
  }
}

const syncPlaylists = async (platform: Platform) => {
  if (syncing.value) return
  syncing.value = platform
  try {
    const result = await window.api.platformAccounts.syncPlaylists(platform)
    if (!Array.isArray(result)) throw new Error('读取平台歌单失败，请重试')
    remotePlaylists.value = result
    selectedIds.value = result.map((item) => item.id)
    selectAll.value = result.length > 0
    pickerPlatform.value = platform
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '读取平台歌单失败')
  } finally {
    syncing.value = null
  }
}

const importSelected = async () => {
  const platform = pickerPlatform.value
  if (!platform || !selectedIds.value.length || syncing.value) return
  syncing.value = platform
  try {
    // Vue refs expose arrays as proxies; Electron IPC structured cloning can reject the proxy.
    // Send a fresh plain array across the preload boundary.
    const idsToImport = Array.from(selectedIds.value, (id) => String(id))
    const result = await window.api.platformAccounts.syncPlaylists(platform, idsToImport)
    if (Array.isArray(result)) throw new Error('同步歌单失败')
    pickerPlatform.value = null
    const changes = [
      result.added > 0 ? `新增 ${result.added} 个` : '',
      result.updated > 0 ? `更新 ${result.updated} 个` : ''
    ].filter(Boolean)
    MessagePlugin.success(`歌单同步完成：${changes.join('，')}`)
  } catch (error) {
    console.error('[platform-accounts] selected playlist import failed', {
      platform,
      selectedCount: selectedIds.value.length,
      error: error instanceof Error ? error.message : String(error)
    })
    MessagePlugin.error(error instanceof Error ? error.message : '同步平台歌单失败')
  } finally {
    syncing.value = null
  }
}

const toggleSelectAll = () => {
  selectedIds.value = selectAll.value ? remotePlaylists.value.map((item) => item.id) : []
}

watch(selectedIds, (ids) => {
  selectAll.value = remotePlaylists.value.length > 0 && ids.length === remotePlaylists.value.length
})

onMounted(() => {
  void refresh()
  stopListening = window.api.platformAccounts.onChanged(({ platform, loggedIn, syncError }) => {
    accounts.value[platform] = loggedIn
    if (loggedIn && !syncError) MessagePlugin.success('扫码登录成功，请点击“同步歌单”选择导入')
    if (syncError) MessagePlugin.error(`登录成功，但歌单同步失败：${syncError}`)
  })
})

onBeforeUnmount(() => stopListening?.())
</script>

<template>
  <section class="platform-account-page">
    <header class="page-heading">
      <h1>平台</h1>
      <p>登录后点击“同步歌单”，选择要导入到“歌单”的列表。</p>
    </header>

    <div class="account-list">
      <article class="account-card">
        <div class="account-brand netease">网</div>
        <div class="account-copy">
          <h2>网易云音乐</h2>
          <p>{{ accounts.netease ? '已登录' : '使用网易云音乐 App 扫码登录' }}</p>
        </div>
        <div v-if="accounts.netease" class="account-actions">
          <t-button variant="outline" :loading="syncing === 'netease'" @click="syncPlaylists('netease')">同步歌单</t-button>
          <t-button variant="outline" theme="danger" @click="signOut('netease')">退出</t-button>
        </div>
        <t-button v-else theme="primary" :loading="loading === 'netease'" @click="signIn('netease')">
          扫码登录
        </t-button>
      </article>

      <article class="account-card">
        <div class="account-brand kugou">酷</div>
        <div class="account-copy">
          <h2>酷狗音乐</h2>
          <p>{{ accounts.kugou ? '已登录' : '使用酷狗音乐账号登录' }}</p>
        </div>
        <div v-if="accounts.kugou" class="account-actions">
          <t-button variant="outline" :loading="syncing === 'kugou'" @click="syncPlaylists('kugou')">同步歌单</t-button>
          <t-button variant="outline" theme="danger" @click="signOut('kugou')">退出</t-button>
        </div>
        <t-button v-else theme="primary" :loading="loading === 'kugou'" @click="signIn('kugou')">
          扫码登录
        </t-button>
      </article>

      <article class="account-card">
        <div class="account-brand kuwo">我</div>
        <div class="account-copy">
          <h2>酷我音乐</h2>
          <p>{{ accounts.kuwo ? '已登录' : '使用酷我音乐账号登录' }}</p>
        </div>
        <div v-if="accounts.kuwo" class="account-actions">
          <t-button variant="outline" :loading="syncing === 'kuwo'" @click="syncPlaylists('kuwo')">同步歌单</t-button>
          <t-button variant="outline" theme="danger" @click="signOut('kuwo')">退出</t-button>
        </div>
        <t-button v-else theme="primary" :loading="loading === 'kuwo'" @click="signIn('kuwo')">
          账号登录
        </t-button>
      </article>

      <article class="account-card">
        <div class="account-brand qq">Q</div>
        <div class="account-copy">
          <h2>QQ 音乐</h2>
          <p>{{ accounts.qq ? '已登录' : '使用 QQ 音乐 App 扫码登录' }}</p>
        </div>
        <div v-if="accounts.qq" class="account-actions">
          <t-button variant="outline" :loading="syncing === 'qq'" @click="syncPlaylists('qq')">同步歌单</t-button>
          <t-button variant="outline" theme="danger" @click="signOut('qq')">退出</t-button>
        </div>
        <t-button v-else theme="primary" :loading="loading === 'qq'" @click="signIn('qq')">
          扫码登录
        </t-button>
      </article>
    </div>

    <div v-if="kuwoLoginOpen" class="playlist-picker-mask" @click.self="kuwoLoginOpen = false">
      <section class="playlist-picker kuwo-login-dialog" role="dialog" aria-modal="true" aria-labelledby="kuwo-login-title">
        <header class="picker-heading">
          <div>
            <h2 id="kuwo-login-title">登录酷我音乐</h2>
            <p>使用酷我账号或绑定手机号登录</p>
          </div>
          <button class="picker-close" aria-label="关闭" @click="kuwoLoginOpen = false">×</button>
        </header>
        <form class="kuwo-login-form" @submit.prevent="submitKuwoLogin">
          <input v-model="kuwoUsername" autocomplete="username" placeholder="酷我账号 / 手机号" />
          <input v-model="kuwoPassword" autocomplete="current-password" type="password" placeholder="密码" />
          <p class="kuwo-login-note">使用酷我公开客户端登录接口。该旧接口使用 HTTP 传输，建议在可信网络登录。密码仅用于本次请求，不保存在澜音；登录票据会加密保存在本机。</p>
          <footer class="picker-footer">
            <span></span>
            <div>
              <t-button variant="text" @click="kuwoLoginOpen = false">取消</t-button>
              <t-button theme="primary" type="submit" :loading="loading === 'kuwo'">登录</t-button>
            </div>
          </footer>
        </form>
      </section>
    </div>

    <div v-if="pickerPlatform" class="playlist-picker-mask" @click.self="pickerPlatform = null">
      <section class="playlist-picker" role="dialog" aria-modal="true">
        <header class="picker-heading">
          <div>
            <h2>选择要导入的歌单</h2>
            <p>导入后，打开歌单会自动拉取并更新曲目。</p>
          </div>
          <button class="picker-close" aria-label="关闭" @click="pickerPlatform = null">×</button>
        </header>
        <label class="playlist-option select-all">
          <input v-model="selectAll" type="checkbox" @change="toggleSelectAll" />
          <span>全选</span>
          <small>{{ remotePlaylists.length }} 个歌单</small>
        </label>
        <div class="playlist-picker-list">
          <label v-for="playlist in remotePlaylists" :key="playlist.id" class="playlist-option">
            <input v-model="selectedIds" type="checkbox" :value="playlist.id" />
            <img v-if="playlist.cover" :src="playlist.cover" alt="" />
            <span class="playlist-option-name">{{ playlist.name }}</span>
            <small>{{ playlist.count ?? 0 }} 首</small>
          </label>
        </div>
        <footer class="picker-footer">
          <span>已选 {{ selectedIds.length }} 个</span>
          <div>
            <t-button variant="text" @click="pickerPlatform = null">取消</t-button>
            <t-button theme="primary" :disabled="!selectedIds.length" :loading="syncing === pickerPlatform" @click="importSelected">导入所选</t-button>
          </div>
        </footer>
      </section>
    </div>

    <p class="privacy-note">
      登录窗口直接连接对应平台。登录凭据加密保存在本机当前用户目录，不会发送到澜音服务器。
    </p>


  </section>
</template>

<style scoped lang="scss">
.platform-account-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 836px;
  margin: 0;
  padding: 36px 24px;
}

.page-heading {
  margin-bottom: 24px;

  h1 {
    margin: 0 0 8px;
    font-size: 25px;
    font-weight: 650;
  }

  p {
    margin: 0;
    color: var(--td-text-color-secondary);
  }
}

.account-list {
  display: grid;
  gap: 14px;
}

.kuwo-login-dialog {
  width: min(440px, 100%);
}

.kuwo-login-form {
  display: grid;
  gap: 14px;
  padding: 20px 24px 8px;

  > input {
    height: 42px;
    padding: 0 12px;
    border: 1px solid var(--td-component-border);
    border-radius: 8px;
    background: var(--td-bg-color-container);
    color: var(--td-text-color-primary);
  }
}

.kuwo-login-note {
  margin: 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.account-card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 92px;
  padding: 18px 20px;
  border: 1px solid var(--td-component-border);
  border-radius: 16px;
  background: var(--td-bg-color-container);
}

.account-brand {
  display: grid;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  font-size: 23px;
  font-weight: 700;

  &.netease {
    background: #d43c33;
  }

  &.qq {
    background: #25b754;
  }

  &.kugou {
    background: #ed5637;
  }

  &.kuwo {
    background: #ef6c31;
  }
}

.account-copy {
  flex: 1;
  min-width: 0;

  h2 {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--td-text-color-secondary);
    font-size: 13px;
  }
}

.account-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.privacy-note {
  margin: 18px 4px 0;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  line-height: 1.6;
}



.playlist-picker-mask {
  position: fixed;
  z-index: 3000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgb(0 0 0 / 48%);
}

.playlist-picker {
  display: flex;
  flex-direction: column;
  width: min(520px, 100%);
  max-height: min(680px, 90vh);
  padding: 20px;
  border: 1px solid var(--td-component-border);
  border-radius: 16px;
  background: var(--td-bg-color-container);
  box-shadow: 0 16px 48px rgb(0 0 0 / 24%);
}

.picker-heading,
.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.picker-heading { margin-bottom: 16px; }
.picker-heading h2 { margin: 0 0 6px; font-size: 18px; }
.picker-heading p { margin: 0; color: var(--td-text-color-secondary); font-size: 13px; }
.picker-footer { padding-top: 14px; color: var(--td-text-color-secondary); font-size: 13px; }
.picker-footer > div { display: flex; gap: 8px; }
.picker-close { border: 0; background: transparent; color: var(--td-text-color-secondary); font-size: 24px; cursor: pointer; }
.playlist-picker-list { overflow: auto; min-height: 120px; border-top: 1px solid var(--td-component-border); border-bottom: 1px solid var(--td-component-border); }
.playlist-option { display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 8px 4px; border-bottom: 1px solid var(--td-component-border); cursor: pointer; }
.playlist-option:last-child { border-bottom: 0; }
.playlist-option input { accent-color: var(--td-brand-color); }
.playlist-option img { width: 38px; height: 38px; border-radius: 6px; object-fit: cover; }
.playlist-option small { margin-left: auto; color: var(--td-text-color-placeholder); white-space: nowrap; }
.select-all { font-weight: 600; }
.playlist-option-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

</style>
