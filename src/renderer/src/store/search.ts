import { defineStore } from 'pinia'

/** 搜索历史最多保留条数 */
export const SEARCH_HISTORY_LIMIT = 10

export const searchValue = defineStore('search', {
  state: () => ({
    value: '',
    focus: false,
    /** 搜索历史,最新在前 */
    history: [] as string[]
  }),
  getters: {
    getValue: (state) => state.value,
    getFocus: (state) => state.focus
  },
  actions: {
    setValue(value: string) {
      this.value = value
    },
    setFocus(focus: boolean) {
      this.focus = focus
    },
    /** 记录一次搜索:去重后置顶,最多保留 SEARCH_HISTORY_LIMIT 条 */
    addHistory(keyword: string) {
      const kw = keyword.trim()
      if (!kw) return
      this.history = [kw, ...this.history.filter((item) => item !== kw)].slice(
        0,
        SEARCH_HISTORY_LIMIT
      )
    },
    /** 清空搜索历史 */
    clearHistory() {
      this.history = []
    }
  },
  /**
   * pinia-plugin-persistedstate@4.x 配置:
   *   - 用 `pick` 只持久化搜索历史,`value`/`focus` 是即时输入状态,不落盘
   *   - `key` 显式指定,避免与其他 store 冲突
   */
  persist: {
    key: 'ceru-search-history',
    pick: ['history']
  }
})
