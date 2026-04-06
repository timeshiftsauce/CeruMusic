<template>
  <t-dialog
    :visible="visible"
    :close-btn="true"
    attach="body"
    :footer="false"
    width="700px"
    @close="$emit('update:visible', false)"
  >
    <template #header>
      <div class="import-header">
        <span>{{ pluginName }} - 导入歌单</span>
      </div>
    </template>
    <template #body>
      <div class="import-container">
        <!-- 加载中 -->
        <div v-if="loading" class="loading-state">
          <t-loading />
          <span>正在获取歌单列表...</span>
        </div>

        <!-- 错误 -->
        <div v-else-if="error" class="error-state">
          <p>{{ error }}</p>
          <t-button theme="default" size="small" @click="loadPlaylists">重试</t-button>
        </div>

        <!-- 歌单列表 -->
        <div v-else-if="playlists.length > 0" class="playlist-list">
          <div
            v-for="pl in playlists"
            :key="pl.id"
            class="playlist-item"
          >
            <div class="playlist-cover">
              <img v-if="pl.coverImg" :src="pl.coverImg" alt="cover" />
              <div v-else class="cover-placeholder">
                <t-icon name="queue-music" />
              </div>
            </div>
            <div class="playlist-info">
              <div class="playlist-name">{{ pl.name }}</div>
              <div class="playlist-meta">{{ pl.songCount }} 首歌曲</div>
              <div v-if="pl.description" class="playlist-desc">{{ pl.description }}</div>
            </div>
            <div class="playlist-action">
              <t-button
                theme="primary"
                size="small"
                :loading="importingId === pl.id"
                :disabled="!!importingId"
                @click="importPlaylist(pl)"
              >
                <template #icon><t-icon name="download" /></template>
                导入
              </t-button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="empty-state">
          <t-icon name="folder-open" style="font-size: 48px" />
          <p>没有找到歌单</p>
        </div>
      </div>
    </template>
  </t-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

interface ServicePlaylist {
  id: string
  name: string
  songCount: number
  coverImg?: string
  description?: string
}

const props = defineProps<{
  visible: boolean
  pluginId: string
  pluginName: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const playlists = ref<ServicePlaylist[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const importingId = ref<string | null>(null)

watch(
  () => props.visible,
  (val) => {
    if (val && props.pluginId) {
      loadPlaylists()
    }
  }
)

async function loadPlaylists() {
  loading.value = true
  error.value = null
  try {
    const result = await window.api.plugins.getPlaylists(props.pluginId)
    if (result?.error) {
      error.value = result.error
    } else {
      playlists.value = result?.data || []
    }
  } catch (e: any) {
    error.value = e.message || '获取歌单失败'
  } finally {
    loading.value = false
  }
}

async function importPlaylist(pl: ServicePlaylist) {
  importingId.value = pl.id
  try {
    const result = await window.api.plugins.importToLocal(props.pluginId, pl.id, pl.name)
    if (result?.error) {
      MessagePlugin.error(`导入失败: ${result.error}`)
    } else if (result?.success) {
      MessagePlugin.success(`成功导入 "${pl.name}"，共 ${result.data?.added || 0} 首歌曲`)
    }
  } catch (e: any) {
    MessagePlugin.error(`导入失败: ${e.message}`)
  } finally {
    importingId.value = null
  }
}
</script>

<style scoped lang="scss">
.import-container {
  max-height: 500px;
  overflow-y: auto;
  padding: 8px 0;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 12px;
  color: var(--plugins-text-secondary, #999);
}

.playlist-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.playlist-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--plugins-card-bg, rgba(255, 255, 255, 0.05));
  transition: background 0.2s;

  &:hover {
    background: var(--plugins-card-bg-hover, rgba(255, 255, 255, 0.08));
  }
}

.playlist-cover {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--plugins-border, rgba(255, 255, 255, 0.1));
    font-size: 24px;
    color: var(--plugins-text-muted, #666);
  }
}

.playlist-info {
  flex: 1;
  min-width: 0;
}

.playlist-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--plugins-text-primary, #fff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-meta {
  font-size: 12px;
  color: var(--plugins-text-muted, #999);
  margin-top: 2px;
}

.playlist-desc {
  font-size: 12px;
  color: var(--plugins-text-secondary, #888);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-action {
  flex-shrink: 0;
}
</style>
