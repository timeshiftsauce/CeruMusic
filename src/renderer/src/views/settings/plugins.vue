<template>
  <TitleBarControls title="插件管理" :show-back="true" class="header"></TitleBarControls>
  <div class="plugins-container">
    <h2>插件管理</h2>

    <div class="plugin-actions">
      <button class="btn-primary" @click="openPluginFile">
        <i class="iconfont icon-add"></i> 添加插件
      </button>
      <button class="btn-secondary" @click="refreshPlugins">
        <i class="iconfont icon-refresh"></i> 刷新
      </button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="plugins.length === 0" class="empty-state">
      <i class="iconfont icon-plugin" style="font-size: 48px"></i>
      <p>暂无已安装的插件</p>
      <p class="hint">点击"添加插件"按钮来安装新插件</p>
    </div>

    <div v-else class="plugin-list">
      <div v-for="plugin in plugins" :key="plugin.name" class="plugin-item">
        <div class="plugin-info">
          <h3>
            {{ plugin.name }} <span class="version">v{{ plugin.version }}</span>
          </h3>
          <p class="author">作者: {{ plugin.author }}</p>
          <p class="description">{{ plugin.description || '无描述' }}</p>
        </div>
        <div class="plugin-actions">
          <button class="btn-danger" @click="uninstallPlugin(plugin.name)">
            <i class="iconfont icon-delete"></i> 卸载
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import { ref, onMounted } from 'vue'

interface Plugin {
  name: string
  version: string
  author: string
  description?: string
}

const plugins = ref<Plugin[]>([])
const loading = ref(true)

// 获取已安装的插件列表
async function getPlugins() {
  loading.value = true
  try {
    const result = await window.api.plugins.getPlugins()
    plugins.value = result
    console.log('插件列表加载完成')
  } catch (error) {
    console.error('获取插件列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 打开文件选择器安装插件
async function openPluginFile() {
  try {
    const result = await window.api.plugins.openPluginFile()
    if (result.success) {
      await getPlugins()
    } else {
      console.error('安装插件失败:', result.message)
    }
  } catch (error) {
    console.error('安装插件失败:', error)
  }
}

// 卸载插件
async function uninstallPlugin(pluginName: string) {
  if (!confirm(`确定要卸载插件 "${pluginName}" 吗？`)) {
    return
  }

  try {
    const result = await window.api.plugins.uninstall(pluginName)
    if (result.success) {
      await getPlugins()
    } else {
      console.error('卸载插件失败:', result.message)
    }
  } catch (error) {
    console.error('卸载插件失败:', error)
  }
}

// 刷新插件列表
async function refreshPlugins() {
  await getPlugins()
}

onMounted(async () => {
  await getPlugins()
})
</script>

<style scoped>
.header {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  background-color: #fff;
  padding: 1.5rem;
  position: sticky;
  z-index: 1000;
  top: 0;
  left: 0;
  right: 0;
}

.plugins-container {
  padding: 20px;
}

.plugin-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}

.btn-primary {
  background-color: var(--color-primary, #007bff);
  color: white;
}

.btn-secondary {
  background-color: var(--color-secondary, #6c757d);
  color: white;
}

.btn-danger {
  background-color: var(--color-danger, #dc3545);
  color: white;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: var(--color-primary, #007bff);
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 10px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #666;
}

.hint {
  font-size: 0.9em;
  color: #999;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.plugin-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-radius: 8px;
  background-color: var(--color-background-soft, #f8f9fa);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.plugin-info {
  flex: 1;
}

.plugin-info h3 {
  margin: 0 0 5px 0;
  font-size: 1.1em;
}

.version {
  font-size: 0.8em;
  color: #666;
  font-weight: normal;
}

.author {
  margin: 0 0 5px 0;
  font-size: 0.9em;
  color: #666;
}

.description {
  margin: 0;
  font-size: 0.9em;
}
</style>
