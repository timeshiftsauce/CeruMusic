import { handleRequest } from './handlers.js'

export interface Env {
  GITHUB_REPO?: string
  GITHUB_TOKEN?: string
  RELEASE_CACHE_TTL?: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx)
  }
}
