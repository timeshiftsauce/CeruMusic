//@ts-nocheck
import DownloadManager from './DownloadManager'
import { DownloadStatus, DownloadTask } from '../types/download'
import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import log from 'electron-log'

// Mocking electron's app.getPath
jest.mock('electron', () => {
  const path = require('path')
  const basePath = path.join(__dirname, '..', '..', '..', 'test-data')
  return {
    app: {
      getPath: jest.fn((key) => {
        if (key === 'logs') {
          return path.join(basePath, 'logs')
        }

        return basePath
      })
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
  let downloadManager: DownloadManager
  const testDataPath = path.join(__dirname, '..', '..', '..', 'test-data')
  const downloadsFilePath = path.join(testDataPath, 'downloads.json')

  beforeAll(() => {
    log.transports.file.level = false
  })

  beforeEach(async () => {
    // Ensure the test-data directory exists and is clean
    await fs.mkdir(testDataPath, { recursive: true })
    await fs.mkdir(path.join(testDataPath, 'logs'), { recursive: true })
    await fs.writeFile(downloadsFilePath, '[]')
    // Create a fresh DownloadManager for each test
    downloadManager = new DownloadManager(1)
    await downloadManager.ready()
  })

  afterEach(async () => {
    downloadManager.shutdown()
    // Clean up the test-data directory
    await fs.rm(testDataPath, { recursive: true, force: true })
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

  it('should persist the latest task state after rapid status changes', async () => {
    const task = downloadManager.addTask({ id: '1', name: 'Test Song' }, 'url', 'path', {})

    downloadManager.pauseTask(task.id)
    downloadManager.resumeTask(task.id)
    await new Promise((resolve) => setTimeout(resolve, 10))

    const tasks = JSON.parse(await fs.readFile(downloadsFilePath, 'utf-8')) as DownloadTask[]
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe(DownloadStatus.Downloading)
  })

  it('should coalesce repeated history saves during rapid status changes', async () => {
    const writeSpy = jest.spyOn(fs, 'writeFile')

    const task = downloadManager.addTask({ id: '1', name: 'Test Song' }, 'url', 'path', {})
    downloadManager.pauseTask(task.id)
    downloadManager.resumeTask(task.id)
    await new Promise((resolve) => setTimeout(resolve, 10))

    const historyWrites = writeSpy.mock.calls.filter(([filePath]) => filePath === downloadsFilePath)
    expect(historyWrites).toHaveLength(1)

    writeSpy.mockRestore()
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

  it('should respect max concurrent downloads', async () => {
    // Reset mock to return unique IDs for this test
    const uuid = require('uuid')
    let idCounter = 0
    uuid.v4.mockImplementation(() => `${++idCounter}`)

    // Create a manager with limit 1
    const limitManager = new DownloadManager(1)
    await limitManager.ready()

    const task1 = limitManager.addTask({}, 'url1', 'path1', {})
    const task2 = limitManager.addTask({}, 'url2', 'path2', {})

    expect(task1.status).toBe(DownloadStatus.Downloading)
    expect(task2.status).toBe(DownloadStatus.Queued)

    // Increase limit to 2
    limitManager.setMaxConcurrentDownloads(2)
    expect(task2.status).toBe(DownloadStatus.Downloading)

    // Decrease limit back to 1
    limitManager.setMaxConcurrentDownloads(1)
    // Task 2 was started last, so it should be requeued (or task 1, implementation detail: we chose LIFO eviction)
    // Actually our implementation evicts the last added to active map.
    // Task 1 was active. Task 2 became active. So active map order: [task1, task2].
    // Evicting last -> task2.
    expect(task2.status).toBe(DownloadStatus.Queued)
    expect(task1.status).toBe(DownloadStatus.Downloading)

    limitManager.shutdown()
  })

  it('should initialize download history storage when files are missing', async () => {
    downloadManager.shutdown()
    await fs.rm(testDataPath, { recursive: true, force: true })

    const freshManager = new DownloadManager()
    await freshManager.ready()

    await expect(fs.readFile(downloadsFilePath, 'utf-8')).resolves.toBe('[]')
    await expect(fs.stat(path.join(testDataPath, 'logs'))).resolves.toBeTruthy()

    freshManager.shutdown()
  })
})
