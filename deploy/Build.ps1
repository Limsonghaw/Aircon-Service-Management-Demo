. "$PSScriptRoot/Common.ps1"
$Release = Join-Path $ReleaseRoot (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
Push-Location (Join-Path $ProjectRoot 'frontend')
try {
    # Use installed, locked dependencies; npm ci is a separate setup step.
    Invoke-Checked { node node_modules/typescript/bin/tsc -b }
    Invoke-Checked { node node_modules/vite/bin/vite.js build }
} finally { Pop-Location }
Invoke-Checked { dotnet publish (Join-Path $ProjectRoot 'backend/ShengHengAircon.Api.csproj') -c Release --no-restore -o $Release }
New-Item -ItemType Directory -Force -Path (Join-Path $Release 'wwwroot') | Out-Null
Copy-Item (Join-Path $ProjectRoot 'frontend/dist/*') (Join-Path $Release 'wwwroot') -Recurse
Set-Content (Join-Path $StateRoot 'current-release.txt') $Release
Write-Host "Published: $Release. Running processes are unchanged; stop then start to update."
