import { BrowserWindow } from 'electron'

export type RouteHandler = (mainWindow: BrowserWindow, url: string) => void

export class DeepLinkRouter {
  private routes: Map<string, RouteHandler> = new Map()

  /**
   * Register a route handler
   * @param route The route path to match (e.g., "oauth/callback")
   * @param handler The function to execute when the route matches
   */
  public get(route: string, handler: RouteHandler) {
    this.routes.set(route, handler)
  }

  /**
   * Handle a deep link URL
   * @param mainWindow The main browser window
   * @param url The deep link URL to handle
   * @returns true if a route was matched and handled, false otherwise
   */
  public match(mainWindow: BrowserWindow | null, url: string): boolean {
    if (!url.startsWith('cerumusic://')) return false
    if (!mainWindow) return false

    try {
      const parsed = new URL(url)
      // Construct a path-like string: host + pathname
      // e.g. cerumusic://oauth/callback -> host="oauth", pathname="/callback" -> "oauth/callback"
      const normalizedPath = `${parsed.host}${parsed.pathname}`.replace(/\/$/, '')

      for (const [route, handler] of this.routes.entries()) {
        // Match if the path equals the route or starts with it (for sub-paths)
        if (normalizedPath === route || normalizedPath.startsWith(route)) {
          // Common window actions for handled deep links
          if (mainWindow.isMinimized()) mainWindow.restore()
          if (!mainWindow.isVisible()) mainWindow.show()
          mainWindow.focus()

          handler(mainWindow, url)
          return true
        }
      }
    } catch (error) {
      console.error('Failed to parse deep link:', url, error)
    }

    return false
  }
}

export const deepLinkRouter = new DeepLinkRouter()
