param(
    [Parameter(Mandatory)]
    [string]$Model
)

$log = Join-Path $env:USERPROFILE ".phr\logs\install-model.log"
function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] $msg" | Out-File -Append -Encoding utf8 $log
}

Log "Starting model pull: $Model"

# Verify Ollama is available
try {
    $null = Get-Command ollama -ErrorAction Stop
} catch {
    Log "ERROR: ollama not found in PATH - cannot pull model"
    exit 1
}

# Check if model already exists
$existing = & ollama list 2>&1
if ($existing -match [regex]::Escape($Model.Split(':')[0])) {
    Log "Model appears to already be present - skipping pull"
    exit 0
}

Log "Running: ollama pull $Model"
$proc = Start-Process -FilePath "ollama" -ArgumentList "pull $Model" `
    -Wait -PassThru -RedirectStandardOutput (Join-Path $env:USERPROFILE ".phr\logs\ollama-pull.log")

Log "ollama pull exited with code $($proc.ExitCode)"

if ($proc.ExitCode -ne 0) {
    Log "WARNING: model pull returned non-zero exit code"
}
