$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot "backend"
$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonExe)) {
    python -m venv (Join-Path $backendDir ".venv")
}

& $pythonExe -m pip install -r (Join-Path $backendDir "requirements-build.txt")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $pythonExe -m PyInstaller `
    --noconfirm `
    --clean `
    --distpath (Join-Path $backendDir "dist") `
    --workpath (Join-Path $backendDir "build-pyinstaller") `
    (Join-Path $backendDir "fluxa-backend.spec")

exit $LASTEXITCODE
