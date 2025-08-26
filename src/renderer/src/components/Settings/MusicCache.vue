<template>
  <div class="music-cache">
    <t-card hover-shadow :loading="cacheInfo ? false : true" title="本地歌曲缓存配置">
      <template #actions>
        已有歌曲缓存大小：{{ cacheInfo.sizeFormatted }}
      </template>
      <div class="card-body">
        <t-button size="large" @click="clearCache">
          清除本地缓存
        </t-button>
      </div>
    </t-card>
  </div>
</template>

<script lang="ts" setup>
import { DialogPlugin } from 'tdesign-vue-next';
import { onMounted, ref } from 'vue';

const cacheInfo: any = ref({})
onMounted(() => {
  window.api.musicCache.getInfo().then(res => cacheInfo.value = res)
})
const clearCache = () => {
  const confirm = DialogPlugin.confirm({
    header: '确认清除缓存吗',
    body: '这可能会导致歌曲加载缓慢，你确定要清除所有缓存吗？',
    confirmBtn: '确定清除',
    cancelBtn: '我再想想',
    placement:'center',
    onClose: () => {
      confirm.hide()
    },
    onConfirm: async () => {
      confirm.hide()
      cacheInfo.value = {}
      await window.api.musicCache.clear()
      window.api.musicCache.getInfo().then(res => cacheInfo.value = res)

    }
  })
}
</script>

<style lang="scss" scoped>
.music-cache {
  width: 100%;

  .card-body {
    padding: 10px;
    text-align: center;
  }
}
</style>