import electron from 'electron'
import path from 'path'

function getAppDirPath() {
  let dirPath: string = electron.app.getAppPath()
  if (dirPath.endsWith('.asar')) {
    dirPath = path.join(path.dirname(dirPath), '../')
  }
  return dirPath
}

export { getAppDirPath }