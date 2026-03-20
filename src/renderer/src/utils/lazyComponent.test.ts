import { defineAsyncComponent } from 'vue'
import { createLazyComponent } from './lazyComponent'

jest.mock('vue', () => ({
  defineAsyncComponent: jest.fn((options) => options)
}))

describe('lazyComponent utils', () => {
  it('should create async components with zero-delay loading fallback', () => {
    const loader = jest.fn(async () => ({ default: {} }))

    const component = createLazyComponent(loader)

    expect(defineAsyncComponent).toHaveBeenCalledTimes(1)
    expect(component).toMatchObject({
      loader,
      delay: 0,
      suspensible: false
    })
  })
})
