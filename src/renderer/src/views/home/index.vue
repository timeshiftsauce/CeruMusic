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
            :enter-active-class="`animate__animated ${route.meta.transitionIn} sidebar-page-transition`"
            :leave-active-class="`animate__animated ${route.meta.transitionOut} sidebar-page-transition`"
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

<style scoped>
:global(.sidebar-page-transition) {
  --animate-duration: 480ms;
  animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  :global(.sidebar-page-transition) {
    --animate-duration: 1ms;
  }
}
</style>
