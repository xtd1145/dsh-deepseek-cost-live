# restart-probe.ps1 — restart the local dsh web profile and probe the
# dsh-deepseek-cost-live route (modeled on ~/.dsh/restart-dsh-web.ps1).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\BI\.dsh\web-restart.log'
function Log([string]$msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    try { Add-Content -Path $log -Value $line -Encoding UTF8 } catch {}
}
Log '=== restart-probe (dsh-deepseek-cost-live): begin ==='
$preflight = & 'C:\Program Files\nodejs\node.exe' --input-type=module -e "try { await import('file:///C:/Users/BI/.dsh/profiles/web/node_modules/dsh-deepseek-cost-live/lib/index.js'); console.log('PREFLIGHT OK'); } catch (e) { console.log('PREFLIGHT FAIL: ' + (e.message||'').split(String.fromCharCode(10))[0]); process.exit(1); }" 2>&1
Log "preflight: $preflight"
if ($LASTEXITCODE -ne 0) { Log '=== restart-probe: ABORTED (plugin preflight failed) — server left running ==='; exit 1 }
Start-Sleep -Seconds 25
$procs = Get-CimInstance Win32_Process | Where-Object {
    $cl = $_.CommandLine
    $cl -and ($cl -match 'dsh\lib\bin\.js[" ]+web' -or $cl -match '@deepseek-ai/dsh[" ]+web' -or $cl -match 'cmd\.exe /d /s /c dsh web')
}
foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Log "killed $($p.ProcessId)" } catch {} }
Start-Sleep -Seconds 2
$conn = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue
if ($conn) { foreach ($c in $conn) { try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Log "killed listener $($c.OwningProcess)" } catch {} } }
for ($i = 0; $i -lt 40; $i++) { if (-not (Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 500 }
$env:DSH_HOME = 'C:\Users\BI\.dsh'
$env:DSH_PERMISSION_MODE = 'danger-full-access'
$node = 'C:\Program Files\nodejs\node.exe'
$bin  = 'C:\Users\BI\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\dsh\lib\bin.js'
$outF = 'C:\Users\BI\.dsh\web-server.out.log'
$errF = 'C:\Users\BI\.dsh\web-server.err.log'
$cmdline = 'cmd.exe /c ""' + $node + '" "' + $bin + '" web > "' + $outF + '" 2> "' + $errF + '""'
try { $res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmdline; CurrentDirectory = 'C:\Users\BI' }; Log "server spawn ReturnValue=$($res.ReturnValue) pid=$($res.ProcessId)"; if ($res.ReturnValue -ne 0) { exit 1 } } catch { Log "spawn exception: $($_.Exception.Message)"; exit 1 }
$up = $false
for ($i = 0; $i -lt 240; $i++) { Start-Sleep -Milliseconds 500; try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3080/' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { $up = $true; break } } catch {} }
Log ($(if ($up) { 'web root OK' } else { 'WARNING web root not up' }))
$ok = $false
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 500
    try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3080/dsh-deepseek-cost-live/stats' -UseBasicParsing -TimeoutSec 4; if ($r.StatusCode -eq 200 -and $r.Content -match '"ok"\s*:\s*true') { Log "DCL ROUTE OK: " + $r.Content.Substring(0,[Math]::Min(200,$r.Content.Length)); $ok = $true; break } else { Log "dcl probe status=$($r.StatusCode)" } } catch {}
}
if ($ok) { Log '=== restart-probe: SUCCESS ===' } else { Log '=== restart-probe: route NOT responding — check web-server.err.log ===' }
