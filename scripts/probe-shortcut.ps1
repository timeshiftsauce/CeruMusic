# 查看指定应用快捷方式的详细属性（含目标 / AUMID / 图标）。
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\probe-shortcut.ps1 "LX Music"
param([string]$Match = 'LX Music')

$shell = New-Object -ComObject WScript.Shell
$dir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
Get-ChildItem $dir -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match $Match } |
  ForEach-Object {
    $lnk = $shell.CreateShortcut($_.FullName)
    Write-Host "=== $($_.FullName) ==="
    Write-Host "  TargetPath : $($lnk.TargetPath)"
    Write-Host "  Arguments  : $($lnk.Arguments)"
    Write-Host "  IconLocation: $($lnk.IconLocation)"
    Write-Host "  Description: $($lnk.Description)"
    Write-Host "  WorkingDir : $($lnk.WorkingDirectory)"
    Write-Host ""
  }
