<template>
  <div class="settings-section">
    <!-- <div class="setting-group">
      <h3>插件管理</h3>
      <p>管理和配置应用插件，扩展音乐播放器功能</p>
      <t-button theme="primary" @click="goPlugin">
        <TreeRoundDotIcon style="margin-right: 0.5em" />
        打开插件管理
      </t-button>
    </div> -->
    <div id="plugin-settings">
      <plugins />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-section {
  animation: fadeInUp 0.4s ease-out;
  animation-fill-mode: both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
