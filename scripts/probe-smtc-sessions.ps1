# 枚举当前 SMTC 会话及其 AUMID，用于排查「卡片不显示应用名」。
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\probe-smtc-sessions.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, $t) {
  $m = $asTaskGeneric.MakeGenericMethod($t)
  $task = $m.Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = $mgr.GetSessions()

Write-Host "SMTC 会话数: $($sessions.Count)"
foreach ($s in $sessions) {
  $aumid = $s.SourceAppUserModelId
  $info = $null
  try { $info = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]) } catch {}
  $title = if ($info) { $info.Title } else { '?' }
  $artist = if ($info) { $info.Artist } else { '?' }
  Write-Host "  AUMID = '$aumid'"
  Write-Host "    标题 = '$title'  歌手 = '$artist'"
}
