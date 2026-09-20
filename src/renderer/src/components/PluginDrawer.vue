<template>
  <component
    :is="presentation?.kind === 'modal' ? TDialog : TDrawer"
    :visible="!!session"
    :header="visibleSession ? visibleSession.title : schemaSession?.schema.root.title"
    :placement="presentation?.kind === 'modal' ? 'center' : presentation?.placement || 'right'"
    :size="size"
    :width="size"
    dialog-class-name="plugin-native-modal"
    :z-index="1600"
    :close-on-overlay-click="true"
    :close-btn="true"
    :destroy-on-close="true"
    :footer="visibleSession ? false : undefined"
    :drawer-class-name="
      session?.kind === 'web' ? 'plugin-native-drawer plugin-web-drawer' : 'plugin-native-drawer'
    "
    :style="
      presentation?.kind === 'modal'
        ? { '--plugin-content-height': `${contentHeight}px` }
        : { top: `${topInset}px`, height: `calc(100% - ${topInset}px)` }
    "
    attach="body"
    @close="$emit('close')"
  >
    <PluginWebSurface
      v-if="session?.kind === 'web'"
      :key="session.sessionId"
      :session="session"
      @resize="contentHeight = $event"
    />
    <PluginNativeSurface
      v-else-if="session?.kind === 'native'"
      :key="session.sessionId"
      :session="session"
    />
    <form
      v-else-if="schemaSession"
      :id="formId"
      class="plugin-drawer-form"
      @submit.prevent="run(-1)"
    >
      <template v-for="(field, index) in schemaSession.schema.root.children" :key="index">
        <p v-if="field.type === 'text'" class="plugin-drawer-status" role="status">
          {{ schemaSession.state[field.bind] ?? '' }}
        </p>
        <template v-else-if="field.type !== 'button'">
          <label v-if="field.type === 'toggle'" class="plugin-drawer-toggle">
            <TSwitch v-model="draft[field.bind]" :disabled="busy" :aria-label="field.label" />
            <span
              >{{ field.label
              }}<small v-if="field.description">{{ field.description }}</small></span
            >
          </label>
          <label v-else class="plugin-drawer-field">
            <span
              >{{ field.label
              }}<span v-if="field.required" class="plugin-drawer-required" aria-hidden="true">
                *</span
              ></span
            >
            <TSelect
              v-if="field.type === 'select'"
              v-model="draft[field.bind]"
              :options="field.options"
              :disabled="busy"
              :aria-label="field.label"
            />
            <TInputNumber
              v-else-if="field.type === 'number'"
              v-model="draft[field.bind]"
              :disabled="busy"
              :aria-label="field.label"
            />
            <TInput
              v-else
              v-model="draft[field.bind]"
              :type="field.type === 'password' ? 'password' : 'text'"
              :placeholder="field.placeholder"
              :disabled="busy"
              :name="field.bind"
              :autocomplete="field.type === 'password' ? 'current-password' : 'off'"
            />
            <small v-if="field.description">{{ field.description }}</small>
          </label>
        </template>
      </template>
      <TAlert v-if="error" theme="error" :message="error" role="alert" />
    </form>
    <template v-if="schemaSession" #footer>
      <div v-if="schemaSession" class="plugin-drawer-actions">
        <TButton theme="primary" type="submit" :form="formId" :loading="busy" :disabled="busy">
          {{ schemaSession.schema.root.submitLabel || '保存' }}
        </TButton>
        <template v-for="(field, index) in schemaSession.schema.root.children" :key="index">
          <TButton
            v-if="field.type === 'button'"
            variant="outline"
            :disabled="busy || (!!field.requires && !schemaSession.state[field.requires])"
            @click="run(index)"
            >{{ field.label }}</TButton
          >
        </template>
      </div>
    </template>
  </component>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Drawer as TDrawer,
  Dialog as TDialog,
  Input as TInput,
  InputNumber as TInputNumber,
  Select as TSelect,
  Switch as TSwitch,
  Button as TButton,
  Alert as TAlert
} from 'tdesign-vue-next'
import type { PluginDrawerSession } from '@common/pluginDrawer'
import PluginWebSurface from './PluginWebSurface.vue'
import PluginNativeSurface from './PluginNativeSurface.vue'

const props = defineProps<{ session: PluginDrawerSession | null }>()
const visibleSession = computed(() =>
  props.session?.kind === 'web' || props.session?.kind === 'native' ? props.session : null
)
const schemaSession = computed(() =>
  props.session && props.session.kind !== 'web' && props.session.kind !== 'native'
    ? props.session
    : null
)
const emit = defineEmits<{
  close: []
  state: [sessionId: string, state: PluginDrawerSession['state']]
}>()
const draft = ref<Record<string, any>>({})
const busy = ref(false)
const error = ref('')
const topInset = ref(0)
const contentHeight = ref(360)
let observedTitlebars: Element[] = []
let resizeObserver: ResizeObserver | undefined
let treeObserver: MutationObserver | undefined
function measureTitlebars() {
  topInset.value = Math.max(
    0,
    ...observedTitlebars.map((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.width && bounds.height ? Math.ceil(bounds.bottom) : 0
    })
  )
}
function observeTitlebars() {
  const elements = [...document.querySelectorAll('[data-app-titlebar]')]
  if (
    elements.length !== observedTitlebars.length ||
    elements.some((element, index) => element !== observedTitlebars[index])
  ) {
    resizeObserver?.disconnect()
    observedTitlebars = elements
    for (const element of elements) resizeObserver?.observe(element)
  }
  measureTitlebars()
}
onMounted(() => {
  resizeObserver = new ResizeObserver(measureTitlebars)
  treeObserver = new MutationObserver(observeTitlebars)
  treeObserver.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', measureTitlebars)
  observeTitlebars()
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  treeObserver?.disconnect()
  window.removeEventListener('resize', measureTitlebars)
})
const formId = computed(() => 'plugin-drawer-' + (props.session?.sessionId || 'closed'))
const presentation = computed(
  () => visibleSession.value?.presentation || schemaSession.value?.schema.presentation
)
const size = computed(() => {
  const value = presentation.value
  const horizontal = !value?.placement || ['left', 'right'].includes(value.placement)
  return `min(${value?.size || (horizontal ? 480 : 560)}px, ${horizontal ? '100vw' : `calc(100vh - ${topInset.value}px)`})`
})
function resetDraft() {
  if (!schemaSession.value) return
  const next: Record<string, any> = {}
  for (const field of schemaSession.value.schema.root.children) {
    if (field.type === 'button' || field.type === 'text') continue
    next[field.bind] =
      field.type === 'password'
        ? ''
        : (props.session?.state[field.bind] ??
          (field.type === 'toggle' ? false : field.type === 'number' ? 0 : ''))
  }
  draft.value = next
}
watch(
  () => props.session?.sessionId,
  () => {
    resetDraft()
    error.value = ''
    busy.value = false
    contentHeight.value = 360
  },
  { immediate: true }
)

async function run(index: number) {
  const session = schemaSession.value
  if (!session || busy.value) return
  busy.value = true
  error.value = ''
  const values = { ...draft.value }
  for (const field of session.schema.root.children) {
    if (field.type === 'password') draft.value[field.bind] = ''
  }
  try {
    const state = await window.api.plugins.drawerAction(
      session.pluginId,
      session.surfaceId,
      session.sessionId,
      index,
      values
    )
    if (props.session?.sessionId !== session.sessionId) return
    emit('state', session.sessionId, state)
    // The parent applies the returned state synchronously; preserve edits on failed requests.
    await nextTick()
    resetDraft()
  } catch (failure: any) {
    if (props.session?.sessionId === session.sessionId)
      error.value = failure.message || '操作失败，请重试'
  } finally {
    for (const field of session.schema.root.children) {
      if (field.type === 'password') delete values[field.bind]
    }
    if (props.session?.sessionId === session.sessionId) busy.value = false
  }
}
</script>

<style scoped>
:global(.plugin-native-drawer),
:global(.plugin-native-drawer *) {
  -webkit-app-region: no-drag;
}
:global(.plugin-native-modal .t-dialog__body) {
  height: min(var(--plugin-content-height, 360px), calc(100dvh - 160px));
  padding: 0;
  overflow: hidden;
}
:global(.plugin-native-modal) {
  max-width: calc(100vw - 32px);
  -webkit-app-region: no-drag;
}
:global(.plugin-web-drawer .t-drawer__body) {
  padding: 0;
  overflow: hidden;
}
.plugin-drawer-form {
  display: grid;
  gap: 22px;
  min-width: 0;
}
.plugin-drawer-status {
  margin: 0;
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
}
.plugin-drawer-field {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.plugin-drawer-toggle {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.plugin-drawer-toggle > span {
  flex: 1;
  min-width: 0;
}
.plugin-drawer-form small {
  display: block;
  margin-top: 4px;
  line-height: 1.5;
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
}
.plugin-drawer-required {
  color: var(--td-error-color);
}
.plugin-drawer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
