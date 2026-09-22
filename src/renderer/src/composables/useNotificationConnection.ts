import { onBeforeUnmount, watch } from 'vue'
import { CERU_API_RESOURCE } from '@common/api/resources'
import { SocketRequest } from '@renderer/utils/request'
import { startNotificationSync } from '@renderer/services/notificationConnection'

export function useNotificationConnection(inbox: {
  account: string
  synchronize: () => Promise<boolean>
}) {
  let connection: ReturnType<typeof startNotificationSync> | undefined
  const stopWatching = watch(
    () => inbox.account,
    (account) => {
      connection?.stop()
      connection = account
        ? startNotificationSync({
            // Disable the generic wrapper's reconnect loop: each retry must
            // obtain a current token, and belong to this exact login session.
            connect: () =>
              new SocketRequest('/notifications', CERU_API_RESOURCE).connect({
                reconnection: false
              }),
            sync: () => inbox.synchronize(),
            visible: () => !document.hidden
          })
        : undefined
    },
    { immediate: true, flush: 'post' }
  )
  const wake = () => connection?.wake()
  window.addEventListener('focus', wake)
  window.addEventListener('online', wake)
  document.addEventListener('visibilitychange', wake)
  onBeforeUnmount(() => {
    stopWatching()
    connection?.stop()
    window.removeEventListener('focus', wake)
    window.removeEventListener('online', wake)
    document.removeEventListener('visibilitychange', wake)
  })
}
