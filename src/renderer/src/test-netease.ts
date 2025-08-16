// 测试网易云音乐服务的IPC通信
export async function testNeteaseService() {
  try {
    console.log('开始测试网易云音乐服务...')
    
    // 测试搜索功能
    const searchResult = await window.api.netease.search({
      type: 1,
      keyword: '周杰伦',
      limit: 10,
      offset: 0
    })
    console.log('搜索结果:', searchResult)
    
    // 如果搜索成功且有结果，测试获取歌曲详情
    if (searchResult && searchResult.songs && searchResult.songs.length > 0) {
      const songId = searchResult.songs[0].id
      const songDetail = await window.api.netease.getSongDetail({
        ids: [songId.toString()]
      })
      console.log('歌曲详情:', songDetail)
      
      // 测试获取歌词
      const lyric = await window.api.netease.getLyric({
        id: songId.toString()
      })
      console.log('歌词:', lyric)
    }
    
    console.log('网易云音乐服务测试完成!')
    return true
  } catch (error) {
    console.error('网易云音乐服务测试失败:', error)
    return false
  }
}