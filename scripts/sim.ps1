# sim.ps1 — run dsh-deepseek-cost-live in an ISOLATED simulator profile.
# Fresh DSH_HOME at <repo>\.dsh-sim with its own profile and port; never
# touches the live ~/.dsh profile or port 3080. Copies settings + the
# credentials file so the official balance path is exercised end-to-end.
param([int]$Port = 3199)
$ErrorActionPreference = 'Stop'
$repo   = Split-Path -Parent $PSScriptRoot
$sim    = Join-Path $repo '.dsh-sim'
$pro    = Join-Path $sim 'profiles\web'
$dshBin = 'C:\Users\BI\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh\lib\bin.js'

if (Test-Path $sim) { Remove-Item -Recurse -Force $sim }
New-Item -ItemType Directory -Force -Path $pro | Out-Null
Copy-Item "$env:USERPROFILE\.dsh\settings.yaml"     (Join-Path $sim 'settings.yaml')     -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.dsh\.credentials.yaml" (Join-Path $sim '.credentials.yaml') -ErrorAction SilentlyContinue
# Write files without a BOM (PowerShell 5.1 -Encoding utf8 would add one).
$tgzName = (Get-ChildItem (Join-Path $repo 'dsh-deepseek-cost-live-*.tgz') | Sort-Object Name | Select-Object -Last 1).Name
$tgz   = ($repo -replace '\\','/') + '/' + $tgzName
$json  = '{' + "`"name`": \"dsh-profile-sim\"," + "`"private`": true," + "`"dsh`": { " + "`"profile`": { " + "`"bundles`": [\"@deepseek-ai/dsh-base\", \"@deepseek-ai/dsh-web-app\", \"dsh-deepseek-cost-live\"] } }," + "`"dependencies`": { " + "`"dsh-deepseek-cost-live`": \"file:$tgz\" } }'
[System.IO.File]::WriteAllText((Join-Path $pro 'package.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $pro 'cordis.yml'), '[]' + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $pro 'pnpm-workspace.yaml'), 'packages:' + [Environment]::NewLine + '  - .' + [Environment]::NewLine + [Environment]::NewLine + 'nodeLinker: hoisted' + [Environment]::NewLine + 'autoInstallPeers: false' + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))

Push-Location $pro
pnpm install
Pop-Location
Write-Host "sim profile ready at $sim - booting on port $Port (Ctrl+C to stop)..."
$env:DSH_HOME = $sim
& node $dshBin --profile web --port $Port --no-open
