<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Loading as TLoading } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/store/Settings'

const userStore = LocalUserDetailStore()
const settingsStore = useSettingsStore()
const { userInfo } = storeToRefs(userStore)
const { settings } = storeToRefs(settingsStore)

const ball = ref<HTMLElement | null>(null)
const ballClass = ref('hidden-right') // 默认半隐藏
const showAskWindow = ref(false) // 控制ask窗口显示
const inputText = ref('')
const messages = ref<
  Array<{ type: 'user' | 'ai' | 'loading' | 'error'; content: string; html?: string }>
>([])
const isLoading = ref(false) // 控制发送按钮的加载状态
const messagesContainer = ref<HTMLElement | null>(null)
let timer: number | null = null

// 拖拽相关状态
const isDragging = ref(false)
const hasDragged = ref(false) // 是否拖动过
const ballPosition = ref({ x: 0, y: 0 }) // 悬浮球位置
const isOnLeft = ref(false) // 是否在左侧
const dragOffset = ref({ x: 0, y: 0 }) // 拖拽偏移量
const windowSize = ref({ width: 0, height: 0 }) // 窗口尺寸

// 显示悬浮球
// 悬浮球可见性控制
const isFloatBallVisible = ref(settings.value.showFloatBall !== false) // 默认显示，除非明确设置为false
const isHovering = ref(false)

const showBall = () => {
  ballClass.value = ''
  clearTimer()
}

// 关闭悬浮球
const closeBall = (e: MouseEvent) => {
  e.stopPropagation() // 阻止事件冒泡
  isFloatBallVisible.value = false
  settingsStore.updateSettings({ showFloatBall: false })
}

// 鼠标进入悬浮球
const handleMouseEnter = () => {
  isHovering.value = true
  showBall()
}

// 鼠标离开悬浮球
const handleMouseLeave = () => {
  isHovering.value = false
  startAutoHide()
}

// 开启自动隐藏
const startAutoHide = () => {
  clearTimer()
  timer = window.setTimeout(() => {
    ballClass.value = isOnLeft.value ? 'hidden-left' : 'hidden-right'
  }, 3000) // 3 秒没操作缩回去
}

const clearTimer = () => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

// 拖拽开始
const handleMouseDown = (e: MouseEvent) => {
  if (showAskWindow.value) return // 聊天窗口打开时不允许拖拽

  isDragging.value = true
  hasDragged.value = false
  clearTimer()

  const rect = ball.value?.getBoundingClientRect()
  if (rect) {
    dragOffset.value = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  e.preventDefault()
}

// 拖拽过程中
const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return
  hasDragged.value = true // 鼠标移动过就算拖拽

  const x = e.clientX - dragOffset.value.x
  const y = e.clientY - dragOffset.value.y

  // 限制在屏幕范围内，底部边界为 height - 196，考虑外层容器尺寸120px
  const maxX = windowSize.value.width - 120
  const maxY = windowSize.value.height - 176
  const minY = 90 // 顶部边界限制，不允许进入顶部90px区域

  ballPosition.value = {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(minY, Math.min(y, maxY))
  }
}

// 拖拽结束
const handleMouseUp = () => {
  if (!isDragging.value) return

  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)

  if (hasDragged.value) {
    // 自动吸边逻辑
    const centerX = ballPosition.value.x + 60 // 悬浮球中心点
    const screenCenter = windowSize.value.width / 2

    if (centerX < screenCenter) {
      // 吸附到左边
      ballPosition.value.x = 6
      isOnLeft.value = true
      ballClass.value = 'hidden-left'
    } else {
      // 吸附到右边
      ballPosition.value.x = windowSize.value.width - 106
      isOnLeft.value = false
      ballClass.value = 'hidden-right'
    }
    // 保存位置到本地存储
    saveBallPosition()
    clearTimer()
    startAutoHide()
  }
}

// 检查API Key是否已配置
const checkAPIKey = async (): Promise<boolean> => {
  if (!userInfo.value.deepseekAPIkey) {
    const errorMessage =
      '请先配置 DeepSeek API Key 才能使用 AI 功能。\n\n请前往 设置 → DeepSeek API Key 配置 进行设置。'
    messages.value.push({
      type: 'error',
      content: errorMessage,
      html: DOMPurify.sanitize(await marked(errorMessage))
    })
    return false
  }
  clearErrorMessages()
  return true
}

// 清除错误消息
const clearErrorMessages = () => {
  messages.value = messages.value.filter((msg) => msg.type !== 'error')
}

// 点击悬浮球处理
const handleBallClick = async () => {
  // 如果刚刚拖拽过，不触发点击事件
  if (hasDragged.value) {
    hasDragged.value = false
    return
  }

  clearTimer()
  showAskWindow.value = true

  if (!(await checkAPIKey())) {
    return
  }

  if (messages.value.length === 0) {
    const welcomeContent =
      '您好！我是AI助手，有什么可以帮助您的吗？ 您可以向我咨询音乐相关问题，我会尽力回答您的问题。'
    messages.value.push({
      type: 'ai',
      content: welcomeContent,
      html: DOMPurify.sanitize(await marked(welcomeContent))
    })
  }
}

// 关闭ask窗口
const closeAskWindow = () => {
  showAskWindow.value = false
  startAutoHide()
}

// 生成唯一的流ID
const generateStreamId = () => {
  return 'stream_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
}

// 发送消息（流式版本）
const sendMessage = async () => {
  if (!inputText.value.trim() || isLoading.value) return

  if (!(await checkAPIKey())) {
    return
  }

  const userMessage = inputText.value
  inputText.value = ''
  isLoading.value = true

  messages.value.push({
    type: 'user',
    content: userMessage,
    html: DOMPurify.sanitize(await marked(userMessage))
  })
  scrollToBottom()

  const aiMessageIndex = messages.value.length
  messages.value.push({
    type: 'loading',
    content: '正在思考中...',
    html: ''
  })
  scrollToBottom()

  const streamId = generateStreamId()
  let aiContent = ''

  try {
    const handleStreamChunk = async (data: { streamId: string; chunk: string }) => {
      if (data.streamId === streamId) {
        aiContent += data.chunk
        messages.value[aiMessageIndex] = {
          type: 'ai',
          content: aiContent,
          html: DOMPurify.sanitize(await marked(aiContent))
        }
        scrollToBottom()
      }
    }

    const handleStreamEnd = (data: { streamId: string }) => {
      if (data.streamId === streamId) {
        isLoading.value = false
        window.api.ai.removeStreamListeners()
      }
    }

    const handleStreamError = async (data: { streamId: string; error: string }) => {
      if (data.streamId === streamId) {
        console.error('AI流式响应错误:', data.error)
        if (!aiContent) {
          messages.value[aiMessageIndex] = {
            type: 'error',
            content: `发送失败: ${data.error}`,
            html: DOMPurify.sanitize(await marked(`发送失败: ${data.error}`))
          }
        }
        isLoading.value = false
        window.api.ai.removeStreamListeners()
      }
    }

    window.api.ai.onStreamChunk(handleStreamChunk)
    window.api.ai.onStreamEnd(handleStreamEnd)
    window.api.ai.onStreamError(handleStreamError)

    await window.api.ai.askStream(userMessage, streamId)
  } catch (error: any) {
    console.error('AI流式API调用失败:', error)
    if (!aiContent) {
      messages.value[aiMessageIndex] = {
        type: 'error',
        content: `发送失败: ${(error as Error).message || '未知错误'}`,
        html: DOMPurify.sanitize(
          await marked(`发送失败: ${(error as Error).message || '未知错误'}`)
        )
      }
    }
    isLoading.value = false
    window.api.ai.removeStreamListeners()
  }

  scrollToBottom()
}

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 监听API Key配置状态变化
watch(
  () => userInfo.value.deepseekAPIkey,
  async (newKey, oldKey) => {
    if (!oldKey && newKey) {
      clearErrorMessages()
      if (showAskWindow.value && messages.value.length === 0) {
        const welcomeContent =
          '您好！我是AI助手，有什么可以帮助您的吗？ 您可以向我咨询音乐相关问题，我会尽力回答您的问题。'
        messages.value.push({
          type: 'ai',
          content: welcomeContent,
          html: DOMPurify.sanitize(await marked(welcomeContent))
        })
        scrollToBottom()
      }
    }
  },
  { immediate: false }
)

// 监听设置变化，更新悬浮球可见性
watch(
  () => settings.value.showFloatBall,
  (newValue) => {
    isFloatBallVisible.value = newValue
  },
  { immediate: true }
)

// 更新窗口尺寸
const updateWindowSize = () => {
  windowSize.value = {
    width: window.innerWidth,
    height: window.innerHeight
  }
}

// 保存悬浮球位置到本地存储
const saveBallPosition = () => {
  const positionData = {
    x: ballPosition.value.x,
    y: ballPosition.value.y,
    isOnLeft: isOnLeft.value
  }
  localStorage.setItem('floatBallPosition', JSON.stringify(positionData))
}

// 从本地存储加载悬浮球位置
const loadBallPosition = () => {
  try {
    const savedPosition = localStorage.getItem('floatBallPosition')
    if (savedPosition) {
      const positionData = JSON.parse(savedPosition)
      ballPosition.value = {
        x: positionData.x,
        y: positionData.y
      }
      isOnLeft.value = positionData.isOnLeft
    } else {
      // 如果没有保存过位置，使用默认位置
      setDefaultPosition()
    }
  } catch (error) {
    console.error('加载悬浮球位置失败:', error)
    setDefaultPosition()
  }
}

// 设置默认位置
const setDefaultPosition = () => {
  updateWindowSize()
  ballPosition.value = {
    x: windowSize.value.width - 126, // 考虑外层容器尺寸120px
    y: windowSize.value.height - 176
  }
  isOnLeft.value = false
}

// 初始化悬浮球位置
const initBallPosition = () => {
  updateWindowSize()
  loadBallPosition()
}

// 定义 handleResize 函数
const handleResize = () => {
  updateWindowSize()
  // 保证悬浮球不超出边界
  const maxX = windowSize.value.width - 120
  const maxY = windowSize.value.height - 176
  const minY = 90 // 顶部边界限制

  // 如果悬浮球在右侧，随窗口宽度变化更新位置
  if (!isOnLeft.value) {
    // 重新计算右侧位置
    ballPosition.value.x = windowSize.value.width - 106
  }

  // 确保位置在有效范围内
  ballPosition.value.x = Math.max(0, Math.min(ballPosition.value.x, maxX))
  ballPosition.value.y = Math.max(minY, Math.min(ballPosition.value.y, maxY))
}

onMounted(() => {
  initBallPosition()
  startAutoHide()
  handleResize()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  clearTimer()
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  window.removeEventListener('resize', handleResize)
  saveBallPosition() // 保存位置
})
</script>

<!-- 下面 template + style 原封不动保持 -->
<template>
  <div>
    <!-- 悬浮球容器 -->
    <transition name="ball-fade" appear>
      <div
        v-show="!showAskWindow && isFloatBallVisible"
        ref="ball"
        class="float-ball-container"
        :class="{ dragging: isDragging }"
        :style="{
          left: ballPosition.x - 10 + 'px',
          top: ballPosition.y - 10 + 'px',
          right: 'auto',
          bottom: 'auto'
        }"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
        @mousedown="handleMouseDown"
      >
        <!-- 悬浮球 -->
        <div
          class="float-ball"
          :class="[ballClass, { hovering: isHovering }]"
          @click="handleBallClick"
        >
          <video autoplay muted loop src="../../assets/videos/AI.mp4" />
        </div>
        <!-- 关闭按钮 -->
        <div v-show="isHovering" class="close-ball-btn" @click="closeBall" @mousedown.stop>
          <i class="iconfont icon-guanbi"></i>
        </div>
      </div>
    </transition>

    <!-- Ask窗口 -->
    <transition name="window-scale" appear>
      <div
        v-show="showAskWindow"
        class="ask-window"
        :class="{ 'on-left': isOnLeft }"
        :style="{
          left: isOnLeft ? ballPosition.x + 120 + 'px' : 'auto',
          right: isOnLeft ? 'auto' : windowSize.width - ballPosition.x + 20 + 'px',
          bottom: Math.max(20, 176) + 'px'
        }"
      >
        <div class="ask-header">
          <h3>AI助手</h3>
          <button class="close-btn" @click="closeAskWindow">×</button>
        </div>
        <div class="ask-content">
          <div ref="messagesContainer" class="chat-messages">
            <div
              v-for="(message, index) in messages"
              :key="index"
              class="message"
              :class="message.type"
            >
              <div v-if="message.type === 'loading'" class="message-content loading-content">
                <t-loading size="small" />
                <span class="loading-text">{{ message.content }}</span>
              </div>
              <div v-else class="message-content" v-html="message.html || message.content"></div>
            </div>
          </div>
        </div>
        <div class="input-area">
          <input
            v-model="inputText"
            placeholder="请输入您的问题..."
            class="message-input"
            @keyup.enter="sendMessage"
          />
          <button class="send-btn" :disabled="!inputText.trim() || isLoading" @click="sendMessage">
            {{ isLoading ? '发送中...' : '发送' }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
/* 悬浮球外层容器 */
.float-ball-container {
  position: fixed;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  transition: all 0.3s;
  user-select: none;
}

.float-ball {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s;
  padding: 2px;
  background-image: linear-gradient(45deg, #409eff, #ff6600);
}

/* 拖拽状态 */
.float-ball-container.dragging {
  transition: none;
  z-index: 10001;
}

.float-ball-container.dragging .float-ball {
  cursor: grabbing;
}

/* 半隐藏，用 transform 偏移一半宽度 */
.float-ball.hidden-right {
  transform: translateX(calc(66px));
}

.float-ball.hidden-left {
  transform: translateX(calc(-66px));
}

video {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
}

/* 关闭按钮样式 */
.close-ball-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 32px;
  height: 32px;
  background: #ff4757;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10002;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(255, 71, 87, 0.3);
}

.close-ball-btn:hover {
  background: #ff3742;
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(255, 71, 87, 0.4);
}

.close-ball-btn .iconfont {
  font-size: 16px;
  color: #fff;
  line-height: 1;
}

/* 悬浮球hover状态 */
.float-ball.hovering {
  transform: scale(1.05);
}

/* Ask窗口样式 */
.ask-window {
  position: fixed;
  width: 400px;
  height: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s ease;
}

/* 当悬浮球在左侧时的窗口样式 */
.ask-window.on-left {
  transform-origin: left center;
}

.ask-window:not(.on-left) {
  transform-origin: right center;
}

.ask-header {
  background: linear-gradient(45deg, #409eff, #ff6600);
  color: #fff;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ask-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.ask-content {
  display: flex;
  flex-direction: column;
  height: 350px;
}

.chat-messages {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background: #f8f9fa;
}

.message {
  margin-bottom: 16px;
  display: flex;
}

.message.user {
  justify-content: flex-end;
}

.message.ai {
  justify-content: flex-start;
}

.message-content {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.4;
}

.message.user .message-content {
  background: #409eff;
  color: #fff;
}

.message.ai .message-content {
  background: #fff;
  color: #333;
  border: 1px solid #e0e0e0;
}

.message.loading .message-content {
  background: #f0f0f0;
  color: #666;
  font-style: italic;
  border: 1px solid #ddd;
}

.loading-content {
  display: flex;
  align-items: center;
  gap: 8px;
}

.loading-text {
  font-size: 14px;
  color: #666;
}

.message.error .message-content {
  background: #fee;
  color: #d63031;
  border: 1px solid #fab1a0;
}

.input-area {
  padding: 20px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 12px;
  background: #fff;
}

.message-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 24px;
  outline: none;
  font-size: 14px;
  transition: border-color 0.2s;
}

.message-input:focus {
  border-color: #409eff;
}

.send-btn {
  padding: 12px 24px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.send-btn:hover:not(:disabled) {
  background: #3a8ee6;
}

.send-btn:disabled {
  background: #c0c4cc;
  cursor: not-allowed;
  opacity: 0.6;
}

/* 悬浮球动画 */
.ball-fade-enter-active,
.ball-fade-leave-active {
  transition: all 0.3s ease;
}

.ball-fade-enter-from,
.ball-fade-leave-to {
  opacity: 0;
  transform: scale(0.8) translateX(calc(56px));
}

.ball-fade-enter-to,
.ball-fade-leave-from {
  opacity: 1;
  transform: scale(1);
}

/* Ask窗口动画 */
.window-scale-enter-active,
.window-scale-leave-active {
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.window-scale-enter-from,
.window-scale-leave-to {
  opacity: 0;
  transform: scale(0.7) translateY(20px);
}

.window-scale-enter-to,
.window-scale-leave-from {
  opacity: 1;
  transform: scale(1) translateY(0);
}

/* Markdown 渲染样式 - 现代化设计 */
.message-content {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
  color: #2c3e50;
  line-height: 1.7;
}

/* 标题样式 */
.message-content h1,
.message-content h2,
.message-content h3,
.message-content h4,
.message-content h5,
.message-content h6 {
  margin: 1.2em 0 0.8em 0;
  font-weight: 700;
  color: #1a202c;
  letter-spacing: -0.025em;
  position: relative;
}

.message-content h1 {
  font-size: 1.875rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.message-content h2 {
  font-size: 1.5rem;
  color: #2d3748;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0.5rem;
}

.message-content h3 {
  font-size: 1.25rem;
  color: #4a5568;
}

.message-content h4,
.message-content h5,
.message-content h6 {
  font-size: 1.125rem;
  color: #718096;
}

/* 段落样式 */
.message-content p {
  margin: 1em 0;
  line-height: 1.8;
  color: #4a5568;
}

/* 列表样式 */
.message-content ul,
.message-content ol {
  margin: 1em 0;
  padding-left: 2em;
}

.message-content li {
  margin: 0.5em 0;
  line-height: 1.6;
}

.message-content ul li {
  position: relative;
}

.message-content ul li::marker {
  color: #667eea;
}

/* 引用块样式 */
.message-content blockquote {
  margin: 1.5em 0;
  padding: 1.25rem 1.5rem;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  border-left: 4px solid #667eea;
  border-radius: 0 8px 8px 0;
  font-style: italic;
  position: relative;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
}

.message-content blockquote::before {
  content: '"';
  position: absolute;
  top: -10px;
  left: 10px;
  font-size: 3rem;
  color: #667eea;
  opacity: 0.3;
  font-family: Georgia, serif;
}

/* 行内代码样式 */
.message-content code {
  background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
  color: #e53e3e;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Consolas', monospace;
  font-size: 0.875em;
  font-weight: 600;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* 代码块样式 */
.message-content pre {
  background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%);
  color: #e2e8f0;
  padding: 1.5rem;
  border-radius: 12px;
  overflow-x: auto;
  margin: 1.5em 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  border: 1px solid #4a5568;
  position: relative;
}

.message-content pre::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px 12px 0 0;
}

.message-content pre code {
  background: none;
  color: inherit;
  padding: 0;
  border: none;
  box-shadow: none;
  font-size: 0.875rem;
  font-weight: 400;
}

/* 强调文本样式 */
.message-content strong {
  font-weight: 700;
  color: #2d3748;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  padding: 0.1em 0.3em;
  border-radius: 4px;
}

.message-content em {
  font-style: italic;
  color: #4a5568;
  position: relative;
}

/* 链接样式 */
.message-content a {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-bottom: 2px solid transparent;
}

.message-content a:hover {
  color: #5a67d8;
  border-bottom-color: #667eea;
  transform: translateY(-1px);
}

.message-content a::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 2px;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s ease;
}

.message-content a:hover::after {
  width: 100%;
}

/* 表格样式 */
.message-content table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  margin: 1.5em 0;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
}

.message-content th,
.message-content td {
  padding: 1rem 1.25rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

.message-content th {
  background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
  font-weight: 700;
  color: #2d3748;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.message-content tbody tr {
  transition: background-color 0.2s ease;
}

.message-content tbody tr:nth-child(even) {
  background: rgba(247, 250, 252, 0.5);
}

.message-content tbody tr:hover {
  background: rgba(102, 126, 234, 0.05);
  transform: scale(1.01);
  transition: all 0.2s ease;
}

.message-content tbody tr:last-child td {
  border-bottom: none;
}

/* 分隔线样式 */
.message-content hr {
  margin: 2rem 0;
  border: none;
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, #e2e8f0 50%, transparent 100%);
}

/* 响应式设计 */
@media (max-width: 480px) {
  .ask-window {
    left: 10px !important;
    right: 10px !important;
    bottom: 10px !important;
    width: auto !important;
    height: 60vh;
  }

  .float-ball {
    width: 80px;
    height: 80px;
  }

  .float-ball.hidden-right {
    transform: translateX(calc(50px));
  }

  .float-ball.hidden-left {
    transform: translateX(calc(-50px));
  }
}
</style>
