import { httpFetch } from '../../request'
import { getGitcodeUrl, formatMusicItem, picUrl } from './config'

export default {
  sortList: [
    {
      name: '默认',
      id: 'default'
    }
  ],
  currentTagInfo: {
    id: undefined,
    info: undefined
  },

  getTags() {
    return Promise.resolve({
      hotTag: [],
      tags: [],
      source: 'git'
    })
  },

  getList(sortId, tagId, page) {
    return Promise.resolve({
      list: [
        {
          play_count: '',
          id: 'git_main',
          author: 'GitCode',
          name: '下架歌曲收录',
          img: picUrl,
          total: 0,
          desc: '来自 GitCode 仓库的音乐收藏',
          source: 'git'
        }
      ],
      total: 1,
      page: 1,
      limit: 30,
      source: 'git'
    })
  },

  async getListDetail(id, page) {
    const { body } = await httpFetch(getGitcodeUrl()).promise
    const list = (Array.isArray(body) ? body : []).map(formatMusicItem)

    return {
      list,
      page: 1,
      limit: 10000,
      total: list.length,
      source: 'git',
      info: {
        name: '下架歌曲收入',
        img: picUrl,
        desc: '来自 GitCode 仓库的音乐收藏',
        author: 'GitCode'
      }
    }
  },

  search(text, page, limit = 20) {
    return this.getListDetail('git_main', 1).then((result) => {
      const regex = new RegExp(
        text
          .split('')
          .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*'),
        'i'
      )
      const filtered = result.list.filter((item) => regex.test(item.name))
      return {
        list: [
          {
            play_count: '',
            id: 'git_main',
            author: 'GitCode',
            name: '下架歌曲收入',
            img: picUrl,
            total: filtered.length,
            desc: '来自 GitCode 仓库的音乐收藏',
            source: 'git'
          }
        ],
        limit,
        total: 1,
        source: 'git'
      }
    })
  },

  getDetailPageUrl(id) {
    return ''
  }
}
