/*
 * Copyright (c) 2025. 时迁酱 Inc. All rights reserved.
 *
 * This software is the confidential and proprietary information of 时迁酱.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 *
 * @author 时迁酱，无聊的霜霜，Star
 * @since 2025-9-20
 * @version 1.0
 */

import { BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

export function initPluginNotice(mainWindowInstance: BrowserWindow): void {
  mainWindow = mainWindowInstance
}

export interface PluginNoticeData {
  type: 'error' | 'info' | 'success' | 'warn' | 'update'
  data: {
    title?: string
    content?: string
    message?: string
    url?: string
    version?: string
    pluginInfo?: {
      name?: string
      type?: 'lx' | 'cr'
      forcedUpdate?: boolean
    }
  }
  currentVersion?: string
  timestamp?: number
  pluginName?: string
}

export interface DialogNotice {
  type: string
  data: any
  timestamp: number
  pluginName: string
  dialogType: 'update' | 'info' | 'error' | 'warning' | 'success'
  title: string
  message: string
  updateUrl?: string
  pluginType?: 'lx' | 'cr'
  currentVersion?: string
  newVersion?: string
  actions: Array<{
    text: string
    type: 'cancel' | 'update' | 'confirm'
    primary?: boolean
  }>
}

/**
 * 验证 URL 是否有效
 */
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 根据通知类型获取标题
 */
function getNoticeTitle(type: string): string {
  const titleMap: Record<string, string> = {
    update: '插件更新',
    error: '插件错误',
    warning: '插件警告',
    info: '插件信息',
    success: '操作成功'
  }
  return titleMap[type] || '插件通知'
}

/**
 * 根据通知类型获取默认消息
 */
function getDefaultMessage(type: string, data: any, pluginName: string): string {
  switch (type) {
    case 'error':
      return `插件 "${pluginName}" 发生错误: ${data?.error || data?.message || '未知错误'}`
    case 'warning':
      return `插件 "${pluginName}" 警告: ${data?.warning || data?.message || '需要注意'}`
    case 'success':
      return `插件 "${pluginName}" 操作成功: ${data?.message || ''}`
    case 'info':
    default:
      return data?.message || `插件 "${pluginName}" 信息: ${JSON.stringify(data)}`
  }
}

/**
 * 发送插件通知到渲染进程
 */
export function sendPluginNotice(noticeData: PluginNoticeData, pluginName?: string): void {
  try {
    // console.log(`[CeruMusic] 插件通知: ${noticeData.type}`, noticeData.data)

    // 获取主窗口实例
    if (!mainWindow) {
      console.warn('[CeruMusic] 未找到主窗口，无法发送通知')
      return
    }

    // 构建通知数据
    const baseNoticeData = {
      type: noticeData.type,
      data: noticeData.data,
      timestamp: noticeData.timestamp || Date.now(),
      pluginName: pluginName || noticeData.pluginName || 'Unknown Plugin'
    }

    // 根据通知类型处理不同的逻辑
    if (noticeData.type === 'update' && noticeData.data?.url && isValidUrl(noticeData.data.url)) {
      // 更新通知 - 显示带更新按钮的对话框
      const updateNotice: DialogNotice = {
        ...baseNoticeData,
        dialogType: 'update',
        title: noticeData.data.title || '插件更新',
        message: noticeData.data.content || `插件 "${baseNoticeData.pluginName}" 有新版本可用`,
        updateUrl: noticeData.data.url,
        pluginType: noticeData.data.pluginInfo?.type,
        currentVersion: noticeData.currentVersion || '未知', // 这个需要从插件实例获取
        newVersion: noticeData.data.version,
        actions: [
          { text: '稍后更新', type: 'cancel' },
          { text: '立即更新', type: 'update', primary: true }
        ]
      }

      mainWindow.webContents.send('plugin-notice', updateNotice)
    } else {
      // 普通通知 - 显示信息对话框
      const infoNotice: DialogNotice = {
        ...baseNoticeData,
        dialogType:
          noticeData.type === 'error'
            ? 'error'
            : noticeData.type === 'warn'
              ? 'warning'
              : noticeData.type === 'success'
                ? 'success'
                : 'info',
        title: noticeData.data.title || getNoticeTitle(noticeData.type),
        message:
          noticeData.data.message ||
          noticeData.data.content ||
          getDefaultMessage(noticeData.type, noticeData.data, baseNoticeData.pluginName),
        actions: [{ text: '我知道了', type: 'confirm', primary: true }]
      }
      mainWindow.webContents.send('plugin-notice', infoNotice)
    }
  } catch (error: any) {
    console.error('[CeruMusic] 发送插件通知失败:', error.message)
  }
}
