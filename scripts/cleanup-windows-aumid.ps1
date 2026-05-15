# =============================================================================
# 澜音 - Windows AUMID / 快捷方式污染清理脚本
# =============================================================================
#
# 用途:
#   修复 Windows 上由开发期 `yarn dev` 运行 electron.exe 导致的快捷方式污染,
#   症状包括:
#     - Toast 通知图标显示 electron 默认紫色图标(而非澜音 logo)
#     - SMTC 媒体控件应用名显示 "Electron" (而非"澜音")
#     - 任务栏右键应用图标 → "最近" 项打开的是 electron 默认窗口
#     - Get-StartApps 显示 "Electron" 关联到 AUMID com.cerumusic.app
#
# 污染产生过程:
#   开发期 setAppUserModelId('com.cerumusic.app') 被 electron.exe 调用,
#   Windows 首次显示通知时自动创建 "Electron.lnk" 并把它永久绑定到该 AUMID,
#   即使后来安装了正式版本,Get-StartApps 也会按字典序优先取 "Electron"。
#
# 使用方式:
#   pwsh -ExecutionPolicy Bypass -File scripts/cleanup-windows-aumid.ps1
#   或者直接右键 .ps1 文件 → "使用 PowerShell 运行"
#
# 选项:
#   -Force         无需交互直接清理
#   -AumidProd     生产 AUMID, 默认 com.cerumusic.app
#   -AumidDev      开发 AUMID, 默认 com.cerumusic.app.dev
#                  (与 src/main/index.ts 中的 setAppUserModelId 保持一致)
# =============================================================================

[CmdletBinding()]
param(
    [switch]$Force,
    [string]$AumidProd = 'com.cerumusic.app',
    [string]$AumidDev = 'com.cerumusic.app.dev'
)

$ErrorActionPreference = 'Continue'

function Write-Section($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Write-Hit($msg) { Write-Host "  ✗ $msg" -ForegroundColor Yellow }
function Write-Ok($msg)  { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Info($msg){ Write-Host "  • $msg" -ForegroundColor Gray }

# -----------------------------------------------------------------------------
# 阶段 1: 诊断 - 列出所有污染源
# -----------------------------------------------------------------------------
Write-Section "诊断阶段 - 扫描污染源"

$shell = New-Object -ComObject WScript.Shell

# 1.1 扫描开始菜单 / 桌面下指向 node_modules/electron/dist/electron.exe 的 lnk
#     这是核心污染源 —— dev 模式自动创建的 "Electron.lnk"
$searchDirs = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
    "$env:ALLUSERSPROFILE\Microsoft\Windows\Start Menu\Programs",
    "$env:USERPROFILE\Desktop",
    "$env:PUBLIC\Desktop"
)

$pollutedLinks = @()
foreach ($dir in $searchDirs) {
    if (-not (Test-Path $dir)) { continue }
    Get-ChildItem -Path $dir -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $lnk = $shell.CreateShortcut($_.FullName)
            # 判定污染条件:
            #   - target 指向 node_modules 里的 electron.exe (开发期产物), 或
            #   - 文件名为 Electron.lnk 且 description 是 Electron (无 productName 时的默认值)
            $isDevTarget = $lnk.TargetPath -match 'node_modules.+electron.+electron\.exe$'
            $isElectronNamed = ($_.BaseName -eq 'Electron') -and ($lnk.Description -eq 'Electron')
            if ($isDevTarget -or $isElectronNamed) {
                $pollutedLinks += [PSCustomObject]@{
                    Path   = $_.FullName
                    Target = $lnk.TargetPath
                    Desc   = $lnk.Description
                }
            }
        } catch {}
    }
}

if ($pollutedLinks.Count -gt 0) {
    Write-Hit "发现 $($pollutedLinks.Count) 个污染快捷方式:"
    $pollutedLinks | ForEach-Object {
        Write-Info "  $($_.Path)"
        Write-Info "    → $($_.Target)"
    }
} else {
    Write-Ok "未发现污染快捷方式"
}

# 1.2 扫描 ImplicitAppShortcuts (Windows Toast 自动创建的隐式 lnk 容器)
$implicitDir = "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\ImplicitAppShortcuts"
$implicitLinks = @()
if (Test-Path $implicitDir) {
    Get-ChildItem -Path $implicitDir -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $lnk = $shell.CreateShortcut($_.FullName)
            if ($lnk.TargetPath -match 'node_modules.+electron.+electron\.exe$' -or
                $lnk.TargetPath -match 'ceru-music\.exe$') {
                $implicitLinks += [PSCustomObject]@{
                    Path   = $_.FullName
                    Target = $lnk.TargetPath
                }
            }
        } catch {}
    }
}

if ($implicitLinks.Count -gt 0) {
    Write-Hit "发现 $($implicitLinks.Count) 个隐式快捷方式 (ImplicitAppShortcuts):"
    $implicitLinks | ForEach-Object {
        Write-Info "  $($_.Path)"
        Write-Info "    → $($_.Target)"
    }
} else {
    Write-Ok "ImplicitAppShortcuts 未发现污染"
}

# 1.3 扫描注册表里的 AUMID 关联
$regPaths = @(
    "HKCU:\Software\Classes\AppUserModelId\$AumidProd",
    "HKCU:\Software\Classes\AppUserModelId\$AumidDev"
)
$pollutedRegs = @()
foreach ($p in $regPaths) {
    if (Test-Path $p) {
        $pollutedRegs += $p
    }
}

if ($pollutedRegs.Count -gt 0) {
    Write-Hit "发现 $($pollutedRegs.Count) 条 AUMID 注册表残留:"
    $pollutedRegs | ForEach-Object { Write-Info "  $_" }
} else {
    Write-Ok "AUMID 注册表无残留"
}

# 1.4 当前 Get-StartApps 状态
Write-Info "当前 Get-StartApps 中与 ceru/澜音 相关的条目:"
Get-StartApps | Where-Object {
    $_.Name -like '*澜音*' -or $_.Name -like '*ceru*' -or $_.Name -like '*Electron*' -or
    $_.AppID -like '*cerumusic*'
} | Format-Table -AutoSize | Out-Host

# -----------------------------------------------------------------------------
# 阶段 2: 用户确认
# -----------------------------------------------------------------------------
$hasAnything = ($pollutedLinks.Count + $implicitLinks.Count + $pollutedRegs.Count) -gt 0

if (-not $hasAnything) {
    Write-Host ""
    Write-Ok "未发现需要清理的污染。如果仍有图标问题,请尝试注销当前 Windows 用户后重新登录。"
    exit 0
}

if (-not $Force) {
    Write-Host ""
    $confirm = Read-Host "是否继续清理? [y/N]"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "已取消" -ForegroundColor Yellow
        exit 0
    }
}

# -----------------------------------------------------------------------------
# 阶段 3: 清理
# -----------------------------------------------------------------------------
Write-Section "清理阶段"

# 3.1 删除污染的快捷方式
foreach ($p in $pollutedLinks) {
    try {
        Remove-Item -Path $p.Path -Force -ErrorAction Stop
        Write-Ok "已删除 $($p.Path)"
    } catch {
        Write-Hit "删除失败 $($p.Path): $($_.Exception.Message)"
    }
}

# 3.2 删除隐式 lnk
foreach ($p in $implicitLinks) {
    try {
        Remove-Item -Path $p.Path -Force -ErrorAction Stop
        Write-Ok "已删除 $($p.Path)"
    } catch {
        Write-Hit "删除失败 $($p.Path): $($_.Exception.Message)"
    }
}

# 3.3 删除注册表残留
foreach ($p in $pollutedRegs) {
    try {
        Remove-Item -Path $p -Recurse -Force -ErrorAction Stop
        Write-Ok "已删除注册表项 $p"
    } catch {
        Write-Hit "删除注册表项失败 ${p}: $($_.Exception.Message)"
    }
}

# -----------------------------------------------------------------------------
# 阶段 4: 刷新 Shell 缓存 (让 Windows 立即应用清理结果)
# -----------------------------------------------------------------------------
Write-Section "刷新 Shell 缓存"

# 4.1 杀掉 Start Menu / 搜索宿主进程, 触发它们重建索引
@('StartMenuExperienceHost', 'SearchHost', 'SearchApp') | ForEach-Object {
    Stop-Process -Name $_ -Force -ErrorAction SilentlyContinue
    Write-Info "已重启 $_"
}

# 4.2 删除 Start Menu 缓存数据库 (Windows 重新拉起 host 时会重建)
$tempState = "$env:LOCALAPPDATA\Packages\Microsoft.Windows.StartMenuExperienceHost_cw5n1h2txyewy\TempState"
if (Test-Path $tempState) {
    Get-ChildItem -Path $tempState -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Info "已清理 Start Menu TempState 缓存"
}

# 4.3 清图标缓存
& ie4uinit.exe -ClearIconCache
Write-Info "已清图标缓存"

# 4.4 重启 explorer (任务栏图标会跟随刷新)
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Process explorer.exe
Write-Info "已重启 explorer"

# -----------------------------------------------------------------------------
# 阶段 5: 验证
# -----------------------------------------------------------------------------
Write-Section "验证 (等待 5 秒让 Start Menu 重建索引)"
Start-Sleep -Seconds 5

$after = Get-StartApps | Where-Object {
    $_.AppID -like '*cerumusic*' -or $_.Name -like '*澜音*' -or $_.Name -like '*Electron*'
}

if ($after) {
    $after | Format-Table -AutoSize | Out-Host
    $hasElectronName = $after | Where-Object { $_.Name -eq 'Electron' -and $_.AppID -eq $AumidProd }
    if ($hasElectronName) {
        Write-Host ""
        Write-Hit "仍有 'Electron' 关联到生产 AUMID。请注销当前 Windows 用户后重新登录,Start Menu 数据库会强制重建。"
        exit 1
    }
} else {
    Write-Info "Get-StartApps 暂无相关条目 (正常,首次启动澜音后会重新注册)"
}

Write-Host ""
Write-Ok "清理完成!"
Write-Host ""
Write-Host "后续步骤:" -ForegroundColor Cyan
Write-Host "  1. 完全退出澜音 (任务管理器确认 ceru-music.exe 没残留进程)"
Write-Host "  2. 从开始菜单的 ' 澜音 ' 启动 (重要: 从 lnk 启动,不要直接双击 exe)"
Write-Host "  3. 触发一次 Toast 通知 / 播放歌曲, 验证图标和 SMTC 名字"
Write-Host ""
