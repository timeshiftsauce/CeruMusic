<template>
  <div class="leaderboard-container">
    <div class="section-header">
      <div class="title">热门榜单</div>
    </div>

    <div v-if="loading" class="board-grid">
      <div v-for="n in 24" :key="n" class="skeleton-card">
        <div class="skeleton-block"></div>
      </div>
    </div>

    <div v-else-if="boards.length > 0" class="board-grid">
      <LeaderBordCard
        v-for="board in boards"
        :key="board.id"
        :data="board"
        @click="handleCardClick"
      />
    </div>

    <div v-else class="empty-state">
      <div class="empty-text">暂无榜单数据</div>
      <t-button variant="text" @click="fetchBoards">重试</t-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import LeaderBordCard from '../Card/LeaderBordCard.vue'

const boards = ref<any[]>([])
const loading = ref(true)
const router = useRouter()
const localUserStore = LocalUserDetailStore()

const currentSource = computed(() => localUserStore.userSource.source)

const fetchBoards = async () => {
  loading.value = true
  try {
    const source = localUserStore.userSource.source
    if (!source) {
      loading.value = false
      return
    }
    // Using window.api.music.requestSdk which maps to main process service
    const res = await (window as any).api.music.requestSdk('getLeaderboards', { source })

    console.log('Leaderboards fetched:', res)
    boards.value = res || []
  } catch (error) {
    console.error('Failed to fetch leaderboards:', error)
    boards.value = []
  } finally {
    loading.value = false
  }
}

const handleCardClick = (board: any) => {
  console.log('Card clicked:', board)
  router.push({
    name: 'list',
    params: { id: board.board_id || board.id },
    query: {
      title: board.name,
      cover: board.pic || '',
      source: board.source || currentSource.value
    }
  })
}

watch(
  () => localUserStore.userSource.source,
  () => {
    fetchBoards()
  }
)

onMounted(() => {
  fetchBoards()
})
</script>

<style scoped lang="scss">
.leaderboard-container {
  padding-bottom: 1rem;
  .section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 1rem;

    .title {
      font-size: 20px;
      font-weight: 700;
      color: var(--td-text-color-primary);
    }
  }

  .board-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 24px;

    @media (max-width: 768px) {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 16px;
    }
  }

  .loading-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--td-text-color-secondary);

    .empty-text {
      margin-bottom: 12px;
    }
  }

  .skeleton-card {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    background: var(--td-bg-color-secondarycontainer);

    .skeleton-block {
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.06) 25%,
        rgba(0, 0, 0, 0.12) 37%,
        rgba(0, 0, 0, 0.06) 63%
      );
      background-size: 400% 100%;
      animation: shimmer 1.4s ease infinite;
    }
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>
