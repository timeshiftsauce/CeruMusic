<script setup lang="ts">
defineOptions({ name: 'HomeRoot' })
// import HomeLayout from '@renderer/layout/index.vue'
// Trigger auto-import regeneration
</script>

<template>
  <div class="home">
    <HomeLayout>
      <template #body>
        <router-view v-slot="{ Component, route }">
          <Transition
            name="page"
            :enter-active-class="`animate__animated ${route.meta.transitionIn} animate__fast`"
            :leave-active-class="`animate__animated ${route.meta.transitionOut} animate__fast`"
          >
            <KeepAlive exclude="list,PluginPage">
              <component :is="Component" :key="route.name==='list' ? route.fullPath : undefined" />
            </KeepAlive>
          </Transition>
        </router-view>
      </template>
    </HomeLayout>
    <PlayMusic />
  </div>
</template>
