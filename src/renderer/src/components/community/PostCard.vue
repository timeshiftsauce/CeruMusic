<script setup lang="ts">
/**
 * 笔记卡片 —— 小红书风格
 *
 * 结构(自上而下):
 *  1. 封面图(占满宽度,高度跟随原图比例,大圆角)
 *     · 无图时显示渐变文本块代替
 *     · 多图右上角小角标
 *  2. 标题正文(1-2 行截断)
 *  3. 作者(头像 + 昵称)  右侧 点赞图标 + 数字
 *
 * 透底设计:
 *  · 卡片本身无独立背景框,图片是焦点
 *  · 时间/评论/分享/附件全部下沉到详情弹窗,列表只保留最关键信息
 */
import { computed } from 'vue'
import { HeartFilledIcon, HeartIcon } from 'tdesign-icons-vue-next'
import type { CommunityPost, PostImageOrUrl } from '@renderer/api/community'
import { ossAvatar, ossCard, ossThumb } from '@renderer/utils/ossImage'
import LazyImage from './LazyImage.vue'

const props = defineProps<{
  post: CommunityPost
}>()

defineEmits<{
  click: [ev: MouseEvent]
}>()

const images = computed(() => props.post.images || [])

/** 提取首图的 URL —— 兼容 {url,w,h} 和 string 两种格式 */
function imgUrl(it: PostImageOrUrl): string {
  return typeof it === 'string' ? it : it.url
}
function imgAspect(it: PostImageOrUrl): string | undefined {
  if (typeof it === 'string') return undefined
  if (!it.w || !it.h) return undefined
  return `${it.w} / ${it.h}`
}

const firstImage = computed(() => (images.value[0] ? imgUrl(images.value[0]) : ''))
/** 后端上传时记录的真实宽高 -> 立即给 LazyImage 设 aspect-ratio,
 * 不用等模糊 thumb 加载完才有骨架高度 */
const firstAspect = computed(() =>
  images.value[0] ? imgAspect(images.value[0]) : undefined
)
const extraCount = computed(() => Math.max(0, images.value.length - 1))

const initial = computed(() => (props.post.username || '?').slice(0, 1).toUpperCase())

/** 12345 -> '1.2万';否则原样 */
function formatCount(n: number): string {
  if (!n) return '0'
  if (n < 10000) return String(n)
  return (n / 10000).toFixed(n < 100000 ? 1 : 0) + '万'
}
const likeText = computed(() => formatCount(props.post.likeCount))

/** 无图时取正文前 ~60 字做封面文字 */
const textExcerpt = computed(() => {
  const t = props.post.content.replace(/\n+/g, ' ')
  return t.length > 60 ? t.slice(0, 60) + '...' : t
})
</script>

<template>
  <article
    class="note-card"
    :data-post-id="post.id"
    @click="$emit('click', $event)"
  >
    <!-- 封面 -->
    <div v-if="firstImage" class="cover-wrap">
      <LazyImage
        :src="ossCard(firstImage)"
        :thumb="ossThumb(firstImage)"
        fit="cover"
        auto-aspect
        :aspect-ratio="firstAspect"
      />
      <span v-if="extraCount > 0" class="multi-badge">{{ images.length }} 图</span>
    </div>
    <div v-else class="text-cover">
      <p>{{ textExcerpt }}</p>
    </div>

    <!-- 文字 + 底栏 -->
    <div class="body">
      <p class="title">{{ post.content }}</p>
      <div class="meta">
        <div class="author">
          <img
            v-if="post.userAvatar"
            class="avatar"
            :src="ossAvatar(post.userAvatar)"
            :alt="post.username"
          />
          <span v-else class="avatar fallback">{{ initial }}</span>
          <span class="name">{{ post.username }}</span>
        </div>
        <div class="like" :class="{ liked: post.liked }">
          <component :is="post.liked ? HeartFilledIcon : HeartIcon" size="14" />
          <span>{{ likeText }}</span>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.note-card {
  /* 透底:无独立背景框 */
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: transform 0.18s;

  &:hover {
    transform: translateY(-2px);
  }
}

.cover-wrap {
  position: relative;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: var(--td-bg-color-component);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);

  .multi-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    backdrop-filter: blur(4px);
  }
}

.text-cover {
  width: 100%;
  border-radius: 10px;
  padding: 22px 16px;
  background: linear-gradient(135deg, #ffe1e6 0%, #fff5d6 100%);
  min-height: 140px;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);

  p {
    margin: 0;
    color: #333;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.55;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
}

.body {
  padding: 8px 4px 4px;
}

.title {
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--td-text-color-primary);
  margin: 0 0 6px;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  gap: 8px;

  .author {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;

    .avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--td-brand-color-light);
      flex-shrink: 0;

      &.fallback {
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--td-brand-color);
        font-weight: 600;
        font-size: 10px;
      }
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .like {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;

    &.liked {
      color: var(--td-brand-color);
    }
  }
}
</style>
