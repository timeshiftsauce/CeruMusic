<template>
  <div class="music-cache">
    <t-card hover-shadow :loading="!cacheInfo || cacheInfo.clearing" title="本地歌曲缓存配置">
      <template #actions>
        已有歌曲缓存大小：{{ cacheInfo?.sizeFormatted || '0 B' }}
        <span v-if="cacheInfo?.count > 0">（{{ cacheInfo.count }} 个文件）</span>
      </template>
      <div class="card-body">
        <t-button
          size="large"
          :loading="cacheInfo?.clearing"
          :disabled="!cacheInfo?.count || cacheInfo?.count === 0"
          @click="clearCache"
        >
          {{ cacheInfo?.clearing ? '正在清除...' : '清除本地缓存' }}
        </t-button>
        <div v-if="!cacheInfo?.count || cacheInfo?.count === 0" class="no-cache-tip">
          暂无缓存文件
        </div>
      </div>
    </t-card>
  </div>
</template>

<script lang="ts" setup>
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { onMounted, ref } from 'vue'

// 定义事件
const emit = defineEmits<{
  'cache-cleared': []
}>()

const cacheInfo: any = ref({})

const loadCacheInfo = async (forceRefresh = false) => {
  try {
    console.log('正在获取缓存信息...', forceRefresh ? '(强制刷新)' : '')
    const res = await window.api.musicCache.getInfo()
    console.log('获取到缓存信息:', res)
    cacheInfo.value = res
  } catch (error) {
    console.error('获取缓存信息失败:', error)
    MessagePlugin.error('获取缓存信息失败')
  }
}

onMounted(() => {
  loadCacheInfo()
})

const clearCache = () => {
  const confirm = DialogPlugin.confirm({
    header: '确认清除缓存吗',
    body: '这可能会导致歌曲加载缓慢，你确定要清除所有缓存吗？',
    confirmBtn: '确定清除',
    cancelBtn: '我再想想',
    placement: 'center',
    onClose: () => {
      confirm.hide()
    },
    onConfirm: async () => {
      confirm.hide()

      try {
        // 显示加载状态
        cacheInfo.value = { ...cacheInfo.value, clearing: true }

        // 执行清除操作
        const result = await window.api.musicCache.clear()

        if (result.success) {
          console.log('缓存清除成功，开始更新界面')
          MessagePlugin.success(result.message || '缓存清除成功')

          // 发射缓存清除事件
          emit('cache-cleared')

          // 立即重置缓存信息显示
          cacheInfo.value = {
            count: 0,
            size: 0,
            sizeFormatted: '0 B',
            clearing: false
          }

          // 多次尝试重新加载，确保获取到最新状态
          let retryCount = 0
          const maxRetries = 3

          const reloadWithRetry = async () => {
            retryCount++
            console.log(`第${retryCount}次尝试重新加载缓存信息`)

            await loadCacheInfo(true)

            // 如果还有缓存文件且重试次数未达上限，继续重试
            if (cacheInfo.value.count > 0 && retryCount < maxRetries) {
              console.log(`仍有${cacheInfo.value.count}个缓存文件，1秒后重试`)
              setTimeout(reloadWithRetry, 1000)
            } else {
              console.log('缓存信息更新完成:', cacheInfo.value)
            }
          }

          // 延迟一下再开始重新加载
          setTimeout(reloadWithRetry, 300)
        } else {
          MessagePlugin.error(result.message || '缓存清除失败')
          // 清除加载状态
          if (cacheInfo.value.clearing) {
            delete cacheInfo.value.clearing
          }
        }
      } catch (error) {
        console.error('清除缓存失败:', error)
        MessagePlugin.error('清除缓存失败，请重试')
        // 清除加载状态
        if (cacheInfo.value.clearing) {
          delete cacheInfo.value.clearing
        }
      }
    }
  })
}

// 刷新缓存信息（供父组件调用）
const refreshCacheInfo = async () => {
  console.log('刷新缓存信息')
  await loadCacheInfo(true)
}

// 暴露方法给父组件
defineExpose({
  refreshCacheInfo
})
</script>

<style lang="scss" scoped>
.music-cache {
  width: 100%;

  .card-body {
    padding: 20px;
    text-align: center;

    .no-cache-tip {
      margin-top: 10px;
      color: var(--td-text-color-placeholder);
      font-size: 14px;
    }
  }
}
</style>
