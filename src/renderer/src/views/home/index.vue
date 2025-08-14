<script setup lang="ts">
import PlayMusic from '@renderer/components/Play/PlayMusic.vue'
</script>

<template>
  <t-layout class="home-container">
    <t-aside>
      <t-menu theme="light" value="dashboard" style="margin-right: 50px" height="550px">
        <template #logo>
          <img width="136" class="logo" src="../../assets/images/logo.svg" alt="logo" />
        </template>
        <t-menu-item value="dashboard">
          <template #icon>
            <t-icon name="dashboard" />
          </template>
          仪表盘
        </t-menu-item>
        <t-menu-item value="resource">
          <template #icon>
            <t-icon name="server" />
          </template>
          资源列表
        </t-menu-item>
        <t-menu-item value="root">
          <template #icon>
            <t-icon name="root-list" />
          </template>
          根目录
        </t-menu-item>
      </t-menu>
    </t-aside>
    <t-layout>
      <t-content>
        <div>Content</div>
      </t-content>
    </t-layout>
  </t-layout>
  <PlayMusic />
</template>

<style lang="scss" scoped>
.logo {
  width: 56px;
  height: 56px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
}
.home-container {
  height: 100vh;
}
</style>
