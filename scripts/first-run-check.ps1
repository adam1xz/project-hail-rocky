param(
    [switch]$Quiet
)

# Pre-install dependency checker.
# Called by build-installer.ps1 and optionally by the installer wizard.
# Outputs a structured result for the wizard to display.

$results = @{
    Python    = @{ OK = $false; Version = ""; Message = "" }
    Ollama    = @{ OK = $false; Running = $false; Message = "" }
    DiskSpace = @{ OK = $false; FreeGB = 0; Message = "" }
    NodeJS    = @{ OK = $false; Version = ""; Message = "" }
}

# ---- Python ----

$pythonFound = $false
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python (\d+\.\d+)") {
            $major, $minor = $Matches[1].Split('.') | ForEach-Object { [int]$_ }
            if ($major -ge 3 -and $minor -ge 10) {
                $results.Python.OK      = $true
                $results.Python.Version = $Matches[1]
                $results.Python.Message = "Python $($Matches[1]) found ($cmd)"
                $pythonFound = $true
                break
            } else {
                $results.Python.Message = "Python $($Matches[1]) found but 3.10+ is required"
            }
        }
    } catch {}
}
if (-not $pythonFound -and -not $results.Python.Message) {
    $results.Python.Message = "Python not found in PATH"
}

# ---- Ollama ----

try {
    $null = Get-Command ollama -ErrorAction Stop
    $results.Ollama.OK = $true
    $results.Ollama.Message = "Ollama found in PATH"
} catch {
    $results.Ollama.Message = "Ollama not installed (will be downloaded)"
}

try {
    $resp = Invoke-WebRequest -Uri "http://localhost:11434" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
    $results.Ollama.Running = $true
    $results.Ollama.Message += " (service running)"
} catch {
    $results.Ollama.Message += " (service not running)"
}

# ---- Disk space (~10 GB recommended: model 4-8 GB + app ~500 MB + venv ~500 MB) ----

$installDrive = (Split-Path $env:LOCALAPPDATA -Qualifier)
$disk = Get-PSDrive ($installDrive.TrimEnd(':'))
$freeGB = [math]::Round($disk.Free / 1GB, 1)
$results.DiskSpace.FreeGB = $freeGB
if ($freeGB -ge 10) {
    $results.DiskSpace.OK      = $true
    $results.DiskSpace.Message = "$freeGB GB free on $installDrive (OK)"
} else {
    $results.DiskSpace.Message = "$freeGB GB free on $installDrive (10 GB recommended)"
}

# ---- Node.js (needed only for building, not for running) ----

try {
    $nodeVer = & node --version 2>&1
    if ($nodeVer -match "v(\d+)") {
        $major = [int]$Matches[1]
        $results.NodeJS.OK      = $major -ge 18
        $results.NodeJS.Version = $nodeVer
        $results.NodeJS.Message = "Node.js $nodeVer"
        if (-not $results.NodeJS.OK) {
            $results.NodeJS.Message += " (18+ required for build)"
        }
    }
} catch {
    $results.NodeJS.Message = "Node.js not found (only needed to build from source)"
}

# ---- Output ----

if ($Quiet) {
    $results | ConvertTo-Json -Depth 3
} else {
    Write-Host "`nPHR Pre-Install Check" -ForegroundColor Cyan
    Write-Host "---------------------"
    foreach ($key in $results.Keys) {
        $item = $results[$key]
        $status = if ($item.OK) { "[OK]  " } else { "[WARN]" }
        $color  = if ($item.OK) { "Green" } else { "Yellow" }
        Write-Host "$status $key`: $($item.Message)" -ForegroundColor $color
    }
    Write-Host ""
}

exit 0
