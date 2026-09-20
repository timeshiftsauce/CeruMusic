<script setup lang="ts">
import { computed } from 'vue'
import { noteCoverLayout, noteCoverTheme } from './noteCoverTheme'

const props = defineProps<{ seed: string; content: string; expanded?: boolean }>()
const theme = computed(() => noteCoverTheme(props.seed))
const layout = computed(() => noteCoverLayout(props.seed))
</script>

<template>
  <div class="text-note-cover" :class="[layout, { expanded }]" :style="theme">
    <span class="note-decoration" aria-hidden="true">{{ layout === 'quote' ? '“' : '♪' }}</span>
    <span class="note-eyebrow" aria-hidden="true"><span /> 音乐随记</span>
    <div class="note-writing">
      <p>{{ content }}</p>
    </div>
    <div class="note-signature" aria-hidden="true"><span /> 随心，随乐。</div>
  </div>
</template>

<style scoped>
@font-face {
  font-family: 'Ceru Note Handwriting';
  src: url('../../assets/fonts/ZhiMangXing-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Ceru Note Ma Shan Zheng';
  src: url('../../assets/fonts/MaShanZheng-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Ceru Note Liu Jian Mao Cao';
  src: url('../../assets/fonts/LiuJianMaoCao-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Ceru Note Long Cang';
  src: url('../../assets/fonts/LongCang-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Ceru Note ZCOOL Kuai Le';
  src: url('../../assets/fonts/ZCOOLKuaiLe-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Ceru Note ZCOOL Xiao Wei';
  src: url('../../assets/fonts/ZCOOLXiaoWei-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Ceru Note ZCOOL Qing Ke Huang You';
  src: url('../../assets/fonts/ZCOOLQingKeHuangYou-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
.text-note-cover {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 220px;
  padding: 22px 24px;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 12px;
  color: var(--note-ink);
  background:
    radial-gradient(ellipse at var(--note-x) var(--note-y), var(--note-wash), transparent 72%),
    linear-gradient(var(--note-angle), var(--note-paper) 20%, var(--note-accent));
}
.text-note-cover::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.2;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%23000' filter='url(%23n)' opacity='.28' d='M0 0h160v160H0z'/%3E%3C/svg%3E");
  pointer-events: none;
}
.note-eyebrow,
.note-signature {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.65;
  font-size: 10px;
  letter-spacing: 2px;
}
.note-eyebrow > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.note-writing {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 22px 0;
  min-height: 0;
}
.note-writing p {
  margin: 0;
  font-family: var(--note-font), KaiTi, STKaiti, cursive;
  font-size: 28px;
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: 1px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.note-signature {
  justify-content: flex-end;
  font-size: 9px;
}
.note-signature > span {
  width: 26px;
  height: 1px;
  background: currentColor;
}
.note-decoration {
  position: absolute;
  pointer-events: none;
  font-family: Georgia, serif;
}
.journal {
  background:
    repeating-linear-gradient(
      transparent 0 35px,
      color-mix(in srgb, var(--note-ink) 10%, transparent) 35px 36px
    ),
    linear-gradient(var(--note-angle), var(--note-paper), var(--note-wash));
}
.journal::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 14px;
  border-left: 1px solid color-mix(in srgb, var(--note-ink) 15%, transparent);
  pointer-events: none;
}
.journal .note-decoration {
  right: 18px;
  top: 13px;
  font-size: 24px;
  opacity: 0.3;
  transform: rotate(12deg);
}
.journal .note-writing p {
  font-size: 25px;
  line-height: 36px;
}
.letter {
  align-items: center;
  text-align: center;
  padding-top: 30px;
}
.letter .note-decoration {
  top: -8px;
  left: calc(50% - 24px);
  width: 48px;
  height: 23px;
  background: #fff7;
  transform: rotate(-7deg);
  font-size: 0;
}
.letter .note-writing {
  justify-content: center;
}
.letter .note-eyebrow > span {
  display: none;
}
.letter .note-signature {
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--note-ink) 25%, transparent);
}
.letter .note-signature > span {
  display: none;
}
.quote .note-decoration {
  top: 35px;
  left: 16px;
  font-size: 100px;
  line-height: 1;
  opacity: 0.16;
}
.quote .note-writing {
  padding: 36px 0 22px 14px;
}
.quote .note-writing p {
  font-size: 30px;
}
.quote .note-eyebrow {
  margin-left: auto;
}
.quote .note-signature {
  justify-content: flex-start;
  margin-left: 14px;
}
.postcard {
  padding: 26px;
  border: 6px solid var(--note-paper);
}
.postcard .note-decoration {
  right: 14px;
  top: 12px;
  display: grid;
  place-items: center;
  border: 1px dashed currentColor;
  width: 30px;
  height: 38px;
  font-size: 22px;
  opacity: 0.45;
  transform: rotate(8deg);
}
.postcard .note-eyebrow {
  max-width: calc(100% - 35px);
}
.postcard .note-writing {
  padding-top: 32px;
}
.postcard .note-writing p {
  font-size: 26px;
}
.postcard .note-signature {
  border-top: 1px solid color-mix(in srgb, var(--note-ink) 20%, transparent);
  padding-top: 12px;
}
.expanded {
  height: 100%;
  border-radius: 0;
  padding: clamp(28px, 4vw, 64px);
}
.expanded .note-eyebrow {
  font-size: 12px;
}
.expanded .note-writing {
  overflow-y: auto;
}
.expanded .note-writing p {
  display: block;
  margin: auto 0;
  font-size: clamp(30px, 3.2vw, 44px);
  overflow: visible;
}
.expanded .note-signature {
  font-size: 12px;
}
.expanded.journal .note-writing p {
  line-height: 1.64;
}
.expanded.journal::after {
  left: 30px;
}
.expanded.quote .note-decoration {
  top: 90px;
  left: 32px;
  font-size: 180px;
}
.expanded.postcard {
  border-width: 14px;
}
.expanded.postcard .note-decoration {
  top: 30px;
  right: 30px;
  width: 48px;
  height: 60px;
  font-size: 30px;
}
.expanded.letter .note-decoration {
  width: 80px;
  height: 32px;
  left: calc(50% - 40px);
}
</style>
