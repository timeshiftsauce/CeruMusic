import { Worker } from 'worker_threads'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { v4 as uuidv4 } from 'uuid'

const workerPath = path.join(__dirname, 'downloadWorker.js')

import { app } from 'electron'
import fs from 'fs/promises'

const downloadsFilePath = path.join(app.getPath('userData'), 'downloads.json')

import log from 'electron-log'
import { DownloadStatus, DownloadTask } from '../types/download'

log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/main.log')

import { ConfigManager } from './ConfigManager'

export default class DownloadManager extends EventEmitter {
  private tasks = new Map<string, DownloadTask>()
  private queue: string[] = []
  private activeDownloads = new Map<string, Worker>()
  private initializingTasks = new Set<string>()
  private maxConcurrentDownloads: number = 3
  private urlFetcher: ((task: DownloadTask) => Promise<string>) | null = null
  private lyricFetcher: ((task: DownloadTask) => Promise<string | null>) | null = null
  private isStarted = false

  constructor() {
    super()
    const config = ConfigManager.getInstance()
    this.maxConcurrentDownloads = config.get('download.maxConcurrent', 1)
    this.loadTasks()
  }

  public start() {
    this.isStarted = true
    this.processQueue()
  }

  public setUrlFetcher(fetcher: (task: DownloadTask) => Promise<string>) {
    this.urlFetcher = fetcher
  }

  public setLyricFetcher(fetcher: (task: DownloadTask) => Promise<string | null>) {
    this.lyricFetcher = fetcher
  }

  private async loadTasks() {
    try {
      const data = await fs.readFile(downloadsFilePath, 'utf-8')
      const tasksArray = JSON.parse(data) as DownloadTask[]
      log.info(`Loaded ${tasksArray.length} tasks from history.`)
      for (const task of tasksArray) {
        if (task.status === DownloadStatus.Downloading) {
          task.status = DownloadStatus.Paused
          log.info(`Task ${task.id} was downloading, now paused.`)
        }
        this.tasks.set(task.id, task)
        if (task.status === DownloadStatus.Queued) {
          this.queue.push(task.id)
        }
      }
      this.queue.sort(
        (a, b) => (this.tasks.get(a)?.priority ?? 0) - (this.tasks.get(b)?.priority ?? 0)
      )
      this.validateFiles() // Validate files on startup
      if (this.isStarted) {
        this.processQueue()
      }
    } catch (error) {
      log.warn('Could not load download history:', error)
    }
  }

  // Validate that files for completed tasks actually exist
  public async validateFiles() {
    let changed = false
    const fsCheck = require('fs')

    for (const task of this.tasks.values()) {
      if (task.status === DownloadStatus.Completed) {
        if (!task.filePath || !fsCheck.existsSync(task.filePath)) {
          log.info(`File missing for completed task ${task.id}, marking as error.`)
          task.status = DownloadStatus.Error
          task.error = '文件已删除或移动'
          this.emit('task-status-changed', task)
          changed = true
        }
      }
    }

    if (changed) {
      this.saveTasks()
    }
  }

  private async saveTasks() {
    const tasksArray = Array.from(this.tasks.values())
    try {
      await fs.writeFile(downloadsFilePath, JSON.stringify(tasksArray, null, 2))
    } catch (error) {
      log.error('Failed to save download history:', error)
    }
  }

  public getTask(taskId: string): DownloadTask | undefined {
    return this.tasks.get(taskId)
  }

  public addTask(
    songInfo: any,
    url: string,
    filePath: string,
    tagWriteOptions: any,
    priority = 0,
    pluginId?: string,
    quality?: string
  ): DownloadTask {
    // Check if task already exists
    // We check by filePath (destination) or maybe songInfo.songmid/source combination if available
    // Here we use filePath as it implies same file output
    for (const task of this.tasks.values()) {
      if (task.status === DownloadStatus.Completed && task.filePath === filePath) {
        try {
          // Check if file actually exists on disk
          const fs = require('fs')
          if (fs.existsSync(filePath)) {
            throw new Error('歌曲已下载完成')
          }
        } catch (e: any) {
          if (e.message === '歌曲已下载完成') throw e
          // If file check fails (e.g. permission or not found), ignore and allow re-download
        }
      }

      if (
        (task.status === DownloadStatus.Downloading ||
          task.status === DownloadStatus.Queued ||
          task.status === DownloadStatus.Paused) &&
        task.filePath === filePath
      ) {
        throw new Error('歌曲正在下载中')
      }
    }

    const task: DownloadTask = {
      id: uuidv4(),
      songInfo,
      url,
      pluginId,
      quality,
      filePath,
      tagWriteOptions,
      status: DownloadStatus.Queued,
      progress: 0,
      speed: 0,
      totalSize: 0,
      downloadedSize: 0,
      remainingTime: null,
      retries: 0,
      error: null,
      priority,
      createdAt: Date.now()
    }

    this.tasks.set(task.id, task)
    this.queue.push(task.id)
    this.queue.sort(
      (a, b) => (this.tasks.get(a)?.priority ?? 0) - (this.tasks.get(b)?.priority ?? 0)
    )

    log.info('Task added:', task.id)
    this.emit('task-added', task)
    this.saveTasks()
    this.processQueue()

    return task
  }

  private processQueue() {
    while (
      this.activeDownloads.size + this.initializingTasks.size < this.maxConcurrentDownloads &&
      this.queue.length > 0
    ) {
      const taskId = this.queue.shift()
      if (!taskId) break
      this.startTask(taskId)
    }
  }

  private async startTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) return

    this.initializingTasks.add(taskId)

    try {
      log.info('Processing task:', taskId)
      task.status = DownloadStatus.Downloading
      this.emit('task-status-changed', task)

      // Fetch URL if missing
      if (!task.url && this.urlFetcher) {
        log.info('Fetching URL for task:', taskId)
        task.url = await this.urlFetcher(task)
      } else if (!task.url && !this.urlFetcher) {
        throw new Error('No URL and no URL fetcher configured')
      }

      // Fetch Lyric if missing and configured to embed or download lyrics
      if (
        task.tagWriteOptions &&
        (task.tagWriteOptions.downloadLyrics || task.tagWriteOptions.lyrics) &&
        !task.songInfo.lrc &&
        this.lyricFetcher
      ) {
        try {
          log.info('Fetching lyrics for task:', taskId)
          const lrc = await this.lyricFetcher(task)
          if (lrc) {
            task.songInfo.lrc = lrc
            this.saveTasks()
          }
        } catch (error) {
          log.warn('Failed to fetch lyrics for task:', taskId, error)
          // Do not fail the download if lyrics fetch fails
        }
      }

      const worker = new Worker(workerPath)
      this.activeDownloads.set(taskId, worker)
      this.initializingTasks.delete(taskId)

      worker.on('message', (message) => this.onWorkerMessage(taskId, message))
      worker.on('error', (error) => this.onWorkerError(taskId, error))
      worker.on('exit', (code) => this.onWorkerExit(taskId, code))

      worker.postMessage(task)
    } catch (error: any) {
      log.error('Failed to start task:', taskId, error)
      this.initializingTasks.delete(taskId)
      this.handleTaskError(taskId, error)
    }
  }

  private onWorkerMessage(taskId: string, message: any) {
    const task = this.tasks.get(taskId)
    if (!task) return

    if (message.type === 'progress') {
      task.progress = message.progress
      task.speed = message.speed
      task.totalSize = message.totalSize
      task.downloadedSize = message.downloadedSize
      task.remainingTime = message.remainingTime
      this.emit('task-progress', task)
    } else if (message.type === 'completed') {
      log.info('Task completed:', taskId)
      task.status = DownloadStatus.Completed
      task.progress = 100
      this.emit('task-completed', task)
      this.saveTasks()
      this.cleanupTask(taskId)
      this.processQueue()
    } else if (message.type === 'error') {
      this.handleTaskError(taskId, new Error(message.error))
    }
  }

  private onWorkerError(taskId: string, error: Error) {
    log.error('Worker error for task:', taskId, error)
    this.handleTaskError(taskId, error)
  }

  private onWorkerExit(taskId: string, code: number) {
    if (code !== 0) {
      const task = this.tasks.get(taskId)
      if (task && task.status === DownloadStatus.Downloading) {
        log.warn(`Worker for task ${taskId} stopped with exit code ${code}`)
        this.handleTaskError(taskId, new Error(`Worker stopped with exit code ${code}`))
      }
    }
    this.cleanupTask(taskId)
  }

  private handleTaskError(taskId: string, error: Error) {
    const task = this.tasks.get(taskId)
    if (!task) return

    if (task.retries < 3) {
      task.retries++
      log.warn(`Retrying task ${taskId} (attempt ${task.retries})`)
      task.status = DownloadStatus.Queued
      this.queue.unshift(taskId)
      this.emit('task-retrying', task)
    } else {
      log.error(`Task ${taskId} failed after 3 retries:`, error)
      task.status = DownloadStatus.Error
      task.error = error.message
      this.emit('task-error', task)
    }
    this.saveTasks()
    this.cleanupTask(taskId)
    this.processQueue()
  }

  public pauseTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== DownloadStatus.Downloading) return

    log.info('Pausing task:', taskId)
    const worker = this.activeDownloads.get(taskId)
    if (worker) {
      worker.postMessage({ type: 'pause' })
    }

    task.status = DownloadStatus.Paused
    this.emit('task-status-changed', task)
    this.saveTasks()
    this.cleanupTask(taskId)
    this.processQueue()
  }

  public resumeTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== DownloadStatus.Paused) return

    log.info('Resuming task:', taskId)
    task.status = DownloadStatus.Queued
    this.queue.unshift(taskId)
    this.emit('task-status-changed', task)
    this.saveTasks()
    this.processQueue()
  }

  public pauseAllTasks() {
    log.info('Pausing all tasks')
    const activeIds = Array.from(this.activeDownloads.keys())
    const queuedIds = [...this.queue]
    const initIds = Array.from(this.initializingTasks.values())

    for (const id of activeIds) {
      this.cleanupTask(id)
      const task = this.tasks.get(id)
      if (task && task.status === DownloadStatus.Downloading) {
        task.status = DownloadStatus.Paused
      }
    }

    this.queue = []
    for (const id of queuedIds) {
      const task = this.tasks.get(id)
      if (task && task.status === DownloadStatus.Queued) {
        task.status = DownloadStatus.Paused
      }
    }

    this.initializingTasks.clear()
    for (const id of initIds) {
      const task = this.tasks.get(id)
      if (task) {
        task.status = DownloadStatus.Paused
      }
    }

    this.saveTasks()
    this.emit('tasks-reset', this.getTasks())
  }

  public resumeAllTasks() {
    log.info('Resuming all paused tasks')
    // Get all paused tasks
    const pausedTasks = Array.from(this.tasks.values())
      .filter((task) => task.status === DownloadStatus.Paused)
      .sort((a, b) => a.createdAt - b.createdAt) // Keep original order if possible

    pausedTasks.forEach((task) => {
      // Just change status to Queued and add to queue
      // We don't call resumeTask directly to avoid multiple saveTasks/processQueue calls
      // But resumeTask handles logic well, let's just use it or optimized version
      // Optimization: Batch update
      task.status = DownloadStatus.Queued
      this.queue.push(task.id)
      this.emit('task-status-changed', task)
    })

    this.saveTasks()
    this.processQueue()
  }

  public cancelTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) return

    log.info('Cancelling task:', taskId)
    // 如果任务仍处于初始化阶段，移除初始化占位，释放并发槽位
    if (this.initializingTasks.has(taskId)) {
      this.initializingTasks.delete(taskId)
    }
    if (task.status === DownloadStatus.Downloading) {
      const worker = this.activeDownloads.get(taskId)
      if (worker) {
        worker.postMessage({ type: 'cancel' })
      }
    }

    if (task.status === DownloadStatus.Queued) {
      this.queue = this.queue.filter((id) => id !== taskId)
    }

    task.status = DownloadStatus.Cancelled
    this.emit('task-status-changed', task)
    // Remove cancelled task from list as requested by user
    // this.tasks.delete(taskId) // Don't delete immediately on cancel, let user delete explicitly if they want history
    this.saveTasks()
    this.cleanupTask(taskId)
    this.processQueue()
  }

  public deleteTask(taskId: string, deleteFile: boolean = false) {
    const task = this.tasks.get(taskId)
    if (!task) return

    log.info('Deleting task:', taskId, 'deleteFile:', deleteFile)
    // 确保清理初始化占位与活跃下载
    if (this.initializingTasks.has(taskId)) {
      this.initializingTasks.delete(taskId)
    }

    // If running, cancel it first
    if (task.status === DownloadStatus.Downloading || task.status === DownloadStatus.Queued) {
      this.cancelTask(taskId)
    }

    if (deleteFile && task.filePath) {
      fs.unlink(task.filePath).catch((err) => {
        log.warn('Failed to delete file for task:', taskId, err)
      })
    }

    this.tasks.delete(taskId)
    this.saveTasks()
    this.emit('task-deleted', taskId) // Notify frontend to remove from list
  }

  private cleanupTask(taskId: string) {
    if (this.activeDownloads.has(taskId)) {
      const worker = this.activeDownloads.get(taskId)
      worker?.terminate()
      this.activeDownloads.delete(taskId)
    }
  }

  public clearTasks(type: 'queue' | 'completed' | 'failed' | 'all') {
    const tasks = Array.from(this.tasks.values())
    const tasksToRemove: string[] = []

    if (type === 'queue' || type === 'all') {
      tasks
        .filter((t) =>
          [DownloadStatus.Downloading, DownloadStatus.Queued, DownloadStatus.Paused].includes(
            t.status
          )
        )
        .forEach((t) => {
          tasksToRemove.push(t.id)
        })
    }

    if (type === 'completed' || type === 'all') {
      tasks
        .filter((t) => t.status === DownloadStatus.Completed)
        .forEach((t) => tasksToRemove.push(t.id))
    }

    if (type === 'failed' || type === 'all') {
      tasks
        .filter((t) => [DownloadStatus.Error, DownloadStatus.Cancelled].includes(t.status))
        .forEach((t) => tasksToRemove.push(t.id))
    }

    // De-duplicate in case of overlap (though statuses are mutually exclusive)
    const uniqueIds = [...new Set(tasksToRemove)]

    uniqueIds.forEach((id) => {
      this.tasks.delete(id)
      if (type !== 'queue') {
        this.emit('task-deleted', id)
      }
    })

    if (type === 'queue' || type === 'all') {
      this.queue = []
      this.initializingTasks.clear()
      this.activeDownloads.forEach((worker) => worker.terminate())
      this.activeDownloads.clear()
    }

    if (uniqueIds.length > 0) {
      log.info(`Cleared ${uniqueIds.length} tasks of type ${type}`)
      this.saveTasks()
    }

    if (type === 'queue' || type === 'all') {
      this.emit('tasks-reset', this.getTasks())
      this.processQueue()
    }
  }

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values())
  }

  public getMaxConcurrentDownloads(): number {
    return this.maxConcurrentDownloads
  }

  public retryTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) return

    if (
      task.status === DownloadStatus.Error ||
      task.status === DownloadStatus.Cancelled ||
      task.status === DownloadStatus.Completed
    ) {
      task.status = DownloadStatus.Queued
      task.retries = 0
      task.error = null
      task.progress = 0
      this.queue.push(taskId)
      this.emit('task-status-changed', task)
      this.processQueue()
    }
  }

  public setMaxConcurrentDownloads(max: number) {
    this.maxConcurrentDownloads = max
    ConfigManager.getInstance().set('download.maxConcurrent', max)

    // If we have more active downloads than the new limit, pause some tasks
    if (this.activeDownloads.size > max) {
      const countToRemove = this.activeDownloads.size - max
      const activeIds = Array.from(this.activeDownloads.keys())
      // Requeue the most recently added tasks
      for (let i = 0; i < countToRemove; i++) {
        const taskId = activeIds[activeIds.length - 1 - i]
        this.requeueTask(taskId)
      }
    }

    this.processQueue()
  }

  private requeueTask(taskId: string) {
    const task = this.tasks.get(taskId)
    if (!task) return

    log.info('Requeuing task due to concurrency limit:', taskId)

    // Stop worker
    this.cleanupTask(taskId)

    // Reset status to Queued and add to front of queue
    task.status = DownloadStatus.Queued
    this.queue.unshift(taskId)
    this.emit('task-status-changed', task)
    this.saveTasks()
  }

  public shutdown() {
    this.queue = []
    this.tasks.forEach((task) => {
      if (task.status === DownloadStatus.Downloading || task.status === DownloadStatus.Queued) {
        task.status = DownloadStatus.Cancelled
        this.emit('task-cancelled', task)
      }
    })
    this.activeDownloads.forEach((worker) => worker.terminate())
    this.tasks.clear()
    this.activeDownloads.clear()
  }
}

export const downloadManager = new DownloadManager()
