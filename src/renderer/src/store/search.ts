import { defineStore } from 'pinia'

export const searchValue = defineStore('search', {
  state: () => ({
    value: ''
  }),
  getters: {
    getValue: (state) => state.value
  },
  actions: {
    setValue(value: string) {
      this.value = value
    }
  }
})
