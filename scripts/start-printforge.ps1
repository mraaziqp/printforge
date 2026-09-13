# Starts PrintForge: ComfyUI (:8188) and the bridge (:8000), which also serves the built web app.
# Anything already running is reused; the web app is rebuilt when its sources change and the bridge
# is restarted when its code is newer than the running process.
# Run via "Start PrintForge.cmd", or: npm start
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$appUrl = 'http://127.0.0.1:8000/'

# ComfyUI install used by Comfy Desktop (same arguments its launcher passes)
$comfyDir = 'E:\MediaGen\MediaGen\ComfyUI'
$comfyPython = Join-Path $comfyDir '.venv\Scripts\python.exe'
$desktopData = Join-Path $env:APPDATA 'Comfy Desktop'
$sharedDir = Join-Path $env:LOCALAPPDATA 'Comfy-Desktop\ComfyUI-Shared'

function Test-Url([string]$url) {
    try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

function Wait-Url([string]$url, [string]$name, [int]$timeoutSec) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Url $url) { Write-Host "  $name is up" -ForegroundColor Green; return }
        Start-Sleep -Seconds 2
    }
    throw "$name did not start within $timeoutSec seconds ($url)"
}

Write-Host 'PrintForge' -ForegroundColor Cyan

# 1. ComfyUI
if (Test-Url 'http://127.0.0.1:8188/system_stats') {
    Write-Host '  ComfyUI already running' -ForegroundColor Green
} else {
    if (-not (Test-Path $comfyPython)) { throw "ComfyUI not found at $comfyDir - update `$comfyDir in this script" }
    Write-Host '  Starting ComfyUI (about 1-2 minutes)...'
    $comfyArgs = @('main.py', '--enable-manager', '--listen', '127.0.0.1', '--port', '8188')
    $modelPaths = Join-Path $desktopData 'shared_model_paths.yaml'
    if (Test-Path $modelPaths) { $comfyArgs += @('--extra-model-paths-config', "`"$modelPaths`"") }
    if (Test-Path $sharedDir) {
        $comfyArgs += @('--output-directory', "`"$sharedDir\output`"", '--input-directory', "`"$sharedDir\input`"")
    }
    Start-Process -FilePath $comfyPython -ArgumentList $comfyArgs -WorkingDirectory $comfyDir -WindowStyle Minimized
    Wait-Url 'http://127.0.0.1:8188/system_stats' 'ComfyUI' 300
}

# 2. Web app build (skipped when dist is newer than every source file)
$distIndex = Join-Path $root 'dist\index.html'
$sources = 'src', 'index.html', 'package.json', 'vite.config.ts', 'tsconfig.json' | ForEach-Object { Join-Path $root $_ }
$newestSource = Get-ChildItem $sources -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ((Test-Path $distIndex) -and $newestSource.LastWriteTime -le (Get-Item $distIndex).LastWriteTime) {
    Write-Host '  Web app build is up to date' -ForegroundColor Green
} else {
    Push-Location $root
    try {
        if (-not (Test-Path (Join-Path $root 'node_modules'))) {
            Write-Host '  Installing web dependencies...'
            npm install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
        }
        Write-Host '  Building web app...'
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Web app build failed (see output above)' }
    } finally {
        Pop-Location
    }
}

# 3. Bridge (restarted when bridge.py changed since it started)
$bridgePython = Join-Path $root 'server\.venv\Scripts\python.exe'
$bridgeScript = Get-Item (Join-Path $root 'server\bridge.py')
$running = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -match 'server[\\/]bridge\.py' })
$stale = $running | Where-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).StartTime -lt $bridgeScript.LastWriteTime }
if ($stale) {
    Write-Host '  Restarting bridge (code updated)...'
    $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1
}

$bridgeUp = $false
try { $bridgeUp = (Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 5).service -eq 'printforge-bridge' } catch {}
if ($bridgeUp) {
    Write-Host '  Bridge already running' -ForegroundColor Green
} else {
    if (Test-Url $appUrl) { throw 'Port 8000 is used by another app. Close it or set PF_BRIDGE_PORT.' }
    if (-not (Test-Path $bridgePython)) {
        Write-Host '  Setting up bridge environment...'
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'server\setup.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Bridge setup failed' }
    }
    Write-Host '  Starting bridge...'
    Start-Process -FilePath $bridgePython -ArgumentList 'server/bridge.py' -WorkingDirectory $root -WindowStyle Minimized
    Wait-Url 'http://127.0.0.1:8000/health' 'Bridge' 60
}

$health = Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 60
if ($health.ok) {
    Write-Host "Ready: $appUrl" -ForegroundColor Green
} else {
    Write-Host 'Running, but generation is not ready:' -ForegroundColor Yellow
    @($health.missing_models) + @($health.missing_nodes) | Where-Object { $_ } | ForEach-Object { Write-Host "  missing: $_" -ForegroundColor Yellow }
    if ($health.workflow_error) { Write-Host "  $($health.workflow_error)" -ForegroundColor Yellow }
}

if (-not $NoBrowser) {
    # Open as a standalone app window when Edge or Chrome is available
    $browser = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($browser) { Start-Process $browser "--app=$appUrl" } else { Start-Process $appUrl }
}
