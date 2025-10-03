<!--
  主题演示页面 - 展示暗色模式适配效果
-->
<template>
  <div class="theme-demo">
    <div class="demo-header">
      <h1 class="demo-title">主题演示</h1>
      <p class="demo-description">测试不同主题和暗色模式的效果</p>
    </div>

    <div class="demo-content">
      <!-- 主题选择器 -->
      <div class="demo-section">
        <h2 class="section-title">主题选择</h2>
        <ThemeSelector />
      </div>

      <!-- 组件演示 -->
      <div class="demo-section">
        <h2 class="section-title">组件演示</h2>

        <div class="component-grid">
          <!-- 按钮演示 -->
          <div class="component-item">
            <h3 class="component-title">按钮</h3>
            <div class="button-group">
              <button class="btn btn-primary">主要按钮</button>
              <button class="btn btn-secondary">次要按钮</button>
              <button class="btn btn-outline">轮廓按钮</button>
            </div>
          </div>

          <!-- 输入框演示 -->
          <div class="component-item">
            <h3 class="component-title">输入框</h3>
            <div class="input-group">
              <input type="text" class="input" placeholder="请输入内容" />
              <textarea class="textarea" placeholder="多行文本输入"></textarea>
            </div>
          </div>

          <!-- 卡片演示 -->
          <div class="component-item">
            <h3 class="component-title">卡片</h3>
            <div class="card">
              <div class="card-header">
                <h4 class="card-title">卡片标题</h4>
              </div>
              <div class="card-body">
                <p class="card-text">这是卡片内容，用于展示暗色模式下的效果。</p>
                <div class="card-actions">
                  <button class="btn btn-small btn-primary">操作</button>
                  <button class="btn btn-small btn-outline">取消</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 列表演示 -->
          <div class="component-item">
            <h3 class="component-title">列表</h3>
            <div class="list">
              <div class="list-item">
                <div class="list-content">
                  <div class="list-title">列表项 1</div>
                  <div class="list-description">这是列表项的描述文本</div>
                </div>
                <div class="list-action">
                  <button class="btn btn-small btn-outline">编辑</button>
                </div>
              </div>
              <div class="list-item">
                <div class="list-content">
                  <div class="list-title">列表项 2</div>
                  <div class="list-description">这是另一个列表项的描述</div>
                </div>
                <div class="list-action">
                  <button class="btn btn-small btn-outline">编辑</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 颜色演示 -->
      <div class="demo-section">
        <h2 class="section-title">颜色系统</h2>
        <div class="color-grid">
          <div class="color-item">
            <div class="color-swatch color-primary"></div>
            <span class="color-label">主色</span>
          </div>
          <div class="color-item">
            <div class="color-swatch color-success"></div>
            <span class="color-label">成功</span>
          </div>
          <div class="color-item">
            <div class="color-swatch color-warning"></div>
            <span class="color-label">警告</span>
          </div>
          <div class="color-item">
            <div class="color-swatch color-error"></div>
            <span class="color-label">错误</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ThemeSelector from '../components/ThemeSelector.vue'
</script>

<style scoped>
.theme-demo {
  min-height: 100vh;
  background: var(--td-bg-color-page);
  padding: 24px;
}

.demo-header {
  text-align: center;
  margin-bottom: 32px;
}

.demo-title {
  font-size: var(--td-font-size-headline-large);
  color: var(--td-text-color-primary);
  margin-bottom: 8px;
}

.demo-description {
  font-size: var(--td-font-size-body-large);
  color: var(--td-text-color-secondary);
}

.demo-content {
  max-width: 1200px;
  margin: 0 auto;
}

.demo-section {
  margin-bottom: 32px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-large);
  padding: 24px;
  border: 1px solid var(--td-border-level-1-color);
}

.section-title {
  font-size: var(--td-font-size-title-large);
  color: var(--td-text-color-primary);
  margin-bottom: 16px;
}

.component-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.component-item {
  padding: 16px;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
  border: 1px solid var(--td-border-level-1-color);
}

.component-title {
  font-size: var(--td-font-size-title-medium);
  color: var(--td-text-color-primary);
  margin-bottom: 12px;
}

/* 按钮样式 */
.button-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn {
  padding: 8px 16px;
  border-radius: var(--td-radius-medium);
  border: 1px solid transparent;
  font-size: var(--td-font-size-body-medium);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-small {
  padding: 4px 8px;
  font-size: var(--td-font-size-body-small);
}

.btn-primary {
  background: var(--td-brand-color);
  color: var(--td-text-color-anti);
  border-color: var(--td-brand-color);
}

.btn-primary:hover {
  background: var(--td-brand-color-hover);
}

.btn-secondary {
  background: var(--td-bg-color-component);
  color: var(--td-text-color-primary);
  border-color: var(--td-component-border);
}

.btn-secondary:hover {
  background: var(--td-bg-color-component-hover);
}

.btn-outline {
  background: transparent;
  color: var(--td-brand-color);
  border-color: var(--td-brand-color);
}

.btn-outline:hover {
  background: var(--td-brand-color-light);
}

/* 输入框样式 */
.input-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input,
.textarea {
  padding: 8px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  font-size: var(--td-font-size-body-medium);
}

.input:focus,
.textarea:focus {
  outline: none;
  border-color: var(--td-brand-color);
  box-shadow: 0 0 0 2px var(--td-brand-color-light);
}

.textarea {
  min-height: 80px;
  resize: vertical;
}

/* 卡片样式 */
.card {
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-border-level-1-color);
  border-radius: var(--td-radius-medium);
  overflow: hidden;
}

.card-header {
  padding: 16px;
  background: var(--td-bg-color-secondarycontainer);
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.card-title {
  font-size: var(--td-font-size-title-medium);
  color: var(--td-text-color-primary);
  margin: 0;
}

.card-body {
  padding: 16px;
}

.card-text {
  color: var(--td-text-color-secondary);
  margin-bottom: 16px;
}

.card-actions {
  display: flex;
  gap: 8px;
}

/* 列表样式 */
.list {
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-border-level-1-color);
  border-radius: var(--td-radius-medium);
  overflow: hidden;
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.list-item:last-child {
  border-bottom: none;
}

.list-item:hover {
  background: var(--td-bg-color-container-hover);
}

.list-title {
  font-size: var(--td-font-size-body-medium);
  color: var(--td-text-color-primary);
  font-weight: 500;
  margin-bottom: 4px;
}

.list-description {
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
}

/* 颜色演示 */
.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
}

.color-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.color-swatch {
  width: 60px;
  height: 60px;
  border-radius: var(--td-radius-medium);
  border: 1px solid var(--td-border-level-1-color);
}

.color-primary {
  background: var(--td-brand-color);
}

.color-success {
  background: var(--td-success-color);
}

.color-warning {
  background: var(--td-warning-color);
}

.color-error {
  background: var(--td-error-color);
}

.color-label {
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-secondary);
}
</style>
