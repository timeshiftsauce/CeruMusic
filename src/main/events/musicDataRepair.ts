import { app, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getPlaylistDatabase, setPlaylistRepairLocked } from '../services/songList/PlaylistDatabase'

const root = () => path.join(app.getPath('userData'), 'music-data-repair')
const journalPath = () => path.join(root(), 'journal.json')
const readJournal = (): any =>
  fs.existsSync(journalPath()) ? JSON.parse(fs.readFileSync(journalPath(), 'utf8')) : undefined
const writeJournal = (journal: any) => {
  fs.mkdirSync(root(), { recursive: true })
  const temporary = journalPath() + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(journal), 'utf8')
  fs.renameSync(temporary, journalPath())
}
let busy = false
let activeDatabase: ReturnType<typeof getPlaylistDatabase> | undefined

ipcMain.handle('music:repair-inspect', () => {
  const journal = readJournal()
  const database = activeDatabase ?? getPlaylistDatabase()
  const directories = fs
    .readdirSync(app.getPath('userData'))
    .filter((name) => name === 'songList' || name.startsWith('songList.backup.'))
  return {
    ...database.inspectRepair(),
    legacyDirectories: directories,
    pending:
      journal && journal.phase !== 'complete' && journal.phase !== 'rolled-back' ? journal : null
  }
})

ipcMain.handle(
  'music:repair-begin',
  async (_, storage: Record<string, string | null>, restoreMissing: boolean) => {
    if (busy) throw new Error('音乐数据正在修复')
    const existing = readJournal()
    if (existing && !['complete', 'rolled-back'].includes(existing.phase))
      throw new Error('请先恢复上次中断的修复')
    const database = getPlaylistDatabase()
    activeDatabase = database
    busy = true
    setPlaylistRepairLocked(true)
    const directory = path.join(root(), new Date().toISOString().replace(/[:.]/g, '-'))
    let backupComplete = false
    try {
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(path.join(directory, 'localStorage.json'), JSON.stringify(storage), 'utf8')
      await database.backup(path.join(directory, 'playlists.db'))
      for (const name of fs.readdirSync(app.getPath('userData'))) {
        if (name === 'songList' || name.startsWith('songList.backup.')) {
          fs.cpSync(path.join(app.getPath('userData'), name), path.join(directory, name), {
            recursive: true
          })
        }
      }
      writeJournal({ directory, phase: 'backed-up' })
      backupComplete = true
      const result = database.repairSongs()
      const imported = database.importLegacyPlaylists(restoreMissing === true)
      const songs = database.listPlaylists().flatMap((playlist) => database.listSongs(playlist.id))
      writeJournal({ directory, phase: 'database-ready' })
      return {
        directory,
        songs,
        fixed: result.fixed + imported.fixed,
        issues: [...result.issues, ...imported.issues]
      }
    } catch (error) {
      if (backupComplete) {
        database.restoreBackup(path.join(directory, 'playlists.db'))
        writeJournal({ directory, phase: 'rolled-back' })
      }
      setPlaylistRepairLocked(false)
      busy = false
      activeDatabase = undefined
      throw error
    }
  }
)

ipcMain.handle('music:repair-finish', () => {
  const journal = readJournal()
  if (!journal || journal.phase !== 'database-ready') throw new Error('修复状态无效')
  writeJournal({ ...journal, phase: 'complete' })
  setPlaylistRepairLocked(false)
  busy = false
  activeDatabase = undefined
})

ipcMain.handle('music:repair-rollback', () => {
  const journal = readJournal()
  if (!journal || ['complete', 'rolled-back'].includes(journal.phase)) return null
  const database = activeDatabase ?? getPlaylistDatabase()
  activeDatabase = database
  setPlaylistRepairLocked(true)
  database.restoreBackup(path.join(journal.directory, 'playlists.db'))
  const storage = JSON.parse(
    fs.readFileSync(path.join(journal.directory, 'localStorage.json'), 'utf8')
  )
  writeJournal({ ...journal, phase: 'restore-browser' })
  busy = false
  return storage
})

ipcMain.handle('music:repair-open-backup', async () => {
  const journal = readJournal()
  if (journal?.directory) await shell.openPath(journal.directory)
})

ipcMain.handle('music:repair-rollback-complete', () => {
  const journal = readJournal()
  if (journal?.phase === 'restore-browser') writeJournal({ ...journal, phase: 'rolled-back' })
  setPlaylistRepairLocked(false)
  activeDatabase = undefined
})
