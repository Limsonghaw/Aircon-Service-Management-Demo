. "$PSScriptRoot/Common.ps1"
$PidFile = Join-Path $StateRoot 'server.json'
if (!(Test-Path $PidFile)) { Write-Host 'No recorded server.'; return }
$State = Get-Content $PidFile -Raw | ConvertFrom-Json
$Process = Get-Process -Id $State.Id -ErrorAction SilentlyContinue
if ($Process) {
    if ($Process.StartTime.ToUniversalTime().Ticks -ne $State.Started) { throw 'PID was reused. Refusing to stop an unrelated process.' }
    Stop-Process -Id $Process.Id
    $Process.WaitForExit()
}
Remove-Item -LiteralPath $PidFile
Write-Host 'Stopped. Releases, logs and login keys are preserved.'
