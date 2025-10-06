import { defineStore } from 'pinia'

export const searchValue = defineStore('search', {
  state: () => ({
    value: '',
    focus: false
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
    }
  },
  persist: false
})
