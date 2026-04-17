<script setup lang="ts">
import { computed } from 'vue'
import { crossfadeState } from '@renderer/utils/audio/crossfade'

const visible = computed(() => crossfadeState.active)
</script>

<template>
  <transition name="hint-slide">
    <div v-if="visible" class="crossfade-hint">
      <div class="wave">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="text">
        <span
          v-for="(ch, i) in '正在平滑过渡'"
          :key="i"
          class="ch"
          :style="{ animationDelay: `${-(5.5 - i) * 0.22}s` }"
          >{{ ch }}</span
        >
      </span>
    </div>
  </transition>
</template>

<style lang="scss" scoped>
.crossfade-hint {
  position: fixed;
  bottom: calc(var(--play-bottom-height) + 12px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  backdrop-filter: blur(20px);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
  pointer-events: none;
  user-select: none;
  will-change: opacity, transform;

  .wave {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 14px;

    span {
      display: inline-block;
      width: 3px;
      height: 14px;
      background: currentColor;
      border-radius: 2px;
      transform-origin: center;
      animation: cf-wave 1s ease-in-out infinite;
    }

    span:nth-child(1) {
      animation-delay: 0s;
    }
    span:nth-child(2) {
      animation-delay: 0.12s;
    }
    span:nth-child(3) {
      animation-delay: 0.24s;
    }
    span:nth-child(4) {
      animation-delay: 0.36s;
    }
  }

  .text {
    letter-spacing: 0.3px;
    display: inline-flex;

    .ch {
      display: inline-block;
      animation: cf-text-wave 2.4s ease-in-out infinite;
    }
  }
}

@keyframes cf-wave {
  0%,
  100% {
    transform: scaleY(0.4);
  }
  50% {
    transform: scaleY(1);
  }
}

@keyframes cf-text-wave {
  0%,
  100% {
    opacity: 0.35;
    text-shadow: 0 0 0 transparent;
  }
  50% {
    opacity: 1;
    text-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
  }
}

.hint-slide-enter-active,
.hint-slide-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.hint-slide-enter-from,
.hint-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
.hint-slide-enter-to,
.hint-slide-leave-from {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
