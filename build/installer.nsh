!include "MUI2.nsh"

; 开启 DPI 感知，解决高分屏模糊问题
ManifestDPIAware true

; ---------------------------------------------------------------
; 清理 dev 模式残留的快捷方式与 AUMID 关联
;
; 背景：在开发期 `yarn dev` 运行时,Electron 会以 node_modules 下的
; electron.exe 启动并调用 setAppUserModelId('com.cerumusic.app')。
; Windows 首次显示 Toast 通知 / SMTC 时会自动创建一个名为 Electron.lnk
; 的快捷方式（FileDescription 字段是 "Electron"）并把它与该 AUMID
; 永久绑定。安装正式版后,虽然 NSIS 也创建了 "澜音.lnk"（AUMID 一致）,
; 但旧的 Electron.lnk 仍存在,Get-StartApps / Toast / SMTC / 任务栏
; 都会按字典序优先取 "Electron",导致:
;   - 通知图标显示 electron 默认紫色图标
;   - SMTC 媒体控件应用名显示 "Electron"
;   - 任务栏右键打开的是 electron 默认窗口
;
; 解决方案: 安装时主动清理这些残留文件 + 注册表项。
; （代码层面已经把 dev 模式 AUMID 改为 com.cerumusic.app.dev,
;  从源头避免再次污染 com.cerumusic.app 命名空间,这里是兜底。）
; ---------------------------------------------------------------
!macro customInstall
  SetShellVarContext current

  ; 删除可能由 dev 模式遗留的快捷方式（指向 node_modules 里的 electron.exe）
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Electron.lnk"
  Delete "$DESKTOP\Electron.lnk"

  ; 清理 Windows 持久化的旧 AUMID → Electron.exe 关联
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\com.cerumusic.app"
!macroend
