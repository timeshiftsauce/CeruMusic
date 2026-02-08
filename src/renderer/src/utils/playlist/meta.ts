/**
 * 获取持久化 meta (剔除运行时注入的临时字段)
 * @param meta 原始 meta 对象
 * @returns 处理后的 meta 对象
 */
export const getPersistentMeta = (meta: Record<string, any>) => {
  const persistentMeta = { ...meta }
  const TEMPORARY_KEYS = ['cloudId', 'isSynced', 'cloudUpdatedAt', 'isCloudOnly']
  TEMPORARY_KEYS.forEach((key) => {
    delete persistentMeta[key]
  })
  return persistentMeta
}
