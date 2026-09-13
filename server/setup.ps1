# One-time setup for the PrintForge ComfyUI bridge: creates server\.venv and installs its dependencies.
$ErrorActionPreference = 'Stop'
$venv = Join-Path $PSScriptRoot '.venv'
$python = Join-Path $venv 'Scripts\python.exe'

if (-not (Test-Path $python)) {
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3 -m venv $venv } else { python -m venv $venv }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python virtual environment (is Python 3.10+ installed?)' }
}

& $python -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }

Write-Host ''
Write-Host 'Bridge ready. Start ComfyUI, then run:  npm run bridge' -ForegroundColor Green
