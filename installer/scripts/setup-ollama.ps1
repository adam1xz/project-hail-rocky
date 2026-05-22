param(
    [Parameter(Mandatory)]
    [string]$TmpDir
)

$log = Join-Path $env:USERPROFILE ".phr\logs\install-ollama.log"
function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] $msg" | Out-File -Append -Encoding utf8 $log
}

Log "Checking for Ollama..."

# Check if Ollama is already running
function Test-OllamaRunning {
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:11434" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch { return $false }
}

# Check if ollama.exe is in PATH
function Test-OllamaInstalled {
    try {
        $null = Get-Command ollama -ErrorAction Stop
        return $true
    } catch { return $false }
}

if ((Test-OllamaInstalled) -or (Test-OllamaRunning)) {
    Log "Ollama already present - skipping install"
    exit 0
}

# Download Ollama installer
$ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
$ollamaExe = Join-Path $TmpDir "OllamaSetup.exe"

Log "Downloading Ollama from $ollamaUrl"
try {
    Invoke-WebRequest -Uri $ollamaUrl -OutFile $ollamaExe -UseBasicParsing -TimeoutSec 300
} catch {
    Log "ERROR: Failed to download Ollama: $_"
    exit 1
}

if (-not (Test-Path $ollamaExe)) {
    Log "ERROR: Ollama installer not found after download"
    exit 1
}

# Run silent install
Log "Running Ollama silent installer"
$proc = Start-Process -FilePath $ollamaExe -ArgumentList "/silent" -Wait -PassThru
Log "Ollama installer exited with code $($proc.ExitCode)"

# Wait for Ollama service to become available (up to 60s)
Log "Waiting for Ollama service..."
$waited = 0
while (-not (Test-OllamaRunning) -and $waited -lt 60) {
    Start-Sleep -Seconds 3
    $waited += 3
}

if (Test-OllamaRunning) {
    Log "Ollama is ready"
} else {
    Log "WARNING: Ollama did not respond within 60s - model pull may fail"
}
