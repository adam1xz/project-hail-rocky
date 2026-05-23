param(
    [Parameter(Mandatory)]
    [string]$Model
)

$log = Join-Path $env:USERPROFILE ".phr\logs\install-model.log"
function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] $msg" | Out-File -Append -Encoding utf8 $log
}

Log "Checking for model: $Model"

# Start ollama service if not running
function Start-OllamaIfNeeded {
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:11434" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {}
    try {
        Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
        $waited = 0
        while ($waited -lt 15) {
            Start-Sleep -Seconds 2; $waited += 2
            try {
                $null = Invoke-WebRequest -Uri "http://localhost:11434" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
                return $true
            } catch {}
        }
    } catch {}
    return $false
}

function Test-ModelInstalled($modelName) {
    # Prefer REST API - more reliable than parsing text
    try {
        $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
        $shortName = ($modelName -split '/')[1] -replace ':.*$', ''
        foreach ($m in $tags.models) {
            if ($m.name -imatch [regex]::Escape($shortName)) {
                return $true
            }
        }
        return $false
    } catch {}

    # Fallback: parse ollama list output
    try {
        $list = & ollama list 2>&1 | Out-String
        $shortName = ($modelName -split '/')[1] -replace ':.*$', ''
        return $list -imatch [regex]::Escape($shortName)
    } catch {}

    return $false
}

if (-not (Start-OllamaIfNeeded)) {
    Log "ERROR: Ollama service did not start - cannot check or pull model"
    exit 1
}

if (Test-ModelInstalled $Model) {
    Log "Model already installed - skipping pull"
    exit 0
}

Log "Model not found - pulling: $Model"
try {
    $outLog = Join-Path $env:USERPROFILE ".phr\logs\ollama-pull.log"
    $proc = Start-Process -FilePath "ollama" -ArgumentList "pull", $Model `
        -Wait -PassThru -RedirectStandardOutput $outLog -WindowStyle Hidden
    Log "ollama pull exited with code $($proc.ExitCode)"
} catch {
    Log "ERROR: $($_.Exception.Message)"
    exit 1
}
