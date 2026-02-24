# 性能验证与对比素材（采集指引）

- Lighthouse 首屏指标：在 Electron 渲染进程 DevTools 中采集并截图。
- DevTools Memory：滚动 5s 前后进行 Heap Snapshot 对比并截图。
- Network 面板：快速滚动 5s 后无多余 pending 请求截图。
- CPU：任务管理器 + DevTools Performance 采样，主进程 CPU 峰值 < 15%。

> 注：采集后将截图放置在 `docs/assets/` 并附加到项目 Wiki 或 README。
