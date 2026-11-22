//@ts-nocheck
import DownloadManager from './DownloadManager'
import { DownloadStatus } from '../types/download'

jest.mock('./plugin/media/mediaProtocol', () => ({
  isPluginMediaUrl: (url: string) => url.startsWith('ceru-media:'),
  pluginMedia: { has: jest.fn(), downloadUrl: jest.fn() }
}))
jest.mock('./networkProxy', () => ({ getCurrentProxyRule: () => null }))

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('[]'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('electron-log', () => ({
  transports: { file: {} },
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}))

jest.mock('./ConfigManager', () => {
  const configManager = { get: (_key, fallback) => fallback, set: jest.fn() }
  return { ConfigManager: { getInstance: () => configManager }, configManager }
})

// Mocking electron's app.getPath
jest.mock('electron', () => {
  const path = require('path')
  return {
    app: {
      getPath: jest.fn(() => path.join(__dirname, '..', '..', '..', 'test-data'))
    }
  }
})

// Mocking uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => '1')
}))

// Mocking worker_threads
jest.mock('worker_threads', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    postMessage: jest.fn(),
    terminate: jest.fn()
  }))
}))

describe('DownloadManager', () => {
  it('resolves expired media tokens and gives only the local plaintext URL to its worker', async () => {
    const {pluginMedia}=require('./plugin/media/mediaProtocol')
    const {Worker}=require('worker_threads')
    Worker.mockClear()
    pluginMedia.has.mockReturnValue(false)
    pluginMedia.downloadUrl.mockResolvedValue('http://127.0.0.1:41234/media/fresh')
    const manager=new DownloadManager()
    manager.processQueue=jest.fn()
    manager.urlFetcher=jest.fn().mockResolvedValue('ceru-media://fresh')
    const task={id:'encrypted',url:'ceru-media://expired',status:DownloadStatus.Queued,songInfo:{}}
    manager.tasks=new Map([[task.id,task]])
    await manager.startTask(task.id)
    expect(manager.urlFetcher).toHaveBeenCalledTimes(1)
    expect(task.url).toBe('ceru-media://fresh')
    expect(Worker.mock.results[0].value.postMessage).toHaveBeenCalledWith(expect.objectContaining({url:'http://127.0.0.1:41234/media/fresh',requestHeaders:{}}))
  })
  it('does not launch a download worker after a pending media URL request is paused', async () => {
    const {pluginMedia}=require('./plugin/media/mediaProtocol')
    const {Worker}=require('worker_threads')
    Worker.mockClear()
    pluginMedia.has.mockReturnValue(true)
    let ready
    pluginMedia.downloadUrl.mockImplementation(()=>new Promise(resolve=>{ready=resolve}))
    const manager=new DownloadManager()
    manager.processQueue=jest.fn()
    const task={id:'pending-media',url:'ceru-media://active',status:DownloadStatus.Queued,songInfo:{}}
    manager.tasks=new Map([[task.id,task]])
    const pending=manager.startTask(task.id)
    manager.pauseTask(task.id)
    ready('http://127.0.0.1:41234/media/fresh')
    await pending
    expect(Worker).not.toHaveBeenCalled()
    expect(manager.initializingTasks.size).toBe(0)
  })
  it('retains the actual path when the worker corrects the detected audio format', () => {
    const manager = new DownloadManager()
    const task = {id:'detected',filePath:'/music/song.mp3',status:DownloadStatus.Downloading,progress:0}
    manager.tasks = new Map([['detected',task]])
    manager.processQueue = jest.fn()
    const completed = jest.fn()
    manager.on('task-completed',completed)
    manager.onWorkerMessage('detected',{type:'completed',result:{path:'/music/song.wav'}})
    expect(task.filePath).toBe('/music/song.wav')
    expect(completed).toHaveBeenCalledWith(expect.objectContaining({filePath:'/music/song.wav',status:DownloadStatus.Completed}))
  })
  it('cancels a pending selection before advancing the queue and refuses started tasks atomically', () => {
    const manager = new DownloadManager()
    manager.processQueue = jest.fn()
    const first = {id:'first',status:DownloadStatus.Queued,downloadedSize:0}
    const second = {id:'second',status:DownloadStatus.Paused,downloadedSize:0}
    manager.tasks = new Map([['first',first],['second',second]])
    manager.queue = ['first','second','other']
    manager.processQueue.mockImplementation(() => {
      expect(manager.queue).toEqual(['other'])
    })
    manager.cancelPendingTasks(['first','second'])
    expect(first.status).toBe(DownloadStatus.Cancelled)
    expect(second.status).toBe(DownloadStatus.Cancelled)
    first.status = DownloadStatus.Queued
    manager.initializingTasks.add('second')
    expect(() => manager.cancelPendingTasks(['first','second'])).toThrow('下载已开始')
    expect(first.status).toBe(DownloadStatus.Queued)
  })
  let downloadManager: DownloadManager
  beforeEach(() => {
    downloadManager = new DownloadManager()
  })

  it('should add a new task to the queue', () => {
    const songInfo = { id: '1', name: 'Test Song' }
    const url = 'http://fakeurl.com/song.flac'
    const filePath = '/fake/path/song.flac'
    const tagWriteOptions = {}

    const task = downloadManager.addTask(songInfo, url, filePath, tagWriteOptions)

    expect(task).toBeDefined()
    expect(task.status).toBe(DownloadStatus.Downloading)
    expect(task.id).toBe('1')
  })

  it('should pause a running task', () => {
    const songInfo = { id: '1', name: 'Test Song' }
    const url = 'http://fakeurl.com/song.flac'
    const filePath = '/fake/path/song.flac'
    const tagWriteOptions = {}

    const task = downloadManager.addTask(songInfo, url, filePath, tagWriteOptions)
    downloadManager.pauseTask(task.id)

    expect(task.status).toBe(DownloadStatus.Paused)
    // Verify worker termination logic if possible, but status check is primary
  })

  it('should resume a paused task', () => {
    const songInfo = { id: '1', name: 'Test Song' }
    const url = 'http://fakeurl.com/song.flac'
    const filePath = '/fake/path/song.flac'
    const tagWriteOptions = {}

    const task = downloadManager.addTask(songInfo, url, filePath, tagWriteOptions)
    downloadManager.pauseTask(task.id)
    expect(task.status).toBe(DownloadStatus.Paused)

    downloadManager.resumeTask(task.id)
    expect(task.status).toBe(DownloadStatus.Downloading)
  })

  it('should cancel a task', () => {
    const songInfo = { id: '1', name: 'Test Song' }
    const url = 'http://fakeurl.com/song.flac'
    const filePath = '/fake/path/song.flac'
    const tagWriteOptions = {}

    const task = downloadManager.addTask(songInfo, url, filePath, tagWriteOptions)
    downloadManager.cancelTask(task.id)

    // After change, cancelTask keeps the task but sets status to Cancelled
    const cancelledTask = downloadManager.getTask(task.id)
    expect(cancelledTask).toBeDefined()
    expect(cancelledTask?.status).toBe(DownloadStatus.Cancelled)
  })

  it('should delete a task', () => {
    const songInfo = { id: '1', name: 'Test Song' }
    const url = 'http://fakeurl.com/song.flac'
    const filePath = '/fake/path/song.flac'
    const tagWriteOptions = {}

    const task = downloadManager.addTask(songInfo, url, filePath, tagWriteOptions)
    downloadManager.deleteTask(task.id)

    expect(downloadManager.getTask(task.id)).toBeUndefined()
  })

  it('should respect max concurrent downloads', () => {
    // Reset mock to return unique IDs for this test
    const uuid = require('uuid')
    let idCounter = 0
    uuid.v4.mockImplementation(() => `${++idCounter}`)

    const task1 = downloadManager.addTask({}, 'https://example.invalid/1', 'path1', {})
    const task2 = downloadManager.addTask({}, 'https://example.invalid/2', 'path2', {})

    expect(task1.status).toBe(DownloadStatus.Downloading)
    expect(task2.status).toBe(DownloadStatus.Queued)

    // Increase limit to 2
    downloadManager.setMaxConcurrentDownloads(2)
    expect(task2.status).toBe(DownloadStatus.Downloading)

    // Decrease limit back to 1
    downloadManager.setMaxConcurrentDownloads(1)
    // Task 2 was started last, so it should be requeued (or task 1, implementation detail: we chose LIFO eviction)
    // Actually our implementation evicts the last added to active map.
    // Task 1 was active. Task 2 became active. So active map order: [task1, task2].
    // Evicting last -> task2.
    expect(task2.status).toBe(DownloadStatus.Queued)
    expect(task1.status).toBe(DownloadStatus.Downloading)
  })
})
