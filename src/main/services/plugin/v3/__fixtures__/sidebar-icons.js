exports.manifest = {
  manifestVersion: 3, id: 'test.sidebar-icons', name: '侧栏图标验收', version: '1.0.0',
  engines: {hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},
  entry: {logic:{module:'logic.main'},views:[{id:'panel',kind:'native',module:'render'}]},
  provides: {actions:[{id:'render',title:'Render'}]},
  ui: {pages:[
    {id:'search',title:'宿主图标',mount:'sidebar',view:'panel',icon:{kind:'host',name:'search'}},
    {id:'custom',title:'资源图标',mount:'sidebar',view:'panel',icon:{kind:'asset',resource:'nav.logo'}},
    {id:'other',title:'默认图标',mount:'sidebar',view:'panel'},
    {id:'invalid',title:'损坏图标',mount:'sidebar',view:'panel',icon:{kind:'asset',resource:'broken.logo'}}
  ]}
}
exports.activate = function(ctx){ctx.actions.register('render',()=>({kind:'stack',children:[]}))}
exports.resources = {
  'nav.logo':{type:'text',mime:'image/svg+xml',value:'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="red"/></svg>'},
  'broken.logo':{type:'base64',mime:'image/png',value:'YQ=='}
}
