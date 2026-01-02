import { defineStore } from 'pinia'

export enum DownloadStatus {
  Queued = 'queued',
  Downloading = 'downloading',
  Paused = 'paused',
  Completed = 'completed',
  Error = 'error',
  Cancelled = 'cancelled'
}

export interface DownloadTask {
  id: string
  songInfo: any
  url: string
  pluginId?: string
  quality?: string
  filePath: string
  status: DownloadStatus
  progress: number
  speed: number
  totalSize: number
  downloadedSize: number
  remainingTime: number | null
  error: string | null
  priority?: number
  createdAt: number
}

export const useDownloadStore = defineStore('download', {
  state: () => ({
    tasks: [] as DownloadTask[]
  }),
  getters: {
    activeTasks: (state) => state.tasks.filter((t) => t.status === DownloadStatus.Downloading),
    completedTasks: (state) => state.tasks.filter((t) => t.status === DownloadStatus.Completed),
    downloadingCount: (state) =>
      state.tasks.filter((t) => t.status === DownloadStatus.Downloading).length
  },
  actions: {
    async init() {
      // Load initial tasks
      try {
        const tasks = await window.api.download.getTasks()
        this.tasks = tasks
      } catch (error) {
        console.error('Failed to load tasks:', error)
      }

      // Setup listeners
      window.api.download.onTaskAdded((_event, task) => {
        this.addTask(task)
      })

      window.api.download.onTaskProgress((_event, updatedTask) => {
        this.updateTask(updatedTask)
      })

      window.api.download.onTaskStatusChanged((_event, updatedTask) => {
        this.updateTask(updatedTask)
      })

      window.api.download.onTaskCompleted((_event, updatedTask) => {
        this.updateTask(updatedTask)
      })

      window.api.download.onTaskError((_event, updatedTask) => {
        this.updateTask(updatedTask)
      })

      window.api.download.onTaskDeleted((_event, taskId) => {
        this.removeTask(taskId)
      })

      // 批量重置任务列表（用于清空队列时一次性刷新）
      window.api.download.onTasksReset((_event, tasks) => {
        this.tasks = tasks
      })
    },

    addTask(task: DownloadTask) {
      const index = this.tasks.findIndex((t) => t.id === task.id)
      if (index === -1) {
        this.tasks.push(task)
      }
    },

    removeTask(taskId: string) {
      this.tasks = this.tasks.filter((t) => t.id !== taskId)
    },

    updateTask(updatedTask: DownloadTask) {
      const index = this.tasks.findIndex((t) => t.id === updatedTask.id)
      if (index !== -1) {
        // Update reactive properties
        // We can merge or replace, but direct assignment of the object in the array might lose reactivity if not careful with Vue 2, but fine in Vue 3 Pinia
        this.tasks[index] = updatedTask
      } else {
        // If for some reason we don't have it (e.g. loaded after add), add it
        this.tasks.push(updatedTask)
      }
    },

    async pauseTask(taskId: string) {
      await window.api.download.pauseTask(taskId)
    },

    async pauseAllTasks() {
      await window.api.download.pauseAllTasks()
    },

    async resumeAllTasks() {
      await window.api.download.resumeAllTasks()
    },

    async validateFiles() {
      const tasks = await window.api.download.validateFiles()
      this.tasks = tasks
    },

    async getMaxConcurrent() {
      return await window.api.download.getMaxConcurrent()
    },

    async resumeTask(taskId: string) {
      await window.api.download.resumeTask(taskId)
    },

    async cancelTask(taskId: string) {
      await window.api.download.cancelTask(taskId)
    },

    async deleteTask(taskId: string, deleteFile: boolean = false) {
      await window.api.download.deleteTask(taskId, deleteFile)
    },

    async retryTask(taskId: string) {
      await window.api.download.retryTask(taskId)
    },

    async openFileLocation(filePath: string) {
      await window.api.download.openFileLocation(filePath)
    },

    async clearTasks(type: 'queue' | 'completed' | 'failed' | 'all') {
      await window.api.download.clearTasks(type)
    }
  }
})
