const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { dirname, join } = require('node:path')
const { existsSync, readFileSync, writeFileSync } = require('node:fs')

exports.install = async (appRoot, directory) => {
  const fromApp = createRequire(join(appRoot,'package.json'))
  const fromCore = createRequire(fromApp.resolve('@shiqianjiang/ceru-plugin-core/network'))
  const clients = new Set()
  for (const load of [fromApp,fromCore]) {
    clients.add(load('axios'))
    clients.add((await import(pathToFileURL(join(dirname(load.resolve('axios/package.json')),'index.js')).href)).default)
  }
  for (const client of clients) client.interceptors.request.use(config => {
    const url = new URL(config.url,config.baseURL)
    if (!['interfacepc.music.163.com','music.163.com'].includes(url.hostname)) return config
    config.adapter = async () => {
      const path = url.pathname, headers = {}
      const selection=join(directory,'netease-qa-login')
      if (existsSync(selection)) {
        const chosen=readFileSync(selection,'utf8')
        const identity=/MUSIC_U=qa-vault-(first|second)/.exec(String(config.headers.get('Cookie') ?? ''))?.[1]
        let body={code:200}
        if (path.endsWith('/unikey')) body.unikey='qr-'+chosen
        else if (path.endsWith('/qrcode/client/login')) {
          const statusFile=join(directory,'netease-qa-qr-state')
          const status=existsSync(statusFile) ? readFileSync(statusFile,'utf8') : 'done'
          body.code=status==='waiting' ? 801 : status==='scanned' ? 802 : 803
          if(body.code===803)headers['set-cookie']='MUSIC_U=qa-vault-'+chosen+'; Path=/'
        }
        else if (path.endsWith('/music/detail/get')) body.data={songId:9}
        else if (!identity || existsSync(join(directory,'netease-qa-expired-'+identity))) body.code=301
        else if (path.endsWith('/nuser/account/get')) body.profile={userId:identity==='first'?7:8,nickname:identity==='first'?'测试甲':'测试乙',vipType:0}
        else if (path.endsWith('/vip/info')) body.data={}
        else if (path.endsWith('/recommend/songs')) body.data={dailySongs:[{id:9,name:identity+' 推荐歌曲',ar:[{name:'测试歌手'}],al:{id:2,name:'测试专辑'}}]}
        else if (path.endsWith('/recommend/resource')) body.recommend=[{id:5,name:identity+' 推荐歌单'}]
        else if (!path.endsWith('/logout')) throw Error('Unmapped host account QA path: '+path)
        return {status:200,statusText:'OK',config,headers,data:Buffer.from(JSON.stringify(body))}
      }
      let data = {code:200}
      if (path.endsWith('/unikey')) data.unikey='test-only-qr'
      else if (path.endsWith('/qrcode/client/login')) { data.code=803;headers['set-cookie']='MUSIC_U=test-only-account; Path=/'; writeFileSync(join(directory,'netease-test-scanned'),'ok') }
      else if (path.endsWith('/nuser/account/get')) {
        if (existsSync(join(directory,'netease-test-expired'))) {data.code=301; writeFileSync(join(directory,'netease-test-validated-expiry'),'ok')}
        else data.profile={userId:7,nickname:'本地测试账号',vipType:0}
      } else if (path.endsWith('/vip/info')) data.data={}
      else if (path.endsWith('/recommend/songs')) {
        if (existsSync(join(directory,'netease-test-recommend-expired'))) {data.code=301;writeFileSync(join(directory,'netease-test-recommend-rejected'),'ok')}
        else data.data={dailySongs:[{id:9,name:'离线推荐歌曲',dt:180000,ar:[{name:'测试歌手'}],al:{id:2,name:'测试专辑'}}]}
      }
      else if (path.endsWith('/recommend/resource')) data.recommend=[{id:5,name:'离线推荐歌单'}]
      else if (path.endsWith('/music/detail/get')) data.data={songId:9}
      else throw Error('Unmapped NetEase QA request: '+path)
      return {status:200,statusText:'OK',config,headers,data:Buffer.from(JSON.stringify(data))}
    }
    return config
  })
}
