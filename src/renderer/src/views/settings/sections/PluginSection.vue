<template>
  <div id="plugin-settings" class="plugin-section">
    <KeepAlive>
      <component :is="tab === 'installed' ? Plugins : PluginRoutingPanel">
        <template #navigation>
          <t-tabs v-model="tab" class="plugin-view-tabs" size="large" aria-label="插件设置页面">
            <t-tab-panel value="installed" label="插件管理" />
            <t-tab-panel value="routing" label="能力分配" />
          </t-tabs>
        </template>
      </component>
    </KeepAlive>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import Plugins from '@renderer/components/Settings/plugins.vue'
import PluginRoutingPanel from '@renderer/components/Settings/PluginRoutingPanel.vue'
const tab = ref('installed')
</script>
<style scoped>
.plugin-section {
  flex: 1;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.plugin-view-tabs {
  background: transparent;
}
.plugin-view-tabs :deep(.t-tabs__content) {
  display: none;
}
</style>
