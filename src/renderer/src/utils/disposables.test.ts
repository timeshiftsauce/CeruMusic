import { createDisposableBag } from './disposables'

describe('createDisposableBag', () => {
  it('should flush every registered cleanup once', () => {
    const bag = createDisposableBag()
    const first = jest.fn()
    const second = jest.fn()

    bag.add(first)
    bag.add(second)
    bag.flush()
    bag.flush()

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(bag.size).toBe(0)
  })

  it('should allow manual dispose without double cleanup on flush', () => {
    const bag = createDisposableBag()
    const cleanup = jest.fn()

    const dispose = bag.add(cleanup)
    dispose()
    bag.flush()

    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(bag.size).toBe(0)
  })

  it('should ignore empty cleanup registrations', () => {
    const bag = createDisposableBag()

    const dispose = bag.add()
    dispose()
    bag.flush()

    expect(bag.size).toBe(0)
  })
})
