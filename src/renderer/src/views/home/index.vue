<script setup lang="ts">
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
            <KeepAlive exclude="list">
              <component :is="Component" />
            </KeepAlive>
          </Transition>
        </router-view>
      </template>
    </HomeLayout>
    <PlayMusic />
  </div>
</template>
