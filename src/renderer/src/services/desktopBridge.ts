import type { DesktopBridge } from '../../../preload/index.d'

const take = typeof window !== 'undefined' ? window.ceruTakeDesktopBridge : undefined
export const desktopBridge = (take?.() ?? {}) as DesktopBridge
