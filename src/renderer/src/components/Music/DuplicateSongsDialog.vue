<template>
  <BaseDialog v-model:show="dialogVisible" title="查重清理" width="760px">
    <div class="dup-wrap">
      <div class="dup-summary">
        <div class="dup-summary-main">
          <strong>{{ duplicateGroups.length }}</strong>
          <span>组重复</span>
          <strong>{{ duplicateEntries.length }}</strong>
          <span>首待清理</span>
        </div>
        <t-button
          theme="danger"
          variant="outline"
          size="small"
          :disabled="duplicateEntries.length === 0 || removing"
          :loading="removing"
          @click="removeAllDuplicates"
        >
          一键清理
        </t-button>
      </div>

      <div v-if="duplicateGroups.length === 0" class="dup-empty">当前歌单没有检测到重复歌曲</div>

      <div v-else class="dup-list">
        <div v-for="group in duplicateGroups" :key="group.key" class="dup-group">
          <div class="dup-group-head">
            <div class="dup-group-title">{{ group.displayName }}</div>
            <div class="dup-group-meta">共 {{ group.items.length }} 首，保留第 1 首</div>
          </div>

          <div
            v-for="item in group.items"
            :key="item.uniqueKey"
            class="dup-item"
            :class="{ keeper: item.keep, duplicate: !item.keep }"
          >
            <div class="dup-item-main">
              <div class="dup-song-name">{{ item.song.name || '未知歌曲' }}</div>
              <div class="dup-song-meta">
                {{ item.song.singer || '未知歌手' }}
                <span v-if="item.song.albumName"> · {{ item.song.albumName }}</span>
                <span v-if="item.song.source"> · {{ item.song.source }}</span>
              </div>
            </div>
            <div class="dup-item-side">
              <span v-if="item.keep" class="dup-badge keep">保留</span>
              <t-button
                v-else
                theme="danger"
                variant="text"
                size="small"
                :disabled="removing"
                @click="removeOne(item)"
              >
                删除
              </t-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #action>
      <t-button theme="default" @click="dialogVisible = false">关闭</t-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseDialog from '@renderer/components/BaseDialog.vue'

type SongItem = {
  songmid: string | number
  source: string
  name: string
  singer: string
  albumName: string
}

type DuplicateItem = {
  uniqueKey: string
  keep: boolean
  song: SongItem
}

type DuplicateGroup = {
  key: string
  displayName: string
  items: DuplicateItem[]
}

const props = defineProps<{
  show: boolean
  songs: SongItem[]
  playlistTitle?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  remove: [payload: { songmid: string | number; source: string }]
  removeMany: [payload: { songmids: Array<string | number> }]
}>()

const removing = ref(false)

const dialogVisible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
})

const normalizeSongName = (name?: string) =>
  (name || '')
    .toLowerCase()
    .replace(/[\(\[（【].*?[\)\]）】]/g, '')
    .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
    .replace(/\s+/g, '')
    .trim()

const duplicateGroups = computed<DuplicateGroup[]>(() => {
  const bucket = new Map<string, DuplicateItem[]>()

  props.songs.forEach((song, index) => {
    const normalized = normalizeSongName(song.name)
    if (!normalized) return
    const uniqueKey = `${String(song.songmid)}::${song.source || ''}::${index}`
    const list = bucket.get(normalized) || []
    list.push({
      uniqueKey,
      keep: list.length === 0,
      song
    })
    bucket.set(normalized, list)
  })

  return [...bucket.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      displayName: items[0]?.song.name || key,
      items
    }))
})

const duplicateEntries = computed(() =>
  duplicateGroups.value.flatMap((group) => group.items.filter((item) => !item.keep))
)

const removeOne = async (item: DuplicateItem) => {
  removing.value = true
  try {
    emit('remove', { songmid: item.song.songmid, source: item.song.source })
  } finally {
    removing.value = false
  }
}

const removeAllDuplicates = async () => {
  const songmids = duplicateEntries.value.map((item) => item.song.songmid)
  if (songmids.length === 0) {
    return
  }

  removing.value = true
  try {
    emit('removeMany', { songmids })
  } finally {
    removing.value = false
  }
}
</script>

<style scoped lang="scss">
.dup-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 240px;
}

.dup-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--td-bg-color-container-hover);
  border: 1px solid var(--td-component-stroke);
}

.dup-summary-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--td-text-color-secondary);

  strong {
    color: var(--td-text-color-primary);
    font-size: 15px;
  }
}

.dup-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--td-text-color-secondary);
  border: 1px dashed var(--td-component-stroke);
  border-radius: 12px;
}

.dup-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dup-group {
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  overflow: hidden;
}

.dup-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--td-bg-color-page);
  border-bottom: 1px solid var(--td-component-stroke);
}

.dup-group-title {
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.dup-group-meta {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.dup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;

  & + .dup-item {
    border-top: 1px solid var(--td-component-stroke);
  }

  &.keeper {
    background: rgba(43, 164, 113, 0.08);
  }
}

.dup-item-main {
  min-width: 0;
}

.dup-song-name {
  color: var(--td-text-color-primary);
  font-weight: 500;
  word-break: break-word;
}

.dup-song-meta {
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  word-break: break-word;
}

.dup-item-side {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.dup-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;

  &.keep {
    background: rgba(43, 164, 113, 0.14);
    color: #2ba471;
  }
}

@media (max-width: 720px) {
  .dup-summary,
  .dup-group-head,
  .dup-item {
    align-items: flex-start;
    flex-direction: column;
  }

  .dup-item-side {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
