import { OPERATION_CATALOG, listOperationTools } from '@shiqianjiang/ceru-plugin-core/contract'

export default {
  load() {
    const tools = new Map<string, ReturnType<typeof listOperationTools>[number]>(listOperationTools().map(tool => [tool.name, tool] as const))
    return Object.entries(OPERATION_CATALOG).map(([name, policy]) => ({
      name,
      description: tools.get(name)?.description,
      intercept: policy.intercept,
      observe: policy.observe,
      cancelable: policy.cancelable,
      timeout: policy.hookTimeoutMs,
      callPermission: tools.has(name) ? (tools.get(name)?.permission ?? '无需额外权限') : '宿主入口',
      input: JSON.stringify(policy.inputSchema, null, 2),
      output: JSON.stringify(policy.outputSchema, null, 2)
    }))
  }
}
