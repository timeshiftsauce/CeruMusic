<script setup lang="ts">
// import HomeLayout from '@renderer/layout/index.vue'
// Trigger auto-import regeneration
const detailRouteNames = new Set(['list', 'profile', 'local-tag-editor', 'recognize'])

const resolveHomeTransition = (route: { name?: string | symbol | null }) => {
  const routeName = typeof route.name === 'string' ? route.name : ''
  return detailRouteNames.has(routeName) ? 'home-detail' : 'home-scene'
}
</script>

<template>
  <div class="home">
    <HomeLayout>
      <template #body>
        <router-view v-slot="{ Component, route }">
          <Transition :name="resolveHomeTransition(route)" mode="out-in" appear>
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
