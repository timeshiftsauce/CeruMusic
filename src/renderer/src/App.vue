<template>
  <Provider v-if="!$route.path.includes('desktop-lyric')">
    <router-view v-slot="{ Component, route }">
      <Transition name="app-shell" appear>
        <KeepAlive v-if="shouldKeepAliveAtRoot(route)">
          <component :is="Component" />
        </KeepAlive>
        <component :is="Component" v-else />
      </Transition>
    </router-view>
  </Provider>
  <router-view v-else />
  <GlobalContextMenu />
</template>

<script setup lang="ts">
import { KeepAlive } from 'vue'
import GlobalContextMenu from '@renderer/components/ContextMenu/GlobalContextMenu.vue'
import { shouldKeepAliveAtRoot } from '@renderer/router/rootCachePolicy'
</script>
