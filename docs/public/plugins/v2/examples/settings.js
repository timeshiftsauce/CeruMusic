exports.manifest = {
  manifestVersion: 2,
  id: 'example.docs.settings',
  name: '澜音文档 · 连接设置',
  version: '0.1.0',
  description: '原生抽屉、私有存储与按需权限演示，不发起网络请求',
  author: '澜音文档',
  license: 'MIT',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1', uiSchema: '^1.0.0' },
  modules: {
    logic: { entry: 'logic.main' },
    surfaces: [{ id: 'settings', kind: 'schema', entry: 'schema.settings' }]
  },
  contributes: {
    commands: [
      { id: 'open', title: '连接设置', action: 'settings.open', view: 'settings' },
      { id: 'save', title: '保存偏好', action: 'settings.save' },
      { id: 'permission', title: '查看网络授权', action: 'permissions.check' }
    ],
    settingsPages: [{ id: 'settings', title: '连接设置', view: 'settings' }]
  },
  permissions: [
    {
      key: 'network',
      name: 'network.request',
      reason: '演示连接音乐服务时的授权提示，本示例不会发送请求',
      optional: true
    },
    {
      key: 'private',
      name: 'network.private',
      reason: '演示访问用户自建曲库的独立局域网权限',
      optional: true
    }
  ]
}

exports.resources = {
  'schema.settings': {
    type: 'json',
    value: {
      schemaVersion: '1.0',
      presentation: { kind: 'drawer', placement: 'right', size: 480, openOnFirstUse: true },
      root: {
        type: 'form',
        title: '连接设置',
        submitAction: 'settings.save',
        submitLabel: '保存偏好',
        children: [
          { type: 'text', bind: 'status', label: '状态' },
          {
            type: 'text-input',
            bind: 'serverUrl',
            label: '服务器地址',
            placeholder: 'https://music.example.com',
            required: true
          },
          {
            type: 'text-input',
            bind: 'username',
            label: '用户名',
            placeholder: '可选，本示例不登录'
          },
          {
            type: 'password',
            bind: 'password',
            label: '密码',
            description: '只演示控件，不保存密码'
          },
          {
            type: 'select',
            bind: 'quality',
            label: '偏好音质',
            options: [
              { label: '标准 · 320k', value: '320k' },
              { label: '无损 · FLAC', value: 'flac' }
            ]
          },
          { type: 'toggle', bind: 'remember', label: '记住连接偏好' },
          { type: 'button', label: '查看网络授权', action: 'permissions.check' }
        ]
      }
    }
  }
}

exports.activate = async function (ctx) {
  const saved = await ctx.storage.get('preferences')
  let preferences =
    saved && typeof saved === 'object' && !Array.isArray(saved)
      ? saved
      : { serverUrl: 'https://music.example.com', username: '', quality: '320k', remember: false }
  ctx.actions.register('settings.open', async () => ctx.ui.openView('settings'))
  ctx.actions.register('settings.save', async (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('无效表单')
    const serverUrl = String(input.serverUrl || '').trim()
    if (!/^https:\/\/[^/\s]+/.test(serverUrl)) throw new Error('请输入 HTTPS 服务器地址')
    preferences = {
      serverUrl,
      username: String(input.username || ''),
      quality: input.quality === 'flac' ? 'flac' : '320k',
      remember: input.remember === true
    }
    if (preferences.remember) await ctx.storage.set('preferences', preferences)
    else await ctx.storage.delete('preferences')
    await ctx.ui.setState('settings', { ...preferences, status: '偏好已更新，本示例未连接服务器' })
    return { saved: preferences.remember }
  })
  ctx.actions.register('permissions.check', async (_input, operation) => {
    const result = await ctx.permissions.requestGroup({
      group: 'network',
      keys: ['network'],
      intent: operation.userIntent
    })
    await ctx.ui.setState('settings', {
      ...preferences,
      status: result.status === 'granted' ? '已允许公网访问，本示例不会联网' : '尚未允许网络访问'
    })
    return { status: result.status }
  })
  await ctx.ui.setState('settings', { ...preferences, status: '本地演示 · 填写后保存偏好' })
}
