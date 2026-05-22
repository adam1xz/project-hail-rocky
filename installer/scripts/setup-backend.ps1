param(
    [Parameter(Mandatory)]
    [string]$AppDir
)

$venvDir     = Join-Path $AppDir "backend\venv"
$reqFile     = Join-Path $AppDir "backend\requirements.txt"
$pythonExe   = "python"

$logDir = Join-Path $env:USERPROFILE ".phr\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force $logDir | Out-Null }
$log = Join-Path $logDir "install-backend.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] $msg" | Out-File -Append -Encoding utf8 $log
}

Log "Starting backend setup. AppDir=$AppDir"

# Find Python 3.10+
$candidates = @("python", "python3", "py")
foreach ($c in $candidates) {
    try {
        $ver = & $c --version 2>&1
        if ($ver -match "Python 3\.(\d+)" -and [int]$Matches[1] -ge 10) {
            $pythonExe = $c
            Log "Found Python: $ver via '$c'"
            break
        }
    } catch {}
}

# Create venv
Log "Creating venv at $venvDir"
& $pythonExe -m venv $venvDir 2>&1 | ForEach-Object { Log $_ }

$venvPython = Join-Path $venvDir "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Log "ERROR: venv creation failed"
    exit 1
}

# Upgrade pip silently
Log "Upgrading pip"
& $venvPython -m pip install --upgrade pip --quiet 2>&1 | ForEach-Object { Log $_ }

# Install requirements
if (Test-Path $reqFile) {
    Log "Installing requirements from $reqFile"
    & $venvPython -m pip install -r $reqFile --quiet 2>&1 | ForEach-Object { Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Log "WARNING: pip install exited with code $LASTEXITCODE"
    }
} else {
    Log "WARNING: requirements.txt not found at $reqFile"
}

Log "Backend setup complete"
