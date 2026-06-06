import { defineStore } from 'pinia'

const MAX_SEARCH_HISTORY = 8

const normalizeKeyword = (value: string | number) => String(value || '').trim()

export const searchValue = defineStore('search', {
  state: () => ({
    value: '',
    focus: false,
    history: [] as string[]
  }),
  getters: {
    getValue: (state) => state.value,
    getFocus: (state) => state.focus,
    getHistory: (state) => state.history
  },
  actions: {
    setValue(value: string) {
      this.value = value
    },
    setFocus(focus: boolean) {
      this.focus = focus
    },
    addHistory(value: string | number) {
      const keyword = normalizeKeyword(value)
      if (!keyword) return
      this.history = [keyword, ...this.history.filter((item) => item !== keyword)].slice(
        0,
        MAX_SEARCH_HISTORY
      )
    },
    removeHistory(value: string | number) {
      const keyword = normalizeKeyword(value)
      this.history = this.history.filter((item) => item !== keyword)
    },
    clearHistory() {
      this.history = []
    }
  },
  persist: {
    key: 'ceru-search',
    pick: ['history']
  }
})
