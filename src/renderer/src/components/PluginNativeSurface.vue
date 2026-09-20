<script setup lang="ts">
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import {
  assertNativeView,
  type NativeView,
  type NativeViewSection
} from '@shiqianjiang/ceru-plugin-sdk'
import type { PluginNativeSession } from '@common/pluginDrawer'
import PlaylistGrid from '@renderer/components/Music/PlaylistGrid.vue'
import { MoreIcon } from 'tdesign-icons-vue-next'
const props = defineProps<{ session: PluginNativeSession; embedded?: boolean }>()
// Views are replaced as immutable snapshots. Keep resource/action data cloneable for Electron IPC.
const view = shallowRef<NativeView>()
const loading = ref(false)
const busy = ref(false)
const error = ref('')
let disposed = false,
  generation = 0
let unsubscribe: (() => void) | undefined
const invoke = (action: string, input: any = {}) =>
  window.api.plugins.surfaceAction(
    props.session.pluginId,
    props.session.surfaceId,
    props.session.sessionId,
    action,
    input
  )
async function render() {
  const token = ++generation
  loading.value = true
  error.value = ''
  try {
    const result = await invoke(props.session.renderAction)
    assertNativeView(result)
    if (!disposed && token === generation) view.value = result
  } catch (reason: any) {
    if (!disposed && token === generation) error.value = reason.message || '加载失败'
  } finally {
    if (token === generation) loading.value = false
  }
}
async function run(action: string | undefined, input: any = {}) {
  if (!action || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await invoke(action, input)
    if (!disposed) await render()
  } catch (reason: any) {
    if (!disposed) error.value = reason.message || '操作失败'
  } finally {
    busy.value = false
  }
}
const cards = (section: NativeViewSection) =>
  section.items.map((item) => ({
    id: JSON.stringify(item.ref),
    title: item.title,
    cover: item.playlist?.artworkUrl || item.metadata?.artworkUrl,
    description: item.playlist?.description || item.subtitle,
    total: item.playlist?.trackCount
  }))
onMounted(async () => {
  unsubscribe = window.api.plugins.onSurfaceState((event) => {
    if (event.pluginId === props.session.pluginId && event.sessionId === props.session.sessionId) {
      if (event.closed) {
        disposed = true
        generation++
        view.value = undefined
        error.value = '插件页面已关闭'
      } else void render()
    }
  })
  try {
    await window.api.plugins.surfaceReady(
      props.session.pluginId,
      props.session.surfaceId,
      props.session.sessionId
    )
    if (!disposed) await render()
  } catch (reason: any) {
    error.value = reason.message
  }
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  unsubscribe?.()
})
</script>
<template>
  <div class="native-surface" :class="{ embedded }">
    <div v-if="view" class="native-heading">
      <div>
        <h3 v-if="view.title">{{ view.title }}</h3>
        <p v-if="view.description">{{ view.description }}</p>
      </div>
      <div class="native-actions">
        <t-button
          v-for="action in view.actions"
          :key="action.action + action.label"
          :theme="action.primary ? 'primary' : 'default'"
          :variant="action.primary ? 'base' : 'outline'"
          :disabled="busy"
          @click="run(action.action, action.input)"
          >{{ action.label }}</t-button
        >
      </div>
    </div>
    <t-alert v-if="error" theme="error" :message="error" class="native-error"
      ><template #operation
        ><t-button variant="text" :disabled="loading" @click="render">重试</t-button></template
      ></t-alert
    >
    <div v-if="loading && !view" class="native-loading"><t-loading text="正在加载…" /></div>
    <section v-for="section in view?.sections" :key="section.id" class="native-section">
      <h3 v-if="section.title">{{ section.title }}</h3>
      <PlaylistGrid
        v-if="section.layout === 'grid'"
        :items="cards(section)"
        :disabled="busy"
        @open="(index) => run(section.onOpen, { ref: section.items[index].ref })"
      >
        <template v-if="section.itemActions?.length" #actions="{ index }">
          <t-dropdown trigger="click">
            <t-button
              shape="circle"
              variant="outline"
              :disabled="busy"
              :aria-label="section.items[index].title + '的更多操作'"
              ><template #icon><MoreIcon /></template
            ></t-button>
            <t-dropdown-menu
              ><t-dropdown-item
                v-for="action in section.itemActions"
                :key="action.action + action.label"
                @click="
                  run(action.action, {
                    ...(typeof action.input === 'object' && !Array.isArray(action.input)
                      ? action.input
                      : {}),
                    ref: section.items[index].ref
                  })
                "
                >{{ action.label }}</t-dropdown-item
              ></t-dropdown-menu
            >
          </t-dropdown>
        </template>
      </PlaylistGrid>
      <div v-else class="native-tracks">
        <button
          v-for="(item, index) in section.items"
          :key="JSON.stringify(item.ref)"
          class="native-track"
          :disabled="busy"
          @click="
            run(section.onPlay || section.onOpen, {
              ref: item.ref,
              refs: section.items.slice(index).map((song) => song.ref)
            })
          "
        >
          <span class="track-index">{{ index + 1 }}</span
          ><span class="track-cover"><s-image :src="item.metadata?.artworkUrl || ''" /></span
          ><span class="track-name"
            ><strong>{{ item.title }}</strong
            ><small>{{ item.subtitle }}</small></span
          ><span class="track-album">{{ item.metadata?.album?.title }}</span
          ><span class="track-play">播放</span>
        </button>
      </div>
      <t-empty v-if="!section.items.length && !loading" description="暂无内容" />
    </section>
  </div>
</template>
<style scoped>
.native-surface {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 24px;
  color: var(--td-text-color-primary);
}
.native-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 4px 8px 20px 0;
}
.native-surface.embedded {
  height: auto;
  overflow: visible;
  padding-bottom: 0;
}
.native-heading h3,
.native-section h3 {
  font-size: 20px;
  line-height: 1.5;
  margin: 0 0 12px;
  font-weight: 650;
}
.native-heading p {
  color: var(--td-text-color-secondary);
  font-size: 13px;
  margin: 0;
}
.native-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.native-section {
  margin-bottom: 28px;
}
.native-error {
  margin-bottom: 16px;
}
.native-loading {
  display: grid;
  place-items: center;
  min-height: 180px;
}
.native-tracks {
  display: flex;
  flex-direction: column;
}
.native-track {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.native-track:hover {
  background: var(--td-bg-color-container-hover);
}
.native-track:focus-visible {
  outline: 2px solid var(--td-brand-color);
}
.track-index {
  width: 26px;
  color: var(--td-text-color-placeholder);
  text-align: center;
  font-size: 12px;
}
.track-cover {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
}
.track-name {
  flex: 1;
  min-width: 0;
}
.track-name strong,
.track-name small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-name strong {
  font-weight: 500;
  font-size: 14px;
}
.track-name small,
.track-album {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
.track-album {
  width: 24%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-play {
  font-size: 12px;
  color: var(--td-brand-color);
  padding: 0 12px;
}
@media (max-width: 600px) {
  .native-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .track-album {
    display: none;
  }
}
</style>
