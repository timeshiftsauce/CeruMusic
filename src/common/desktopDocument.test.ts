import { expect, test } from '@jest/globals'
import { isDesktopDocument } from './desktopDocument'

test('only the configured local document can claim desktop APIs', () => {
  const entry = 'file:///C:/app/out/renderer/index.html'
  expect(isDesktopDocument(entry + '#/settings', entry)).toBe(true)
  for (const target of ['file:///C:/else/index.html', 'file://server/C:/app/out/renderer/index.html', 'about:srcdoc', 'data:text/html,test', 'https://example.test/index.html'])
    expect(isDesktopDocument(target, entry)).toBe(false)
  expect(isDesktopDocument('http://localhost:5173/#/welcome', 'http://localhost:5173')).toBe(true)
  expect(isDesktopDocument('http://localhost:5174/', 'http://localhost:5173')).toBe(false)
  expect(isDesktopDocument('http://localhost:5173/other', 'http://localhost:5173')).toBe(false)
})
