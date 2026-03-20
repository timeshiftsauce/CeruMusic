/// <reference types="jest" />

jest.mock('naive-ui', () => ({
  NIcon: 'LegacyNIcon'
}))

import { renderLegacyIcon } from './legacyNaive'

describe('legacyNaive bridge', () => {
  it('should wrap icons through the legacy Naive bridge', () => {
    const icon = { name: 'MockIcon' } as any

    const render = renderLegacyIcon(icon)
    const vnode = render()

    expect(typeof render).toBe('function')
    expect(vnode.type).toBe('LegacyNIcon')
    expect(typeof (vnode.children as any).default).toBe('function')
  })
})
