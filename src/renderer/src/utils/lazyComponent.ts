import { defineAsyncComponent, type Component } from 'vue'

export const createLazyComponent = (loader: () => Promise<{ default: Component }>) =>
  defineAsyncComponent({
    loader,
    delay: 0,
    suspensible: false
  })
