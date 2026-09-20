# 我的第一个澜音插件

主站五节教程的完成版本：本地搜索、问候命令、存储计数和桌面抽屉。

需要 Node.js 22.12+；运行 npm install、npm run dev。
工作台在“能力注册”中执行 hello，并搜索晨光。示例不联网，也不提供播放地址。
重启开发服务后计数继续，开发数据保存在 .ceru-dev/storage 中。

安装需要澜音 2.0，1.14.1 使用 v1，无法安装本插件。
构建后在设置 → 插件管理中导入 dist/plugin.js，点击“使用”。
在“更多 → 问候计数”打开抽屉，点击“问候一次”，重启软件检查计数保留。
桌面与工作台数据独立；工作台直接测试 hello，不会生成桌面表单的底部提交按钮。

构建：npm run build；校验：npm run validate；成品：dist/plugin.js。

文件：src/index.ts 负责动作与存储，src/catalog.ts 负责搜索，ui/counter.json 描述抽屉，ceru.plugin.json 声明并连接这些功能。

教程：https://ceru.docs.shiqianjiang.cn/guide/plugins/v2/quick-start
