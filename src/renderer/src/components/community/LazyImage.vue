<script setup lang="ts">
/**
 * 渐进式图片加载
 *
 * 加载流程:
 *  1. 立刻显示 OSS 模糊缩略图(背景层),通常 < 5KB 秒到
 *  2. IntersectionObserver 监听本身,进入视口前 200px 才开始加载清晰图
 *  3. 清晰图 onload 后淡入覆盖模糊层
 *
 * 不在视口内 -> 不发起清晰图请求,长列表显著节流
 *
 * 注: 卡片高度需要外层容器决定(aspect-ratio 或固定 height),
 *     LazyImage 内部图片是 absolute 填满,自身不会撑高度。
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 清晰图 URL,通常通过 ossCard/ossDetail 处理过 */
    src: string
    /** 清晰图处理失败时使用的原始图片 URL */
    fallbackSrc?: string
    /** 模糊占位图;不传则不显示占位层(纯透明背景) */
    thumb?: string
    alt?: string
    /** object-fit 模式 */
    fit?: 'cover' | 'contain'
    /** 立即加载,跳过 lazy(用于首屏关键图) */
    eager?: boolean
    /**
     * 跟随图片真实比例: 模糊 thumb 加载完后,根据其 naturalWidth/Height
     * 设置容器 aspect-ratio,清晰图自然填入不再变高。
     * 用于瀑布流卡片要"完整显示不裁切"的场景。
     */
    autoAspect?: boolean
    /**
     * 外部直接传入图片的 aspect-ratio 字符串(如 '4 / 5'),
     * 优先于 thumb 加载后算出的值,适用于上传时已记录尺寸的场景 ——
     * 骨架立即就位,不需要等 thumb 网络往返。
     */
    aspectRatio?: string
    /**
     * View Transitions API 的 view-transition-name —— 用于共享元素过渡。
     * 设置后,DOM 在该名称下被浏览器跟踪,
     * 启动 document.startViewTransition() 时同名元素会自动 morph。
     */
    transitionName?: string
  }>(),
  { fit: 'cover', eager: false, autoAspect: false }
)

const emit = defineEmits<{
  load: []
  error: []
}>()

const rootEl = ref<HTMLElement | null>(null)
/** 是否开始加载清晰图(进入视口/eager) */
const started = ref(props.eager)
/** 清晰图是否加载完成 */
const loaded = ref(false)
const triedFallback = ref(false)
/** autoAspect 模式: thumb 算出来的比例字符串(给 CSS aspect-ratio 用) */
const autoAspectStyle = ref<string | null>(null)

let io: IntersectionObserver | null = null

onMounted(() => {
  if (props.eager) {
    void syncCachedImage()
    return
  }
  if (!rootEl.value) return
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          started.value = true
          void syncCachedImage()
          io?.disconnect()
          io = null
          break
        }
      }
    },
    { rootMargin: '200px 0px', threshold: 0.01 }
  )
  io.observe(rootEl.value)
})

onUnmounted(() => {
  io?.disconnect()
  io = null
})

/* src 变化 -> 重置 loaded 状态(避免老图淡出新图淡入错乱) */
watch(
  () => props.src,
  () => {
    loaded.value = false
    triedFallback.value = false
    void syncCachedImage()
  }
)

/**
 * Cached images can be complete before a browser dispatches a new load event.
 * Check the DOM after Vue has rendered the real image so the thumb cannot stay
 * visible forever just because the request was served from cache.
 */
async function syncCachedImage() {
  await nextTick()
  const img = rootEl.value?.querySelector<HTMLImageElement>('.real')
  if (img?.complete && img.naturalWidth > 0) {
    await revealImage(img)
  }
}

/** 容器 inline style —— 合并 aspect-ratio + view-transition-name */
const rootStyle = computed<Record<string, string>>(() => {
  const s: Record<string, string> = {}
  /* 优先级: 外部传入 > thumb 算出来 */
  const ar = props.aspectRatio || autoAspectStyle.value
  if (ar && (props.autoAspect || props.aspectRatio)) {
    s.aspectRatio = ar
  }
  if (props.transitionName) {
    // 类型断言:viewTransitionName 在较旧 TS 库里没有,直接走 string 索引
    s.viewTransitionName = props.transitionName
  }
  return s
})

function onThumbLoad(e: Event) {
  if (!props.autoAspect) return
  const img = e.target as HTMLImageElement
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    // thumb 由 OSS 保比缩放,naturalWidth/Height 比例与原图一致
    autoAspectStyle.value = `${img.naturalWidth} / ${img.naturalHeight}`
    // 父容器 aspect 一变高度立即定下,触发外层 @load.capture 重排
    emit('load')
  }
}

async function revealImage(img: HTMLImageElement, expectedSrc = props.src) {
  try {
    await img.decode()
  } catch {
    // Some browsers reject decode() for already-decoded/cached images.
  }
  if (
    img.isConnected &&
    img.naturalWidth > 0 &&
    (img.currentSrc === expectedSrc || img.src === expectedSrc)
  ) {
    loaded.value = true
  }
}

function onImgLoad(e: Event) {
  const img = e.currentTarget as HTMLImageElement
  void revealImage(img, img.currentSrc || props.src)
  emit('load')
}
function onImgError(e: Event) {
  const img = e.currentTarget as HTMLImageElement
  if (props.fallbackSrc && !triedFallback.value && img.currentSrc !== props.fallbackSrc) {
    triedFallback.value = true
    loaded.value = false
    img.src = props.fallbackSrc
    return
  }
  emit('error')
}
</script>

<template>
  <div
    ref="rootEl"
    class="lazy-img"
    :class="[`fit-${fit}`, { 'auto-aspect': autoAspect || !!aspectRatio }]"
    :style="rootStyle"
  >
    <!-- 模糊占位层 —— 模糊+放大 1.1 避免边缘锯齿 -->
    <img v-if="thumb" class="thumb" :src="thumb" alt="" aria-hidden="true" @load="onThumbLoad" />
    <!-- 清晰图 —— 进入视口才设 src,加载完淡入 -->
    <img
      v-if="started"
      class="real"
      :class="{ loaded }"
      :src="src"
      :alt="alt"
      decoding="async"
      @load="onImgLoad"
      @error="onImgError"
    />
  </div>
</template>

<style scoped>
.lazy-img {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--td-bg-color-component);
}
/* autoAspect: 高度由 :style aspect-ratio 决定;空比例时给最小占位高 */
.lazy-img.auto-aspect {
  height: auto;
  min-height: 80px;
}
.thumb {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  filter: blur(12px);
  transform: scale(1.12);
  z-index: 0;
}
.real {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 0.35s ease;
  z-index: 1;
}
.real.loaded {
  opacity: 1;
}

.fit-cover .thumb,
.fit-cover .real {
  object-fit: cover;
}
.fit-contain .thumb,
.fit-contain .real {
  object-fit: contain;
}
</style>
