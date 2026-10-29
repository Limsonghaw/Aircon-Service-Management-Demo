$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$SettingsFile = Join-Path $PSScriptRoot 'local.settings.json'
if (!(Test-Path $SettingsFile)) { throw 'Copy local.settings.example.json to local.settings.json and configure it first.' }
$Settings = Get-Content -LiteralPath $SettingsFile -Raw | ConvertFrom-Json
function Resolve-DeploymentPath([string] $Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { throw 'A deployment path is missing.' }
    if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
    return [IO.Path]::GetFullPath((Join-Path $ProjectRoot $Value))
}
$ReleaseRoot = Resolve-DeploymentPath $Settings.ReleasePath
$StateRoot = Join-Path $ProjectRoot '.local-deploy'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
function Invoke-Checked([scriptblock] $Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}
