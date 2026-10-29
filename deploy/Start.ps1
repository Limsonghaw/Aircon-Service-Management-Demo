param([switch] $SmokeOnly)
. "$PSScriptRoot/Common.ps1"
$PidFile = Join-Path $StateRoot 'server.json'
if (Test-Path $PidFile) { throw 'A server state file exists. Run Stop.ps1 before starting again.' }
$Release = (Get-Content (Join-Path $StateRoot 'current-release.txt') -Raw).Trim()
if (!(Test-Path (Join-Path $Release 'wwwroot/index.html'))) { throw 'Build.ps1 must complete first.' }
if (!$SmokeOnly -and ($Settings.Environment.Supabase__Enabled -ne 'true' -or $Settings.Environment.Deployment__DataTier -ne 'test')) {
    throw 'Normal startup requires an explicitly confirmed test Supabase project. Use -SmokeOnly for offline hosting checks.'
}
$Previous = @{}
try {
    foreach ($Property in $Settings.Environment.PSObject.Properties) {
        $Previous[$Property.Name] = [Environment]::GetEnvironmentVariable($Property.Name, 'Process')
        $Value = [string] $Property.Value
        if ($Property.Name -eq 'DataProtection__KeyPath') { $Value = Resolve-DeploymentPath $Value }
        if ($Property.Name -eq 'PLAYWRIGHT_BROWSERS_PATH' -and !$Value) { $Value = Join-Path $env:LOCALAPPDATA 'ms-playwright' }
        [Environment]::SetEnvironmentVariable($Property.Name, $Value, 'Process')
    }
    if ($SmokeOnly) {
        $env:Supabase__Enabled = 'false'
        $env:Supabase__ServiceRoleKey = ''
    }
    $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $Process = Start-Process -FilePath (Get-Command dotnet).Source -ArgumentList 'ShengHengAircon.Api.dll' -WorkingDirectory $Release -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $StateRoot "$Stamp.stdout.log") -RedirectStandardError (Join-Path $StateRoot "$Stamp.stderr.log")
    @{ Id = $Process.Id; Started = $Process.StartTime.ToUniversalTime().Ticks; Release = $Release } | ConvertTo-Json | Set-Content $PidFile
    Write-Host "Started PID $($Process.Id). URLs: $($Settings.Environment.ASPNETCORE_URLS). Check /api/health and logs."
} finally {
    foreach ($Name in $Previous.Keys) { [Environment]::SetEnvironmentVariable($Name, $Previous[$Name], 'Process') }
}
