<script setup lang="ts">
import pointer from '../../assets/pointer.png'
import PlayerCover from './PlayerCover.vue'

defineProps<{ mode: 'vinyl' | 'square'; artwork?: string | null; alt?: string; playing?: boolean }>()
</script>

<template>
  <div v-if="mode === 'vinyl'" class="vinyl-artwork ceru-hc-vinyl" :class="{ playing }" role="img" :aria-label="alt || '黑胶唱片'">
    <img class="pointer" :src="pointer" alt="" draggable="false" />
    <div class="cd-container" :style="{ animationPlayState: playing ? 'running' : 'paused' }">
      <div class="vinyl-record" />
      <div class="vinyl-label">
        <slot><PlayerCover :src="artwork" class="cover" /></slot>
        <div class="label-shine" />
      </div>
      <div class="center-hole" />
    </div>
  </div>
  <div v-else class="square-artwork ceru-hc-square-cover" :class="{ playing }" role="img" :aria-label="alt || '歌曲封面'">
    <slot><PlayerCover :src="artwork" /></slot>
  </div>
</template>

<style scoped lang="scss">
.vinyl-artwork {
  position: relative;
  width: var(--cd-size, min(72vw, 72vh));
  aspect-ratio: 1;
  margin: var(--record-margin, min(19vw, 19vh) auto 0);
  .pointer {
    user-select: none;
    position: absolute;
    width: calc(100% / 3.5);
    left: 46%;
    bottom: 91%;
    transform: rotate(-20deg);
    transform-origin: 14% 14%;
    z-index: 2;
    transition: transform 0.3s;
    pointer-events: none;
  }
  &.playing .pointer { transform: rotate(0deg); }
}
.square-artwork {
  width: 100%; aspect-ratio: 1; display: grid; place-items: center;
  border-radius: 24px; overflow: hidden; user-select: none;
  transform: scale(.8); transition: transform .44s cubic-bezier(.44, 2, .64, 1);
  background: var(--ceru-hc-background, transparent); color: var(--ceru-hc-foreground, white);
  &:hover { transform: scale(.82); }
  &.playing { transform: scale(1); }
  &.playing:hover { transition: transform .2s; transform: scale(1.02); }
  > img { width: 100%; height: 100%; object-fit: cover; }
  :deep(img) { -webkit-user-drag: none; }
}

.cd-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: rotateRecord 33s linear infinite;
  transition:
    filter 0.3s ease,
    width 0.3s ease,
    height 0.3s ease;
  filter: drop-shadow(0 15px 35px rgba(0, 0, 0, 0.6));


  &:hover {
    filter: drop-shadow(0 20px 45px rgba(0, 0, 0, 0.7));
  }

  /* 黑胶唱片主体 */
  .vinyl-record {
    aspect-ratio: 1/1;

    // margin-top: calc(var(--play-bottom-height) / 2);
    width: 100%;
    height: 100%;
    position: relative;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, #1a1a1a 0%, #0d0d0d 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    /* 唱片纹理轨道 */
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background:
        repeating-conic-gradient(
          from 0deg,
          transparent 0deg,
          rgba(255, 255, 255, 0.02) 0.5deg,
          transparent 1deg,
          rgba(255, 255, 255, 0.01) 1.5deg,
          transparent 2deg
        ),
        repeating-radial-gradient(
          circle at 50% 50%,
          transparent 0px,
          rgba(255, 255, 255, 0.03) 1px,
          transparent 2px,
          transparent 8px
        );
      z-index: 1;
    }

    /* 唱片光泽效果 */
    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(
        ellipse at 30% 30%,
        rgba(255, 255, 255, 0.08) 0%,
        rgba(255, 255, 255, 0.04) 25%,
        rgba(255, 255, 255, 0.02) 50%,
        rgba(255, 255, 255, 0.01) 75%,
        transparent 100%
      );
      border-radius: 50%;
      z-index: 2;
      animation: vinylShine 6s ease-in-out infinite;
    }
  }

  /* 唱片标签区域 */
  .vinyl-label {
    position: absolute;
    width: 60%;
    height: 60%;
    background: radial-gradient(
      circle at 50% 50%,
      rgba(40, 40, 40, 0.95) 0%,
      rgba(25, 25, 25, 0.98) 70%,
      rgba(15, 15, 15, 1) 100%
    );
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3;
    box-shadow:
      inset 0 0 20px rgba(0, 0, 0, 0.8),
      inset 0 0 0 1px rgba(255, 255, 255, 0.05),
      0 0 10px rgba(0, 0, 0, 0.5);

    :deep(.cover) {
      position: relative;
      z-index: 4;
      border-radius: 50%;
      overflow: hidden;
      box-shadow:
        0 0 20px rgba(0, 0, 0, 0.4),
        inset 0 0 0 2px rgba(255, 255, 255, 0.1);
      width: 95% !important;
      height: 95% !important;
      aspect-ratio: 1 / 1;

      img {
        user-select: none;
        -webkit-user-drag: none;
        border-radius: 50%;
        filter: brightness(0.85) contrast(1.15) saturate(1.1);
        width: 100% !important;
        height: 100% !important;
        object-fit: cover;
      }
    }

    /* 标签光泽 */
    .label-shine {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(
        ellipse at 25% 25%,
        rgba(255, 255, 255, 0.1) 0%,
        transparent 50%
      );
      border-radius: 50%;
      z-index: 5;
      pointer-events: none;
      animation: labelShine 8s ease-in-out infinite;
    }
  }

  /* 中心孔 */
  .center-hole {
    position: absolute;
    width: 8%;
    height: 8%;
    background: radial-gradient(circle, #000 0%, #111 30%, #222 70%, #333 100%);
    border-radius: 50%;
    z-index: 10;
    box-shadow:
      inset 0 0 8px rgba(0, 0, 0, 0.9),
      0 0 3px rgba(0, 0, 0, 0.8);
  }
}

@keyframes rotateRecord {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

@keyframes vinylShine {
  0% {
    opacity: 0.1;
    transform: rotate(0deg) scale(1);
  }

  50% {
    opacity: 0.2;
    transform: rotate(180deg) scale(1.1);
  }

  100% {
    opacity: 0.1;
    transform: rotate(360deg) scale(1);
  }
}

@keyframes labelShine {
  0% {
    opacity: 0.05;
    transform: rotate(0deg);
  }

  25% {
    opacity: 0.15;
  }

  50% {
    opacity: 0.1;
    transform: rotate(180deg);
  }

  75% {
    opacity: 0.15;
  }

  100% {
    opacity: 0.05;
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cd-container, .vinyl-record::after, .label-shine { animation: none !important; }
  .pointer, .square-artwork { transition: none !important; }
}
</style>
