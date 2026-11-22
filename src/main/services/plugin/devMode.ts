import {watch,type FSWatcher} from 'node:fs'
import {readFile,writeFile,rename,mkdir,realpath,lstat,open} from 'node:fs/promises'
import {dirname,basename,resolve,extname,join} from 'node:path'
import {randomUUID} from 'node:crypto'

type SavedEntry={path:string;enabled:boolean}
type Hooks={ load:(file:string,code:string)=>Promise<{id:string;runtime:2|3}>; stop:(id:string)=>Promise<void>; changed:()=>void }
type Entry=SavedEntry & {id?:string;runtime?:2|3;error?:string;watcher?:FSWatcher;timer?:ReturnType<typeof setTimeout>}
export class DeveloperEntries {
  private entries=new Map<string,Entry>()
  private tail=Promise.resolve()
  private active=false
  private initialized=false
  constructor(private readonly root:()=>string,private readonly hooks:Hooks){}
  private queue<T>(work:()=>Promise<T>) {const next=this.tail.then(work);this.tail=next.then(()=>{},()=>{});return next}
  private async persist() {
    const root=this.root();await mkdir(root,{recursive:true});const file=join(root,'dev-entries.json'),temporary=file+'.'+randomUUID()+'.tmp'
    await writeFile(temporary,JSON.stringify([...this.entries.values()].map(({path,enabled})=>({path,enabled})),null,2));await rename(temporary,file)
  }
  snapshot(){return {enabled:this.active,entries:[...this.entries.values()].map(({path,enabled,id,runtime,error})=>({path,enabled,id,runtime,error}))}}
  async restore(enabled:boolean) {return this.queue(async()=>{
    if(!this.initialized){
      const raw=await readFile(join(this.root(),'dev-entries.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return '[]';throw error})
      const data=JSON.parse(raw);if(!Array.isArray(data)||data.length>64)throw Error('开发文件记录格式无效')
      for(const entry of data){if(typeof entry?.path!=='string'||resolve(entry.path)!==entry.path||extname(entry.path).toLowerCase()!=='.js'||typeof entry.enabled!=='boolean')throw Error('开发文件记录无效');this.entries.set(entry.path,{path:entry.path,enabled:entry.enabled})}
      this.initialized=true
    }
    this.active=enabled
    for(const entry of this.entries.values()) {if(enabled&&entry.enabled)await this.start(entry);else await this.stop(entry)}
    return this.snapshot()
  })}
  add(file:string){return this.queue(async()=>{
    if(!this.active)throw Error('请先启用插件开发者模式')
    const path=await realpath(file);if(extname(path).toLowerCase()!=='.js')throw Error('请选择构建后的 JS 文件')
    if(!this.entries.has(path)&&this.entries.size>=64)throw Error('开发文件数量已达上限')
    const entry=this.entries.get(path) ?? {path,enabled:true};entry.enabled=true;this.entries.set(path,entry);await this.persist();await this.start(entry);return this.snapshot()
  })}
  remove(file:string){return this.queue(async()=>{const entry=this.entries.get(file);if(entry){await this.stop(entry);this.entries.delete(file);await this.persist();this.hooks.changed()}return this.snapshot()})}
  private async load(entry:Entry){
    if(!this.active||!entry.enabled||this.entries.get(entry.path)!==entry)return
    try {
      if((await realpath(entry.path))!==entry.path || !(await lstat(entry.path)).isFile())throw Error('开发文件路径已更改')
      const handle=await open(entry.path,'r');let code:string
      try {const size=(await handle.stat()).size;if(size<=0||size>32*1024*1024)throw Error('开发文件大小无效');const buffer=Buffer.alloc(size+1);let offset=0;while(offset<buffer.length){const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead};if(offset!==size)throw Error('开发文件仍在写入');code=buffer.toString('utf8',0,size)}finally{await handle.close()}
      const result=await this.hooks.load(entry.path,code);entry.id=result.id;entry.runtime=result.runtime;entry.error=undefined
    }catch(error){entry.error=error instanceof Error?error.message:String(error)}
    this.hooks.changed()
  }
  private async start(entry:Entry){
    if(!entry.watcher){try{entry.watcher=watch(dirname(entry.path),{persistent:false},(event,name)=>{
      if(name && name.toString()!==basename(entry.path))return
      clearTimeout(entry.timer);entry.timer=setTimeout(()=>{void this.queue(()=>this.load(entry))},event==='rename' ? 16 : 300)
    });entry.watcher.on('error',error=>{entry.error=error.message;entry.watcher?.close();entry.watcher=undefined;this.hooks.changed()})}catch(error){entry.error=String(error);this.hooks.changed();return}}
    await this.load(entry)
  }
  private async stop(entry:Entry){clearTimeout(entry.timer);entry.watcher?.close();entry.watcher=undefined;if(entry.id)await this.hooks.stop(entry.id);entry.id=undefined;entry.runtime=undefined}
  dispose(){return this.queue(async()=>{this.active=false;for(const entry of this.entries.values())await this.stop(entry)})}
}
