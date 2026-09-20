import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { createAccount } from './account'
import { registerNative } from './native'
import { createCatalog, registerProvider } from './provider'

export default definePlugin(async (ctx) => {
  const account = await createAccount(ctx)
  const catalog = createCatalog(ctx, account)

  registerProvider(ctx, account, catalog)
  registerNative(ctx, account, catalog)
})
