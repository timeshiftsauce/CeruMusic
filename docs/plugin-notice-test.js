// 测试插件通知功能的示例插件
// 这个文件可以用来测试 NoticeCenter 功能

const pluginInfo = {
  name: "测试通知插件",
  version: "1.0.0",
  author: "CeruMusic Team",
  description: "用于测试插件通知功能的示例插件",
  type: "cr"
}

const sources = [
  {
    name: "test",
    qualities: ["128k", "320k"]
  }
]

// 模拟音乐URL获取函数
async function musicUrl(source, musicInfo, quality) {
  console.log('测试插件：获取音乐URL')
  
  // 测试不同类型的通知
  setTimeout(() => {
    // 测试信息通知
    this.cerumusic.NoticeCenter('info', {
      title: '信息通知',
      message: '这是一个信息通知测试',
      content: '插件正在正常工作'
    })
  }, 1000)
  
  setTimeout(() => {
    // 测试警告通知
    this.cerumusic.NoticeCenter('warning', {
      title: '警告通知',
      message: '这是一个警告通知测试',
      content: '请注意某些设置'
    })
  }, 2000)
  
  setTimeout(() => {
    // 测试成功通知
    this.cerumusic.NoticeCenter('success', {
      title: '成功通知',
      message: '操作已成功完成',
      content: '音乐URL获取成功'
    })
  }, 3000)
  
  setTimeout(() => {
    // 测试更新通知
    this.cerumusic.NoticeCenter('update', {
      title: '插件更新',
      message: '发现新版本 v2.0.0，是否立即更新？',
      url: 'https://example.com/plugin-update.js',
      version: '2.0.0',
      pluginInfo: {
        name: '测试通知插件',
        type: 'cr',
        forcedUpdate: false
      }
    })
  }, 4000)
  
  setTimeout(() => {
    // 测试错误通知
    this.cerumusic.NoticeCenter('error', {
      title: '错误通知',
      message: '这是一个错误通知测试',
      error: '模拟的错误信息'
    })
  }, 5000)
  
  // 返回一个测试URL
  return 'https://example.com/test-music.mp3'
}

// 导出插件
module.exports = {
  pluginInfo,
  sources,
  musicUrl
}