<script setup lang="ts">
import { MessagePlugin } from '@renderer/plugin/notifications'
import { activeSkin, activeValues, editSkinSetting } from '@renderer/plugin/regions'
import { acceptsSkinValue, type SkinField, type SkinScalar } from '@common/pluginSkin'

async function save(field:SkinField, event?:Event) {
  const skin = activeSkin.value
  if (!skin) return
  const element = event?.target as HTMLInputElement | HTMLSelectElement | undefined
  let value:SkinScalar | null = null
  try {
    if (element) {
      if (field.options) value = field.options[Number(element.value)]
      else if (field.kind === 'boolean') value = (element as HTMLInputElement).checked
      else if (field.kind === 'number' || field.kind === 'integer') value = (element as HTMLInputElement).valueAsNumber
      else value = element.value
      if (!acceptsSkinValue(field,value)) throw Error('设置值不符合皮肤声明')
    }
    await editSkinSetting({pluginId:skin.pluginId,skinId:skin.skinId,key:field.key,value})
  } catch (error) {
    const previous = activeValues.value[field.key]
    if (element) {
      if (field.options) element.value = String(field.options.indexOf(previous))
      else if (field.kind === 'boolean') (element as HTMLInputElement).checked = previous === true
      else element.value = String(previous ?? '')
    }
    MessagePlugin.error(error instanceof Error ? error.message : '无法保存皮肤设置')
  }
}
</script>
<template>
  <Transition name="settings-reveal" mode="out-in" @before-leave="($event as HTMLElement).inert = true" @before-enter="($event as HTMLElement).inert = false">
  <div v-if="activeSkin?.fields.length" :key="JSON.stringify([activeSkin.pluginId,activeSkin.skinId])" class="skin-settings-reveal">
  <fieldset class="skin-settings">
    <legend>{{ activeSkin.title }}设置</legend>
    <div v-for="(field,index) in activeSkin.fields as SkinField[]" :key="field.key" class="skin-setting">
      <label :for="'skin-setting-' + index">{{ field.title }}</label>
      <select v-if="field.options" :id="'skin-setting-' + index" :value="field.options.indexOf(activeValues[field.key])" @change="save(field,$event)">
        <option value="-1" disabled>未设置</option>
        <option v-for="(option,optionIndex) in field.options" :key="optionIndex" :value="optionIndex">{{ option }}</option>
      </select>
      <input v-else-if="field.kind === 'boolean'" :id="'skin-setting-' + index" type="checkbox" :checked="activeValues[field.key] === true" @change="save(field,$event)" />
      <input v-else :id="'skin-setting-' + index" :type="field.kind === 'color' ? 'color' : field.kind === 'string' ? 'text' : 'number'" :value="activeValues[field.key] ?? ''" :min="field.minimum" :max="field.maximum" :minlength="field.minLength" :maxlength="field.maxLength ?? 1024" :step="field.kind === 'integer' ? 1 : 'any'" @change="save(field,$event)" />
      <button type="button" :aria-label="'重置' + field.title" :title="'重置' + field.title" @click="save(field)"><t-icon name="rollback" /></button>
    </div>
  </fieldset>
  </div>
  </Transition>
</template>
<style scoped>
.skin-settings-reveal { display: flow-root }
.skin-settings { min-width: 0; margin: 16px 0 0; padding: 0; border: 0 }
legend { padding: 0; font-weight: 600 }
.skin-setting { display: grid; grid-template-columns: minmax(0,1fr) minmax(64px,40%) 28px; align-items: center; gap: 8px; margin-block: 8px }
label { overflow-wrap: anywhere }
input, select { min-width: 0; max-width: 100%; font: inherit; accent-color: var(--td-brand-color) }
input[type=checkbox], input[type=color] { justify-self: end; margin: 0; cursor: pointer }
input[type=checkbox] { appearance: none; box-sizing: border-box; width: 34px; height: 20px; padding: 2px; border: 1px solid #717977; border-radius: 12px; background: #414746; }
input[type=checkbox]::before { content: ''; display: block; width: 14px; height: 14px; border-radius: 50%; background: #eef3f1; }
input[type=checkbox]:checked { background: #a5d7c3; border-color: #a5d7c3; }
input[type=checkbox]:checked::before { transform: translateX(14px); background: #22372d; }
input[type=color] { box-sizing: border-box; width: 34px; height: 24px; padding: 2px; background: transparent; border: 1px solid #727a77; border-radius: 5px; }
input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
input[type=color]::-webkit-color-swatch { border: 0; border-radius: 3px; }
input:focus-visible, select:focus-visible, button:focus-visible { outline: 2px solid #c4e8dc; outline-offset: 2px; }
button { display: grid; place-items: center; height: 28px; border: 0; border-radius: 5px; background: transparent; color: #bdc7c2; cursor: pointer }
button:hover { background: #414746; color: white; }
</style>
