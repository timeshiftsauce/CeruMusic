import electron from 'electron'

function getAppDirPath(
  name?:
    | 'home'
    | 'appData'
    | 'assets'
    | 'userData'
    | 'sessionData'
    | 'temp'
    | 'exe'
    | 'module'
    | 'desktop'
    | 'documents'
    | 'downloads'
    | 'music'
    | 'pictures'
    | 'videos'
    | 'recent'
    | 'logs'
    | 'crashDumps'
) {
  let dirPath: string = electron.app.getPath(name ?? 'userData')
  return dirPath
}

export { getAppDirPath }
