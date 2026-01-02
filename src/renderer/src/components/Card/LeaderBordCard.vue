<template>
  <div class="leaderboard-card" @click="handleClick">
    <div class="card-image">
      <s-image v-if="data.pic" :src="data.pic" :alt="data.name" loading="lazy" />
      <div v-else class="placeholder">{{ data.name[0] }}</div>

      <div class="play-count" v-if="data.listen">
        <EarphoneIcon class="icon" />
        <span>{{ data.listen }}</span>
      </div>

      <div class="card-info">
        <div class="name">{{ data.name }}</div>
        <div class="update-freq" v-if="data.update_frequency">{{ data.update_frequency }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EarphoneIcon } from 'tdesign-icons-vue-next'

const props = defineProps<{
  data: {
    id: string
    name: string
    pic?: string
    listen?: string
    update_frequency?: string
    [key: string]: any
  }
}>()

const emit = defineEmits(['click'])

const handleClick = () => {
  emit('click', props.data)
}
</script>

<style scoped lang="scss">
.leaderboard-card {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
  }

  .card-image {
    width: 100%;
    height: 100%;
    position: relative;
    background-color: #f5f5f5;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    &:hover img {
      transform: scale(1.05);
    }

    .placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      font-weight: bold;
      color: #999;
      background: #eee;
    }

    .play-count {
      position: absolute;
      top: 8px;
      right: 8px;
      color: #fff;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(0, 0, 0, 0.25);
      padding: 2px 8px;
      border-radius: 20px;
      backdrop-filter: blur(4px);
      z-index: 2;

      .icon {
        font-size: 14px;
      }
    }

    .card-info {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 40px 12px 12px;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.7) 0%,
        rgba(0, 0, 0, 0.4) 50%,
        transparent 100%
      );
      color: #fff;
      text-align: left;
      z-index: 2;

      .name {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 4px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      }

      .update-freq {
        font-size: 12px;
        opacity: 0.9;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      }
    }
  }
}
</style>
