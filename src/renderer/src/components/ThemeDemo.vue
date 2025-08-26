<template>
  <div class="theme-demo">
    <div class="demo-header">
      <h1 class="demo-title">主题切换演示</h1>
      <ThemeSelector />
    </div>
    
    <div class="demo-content">
      <div class="demo-card">
        <h3 class="card-title">主要功能</h3>
        <p class="card-text">这是一个现代化的主题切换组件，支持多种预设主题色。</p>
        <button class="btn btn-primary">主要按钮</button>
      </div>
      
      <div class="demo-card">
        <h3 class="card-title">设计特点</h3>
        <ul class="feature-list">
          <li>简约美观的界面设计</li>
          <li>平滑的过渡动画效果</li>
          <li>响应式布局适配</li>
          <li>深色模式支持</li>
        </ul>
      </div>
      
      <div class="demo-card">
        <h3 class="card-title">交互元素</h3>
        <div class="demo-controls">
          <input type="text" class="form-control" placeholder="输入框示例" />
          <button class="btn btn-secondary">次要按钮</button>
          <a href="#" class="demo-link">链接示例</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import ThemeSelector from './ThemeSelector.vue'
</script>

<style scoped>
.theme-demo {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
}

.demo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--td-component-border);
}

.demo-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--td-text-color-primary);
  margin: 0;
}

.demo-content {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.demo-card {
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  padding: 24px;
  box-shadow: var(--td-shadow-1);
}

.card-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  margin: 0 0 12px 0;
}

.card-text {
  color: var(--td-text-color-secondary);
  line-height: 1.6;
  margin-bottom: 16px;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.feature-list li {
  color: var(--td-text-color-secondary);
  padding: 8px 0;
  position: relative;
  padding-left: 20px;
}

.feature-list li::before {
  content: '•';
  color: var(--td-brand-color);
  font-weight: bold;
  position: absolute;
  left: 0;
}

.demo-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn {
  padding: 10px 16px;
  border-radius: var(--td-radius-medium);
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  display: inline-block;
  text-align: center;
}

.btn-primary {
  background-color: var(--td-brand-color);
  border-color: var(--td-brand-color);
  color: white;
}

.btn-primary:hover {
  background-color: var(--td-brand-color-hover);
  border-color: var(--td-brand-color-hover);
}

.btn-secondary {
  background-color: var(--td-bg-color-component);
  border-color: var(--td-component-border);
  color: var(--td-text-color-primary);
}

.btn-secondary:hover {
  background-color: var(--td-bg-color-component-hover);
  border-color: var(--td-component-border);
}

.form-control {
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background-color: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  font-size: 14px;
  transition: all 0.2s ease;
}

.form-control:focus {
  outline: none;
  border-color: var(--td-brand-color);
  box-shadow: 0 0 0 3px var(--td-brand-color-light);
}

.demo-link {
  color: var(--td-brand-color);
  text-decoration: none;
  font-weight: 500;
}

.demo-link:hover {
  color: var(--td-brand-color-hover);
  text-decoration: underline;
}

@media (max-width: 640px) {
  .demo-header {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }
  
  .demo-content {
    grid-template-columns: 1fr;
  }
  
  .demo-controls {
    gap: 16px;
  }
}
</style>