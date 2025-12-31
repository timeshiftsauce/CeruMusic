import { UserInfoResponse } from '@logto/browser'
function displayName(user: UserInfoResponse | null) {
  if (!user) {
    return '用户名'
  }
  const { name, username, nickname } = user
  return name || username || (nickname as string) || '用户名'
}
export default displayName
