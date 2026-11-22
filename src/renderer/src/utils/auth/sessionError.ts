/** Only missing credentials or a rejected refresh token prove that the local session is gone. */
export function isInvalidLogtoSession(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: unknown; code?: unknown }
  return (
    (name === 'LogtoClientError' && code === 'not_authenticated') ||
    (name === 'LogtoRequestError' && code === 'invalid_grant')
  )
}
