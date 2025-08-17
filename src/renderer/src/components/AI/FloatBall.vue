<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const ball = ref<HTMLElement | null>(null)
const ballClass = ref('hidden-right') // 默认半隐藏
const showAskWindow = ref(false) // 控制ask窗口显示
const inputText = ref('')
const messages = ref<Array<{ type: 'user' | 'ai' | 'loading' | 'error'; content: string; html?: string }>>([])
const isLoading = ref(false) // 控制发送按钮的加载状态
const messagesContainer = ref<HTMLElement | null>(null)
let timer: number | null = null

// 显示悬浮球
const showBall = () => {
  ballClass.value = ''
  clearTimer()
}

// 开启自动隐藏
const startAutoHide = () => {
  clearTimer()
  timer = window.setTimeout(() => {
    ballClass.value = 'hidden-right'
  }, 3000) // 3 秒没操作缩回去
}

const clearTimer = () => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

// 点击悬浮球处理
const handleBallClick = () => {
  clearTimer()
  showAskWindow.value = true
  // 添加欢迎消息
  if (messages.value.length === 0) {
    const welcomeContent = '您好！我是AI助手，有什么可以帮助您的吗？ 您可以向我咨询音乐相关问题，我会尽力回答您的问题。'
    messages.value.push({
      type: 'ai',
      content: welcomeContent,
      html: DOMPurify.sanitize(marked(welcomeContent))
    })
  }
}

// 关闭ask窗口
const closeAskWindow = () => {
  showAskWindow.value = false
  // 重新开启悬浮球的自动隐藏
  startAutoHide()
}

// 发送消息
const sendMessage = async () => {
  if (!inputText.value.trim() || isLoading.value) return

  const userMessage = inputText.value
  inputText.value = ''
  isLoading.value = true // 设置加载状态

  // 添加用户消息
  messages.value.push({
    type: 'user',
    content: userMessage,
    html: DOMPurify.sanitize(marked(userMessage))
  })
  scrollToBottom()

  // 添加加载状态
  messages.value.push({
    type: 'loading',
    content: 'AI正在思考中...',
    html: 'AI正在思考中...'
  })
  scrollToBottom()

  try {
    // 调用真实的AI API
    const response = await window.api.ai.ask(userMessage)

    // 移除加载消息
    messages.value = messages.value.filter((msg) => msg.type !== 'loading')

    // 从响应中提取content字段的文本数据
    let aiContent = '抱歉，我暂时无法回答您的问题。'

    if (response) {
      // 处理不同的响应数据结构
      if (typeof response === 'string') {
        aiContent = response
      } else if (response.content && typeof response.content === 'string') {
        aiContent = response.content
      } else if (
        response.data &&
        response.data.content &&
        typeof response.data.content === 'string'
      ) {
        aiContent = response.data.content
      } else if (response.message && typeof response.message === 'string') {
        aiContent = response.message
      } else {
        console.warn('AI API响应格式异常:', response)
        aiContent = '抱歉，AI回复格式异常，请稍后再试。'
      }
    }

    // 添加AI回复
    messages.value.push({
      type: 'ai',
      content: aiContent,
      html: DOMPurify.sanitize(marked(aiContent))
    })
  } catch (error) {
    // 移除加载消息
    messages.value = messages.value.filter((msg) => msg.type !== 'loading')

    // 添加错误消息
    const errorContent = `发送失败: ${error.message || '未知错误'}`
    messages.value.push({
      type: 'error',
      content: errorContent,
      html: DOMPurify.sanitize(marked(errorContent))
    })
    console.error('AI API调用失败:', error)
  } finally {
    isLoading.value = false // 重置加载状态
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

// 初始化时就开启定时隐藏
onMounted(() => {
  startAutoHide()
})

onBeforeUnmount(() => {
  clearTimer()
})
</script>

<template>
  <div>
    <!-- 悬浮球 -->
    <transition name="ball-fade" appear>
      <div
        v-show="!showAskWindow"
        ref="ball"
        class="float-ball"
        :class="ballClass"
        @mouseenter="showBall"
        @mouseleave="startAutoHide"
        @click="handleBallClick"
      >
        <!-- <slot>悬浮</slot> -->
        <video autoplay muted loop src="../../assets/videos/AI.mp4" />
      </div>
    </transition>

    <!-- Ask窗口 -->
    <transition name="window-scale" appear>
      <div v-show="showAskWindow" class="ask-window">
        <div class="ask-header">
          <h3>AI助手</h3>
          <button class="close-btn" @click="closeAskWindow">×</button>
        </div>
        <div class="ask-content">
          <div class="chat-messages" ref="messagesContainer">
            <div
              v-for="(message, index) in messages"
              :key="index"
              class="message"
              :class="message.type"
            >
              <div class="message-content" v-html="message.html || message.content"></div>
            </div>
          </div>
        </div>
        <div class="input-area">
          <input
            v-model="inputText"
            @keyup.enter="sendMessage"
            placeholder="请输入您的问题..."
            class="message-input"
          />
          <button @click="sendMessage" class="send-btn" :disabled="!inputText.trim() || isLoading">
            {{ isLoading ? '发送中...' : '发送' }}
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.float-ball {
  position: fixed;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  overflow: hidden;
  right: 16px; /* 固定右边 16px */
  bottom: calc(86px + 16px); /* 固定底部 86px */
  transition: all 0.3s;
  user-select: none;
  z-index: 10000;
  padding: 2px;
  background-image: linear-gradient(45deg, #409eff, #ff6600);
}

/* 半隐藏，用 transform 偏移一半宽度 */
.float-ball.hidden-right {
  transform: translateX(calc(66px));
}

video {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
}

/* Ask窗口样式 */
.ask-window {
  position: fixed;
  right: 20px;
  bottom: 102px;
  width: 400px;
  height: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
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
    right: 10px;
    bottom: 10px;
    left: 10px;
    width: auto;
    height: 60vh;
  }
}
</style>
