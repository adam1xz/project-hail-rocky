param(
    [string]$Version    = "1.0.0",
    [switch]$SkipBuild,
    [switch]$SkipAssets,
    [switch]$SkipLauncher
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $ProjectRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function OK($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "    FAIL: $msg" -ForegroundColor Red; exit 1 }

# ---- 1. Prerequisites ----

Step "Checking prerequisites"

$iscc = $null
$isccCmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
$isccFromPath = if ($isccCmd) { $isccCmd.Source } else { $null }
foreach ($p in @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    $isccFromPath
)) {
    if ($p -and (Test-Path $p)) { $iscc = $p; break }
}
if (-not $iscc) {
    Fail "Inno Setup 6 not found.`nDownload from https://jrsoftware.org/isinfo.php"
}
OK "Inno Setup: $iscc"

if (-not (Test-Path "node_modules")) { Fail "Run 'npm install' first" }
OK "node_modules present"

# ---- 2. Generate installer assets (side-panel.png + icon.ico copy) ----

if (-not $SkipAssets) {
    Step "Generating installer assets"
    node installer/generate-installer-assets.js
    if ($LASTEXITCODE -ne 0) { Fail "Asset generation failed" }
    OK "installer/assets/ updated"
} else {
    Warn "Skipping asset generation (--SkipAssets)"
    if (-not (Test-Path "installer\assets\side-panel.png")) {
        Warn "installer\assets\side-panel.png missing - installer will have no wizard art"
    }
    if (-not (Test-Path "installer\assets\icon.ico")) {
        Warn "installer\assets\icon.ico missing - run 'npm run generate-icons' first"
    }
}

# ---- 3. Build Electron app ----

if (-not $SkipBuild) {
    Step "Building Vite frontend"
    npx vite build
    if ($LASTEXITCODE -ne 0) { Fail "vite build failed" }
    OK "Vite build complete"

    Step "Compiling Electron main process"
    npx tsc -p tsconfig.electron.json
    if ($LASTEXITCODE -ne 0) { Fail "TypeScript compile failed" }
    OK "TypeScript compile complete"

    Step "Packaging Electron app (unpacked)"
    if (Test-Path "dist-release") { Remove-Item -Recurse -Force "dist-release" }
    npx electron-builder --dir --config.directories.output=dist-release
    if ($LASTEXITCODE -ne 0) { Fail "electron-builder failed" }

    $unpackedDir = Get-ChildItem "dist-release" -Filter "win-unpacked" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $unpackedDir) { Fail "dist-release\win-unpacked not found after build" }
    OK "Electron app at: $($unpackedDir.FullName)"
} else {
    Warn "Skipping Electron build (--SkipBuild)"
    if (-not (Test-Path "dist-release\win-unpacked")) {
        Fail "dist-release\win-unpacked missing and --SkipBuild set"
    }
}

# ---- 4. Compile AHK launcher ----

if (-not $SkipLauncher) {
    Step "Compiling AHK launcher"
    & "$ProjectRoot\launcher\compile-launcher.ps1"
    if ($LASTEXITCODE -ne 0) { Fail "AHK compile failed" }
    OK "launcher\PHR.exe compiled"
} else {
    Warn "Skipping launcher compile (--SkipLauncher)"
    if (-not (Test-Path "launcher\PHR.exe")) {
        Fail "launcher\PHR.exe missing and --SkipLauncher set"
    }
}

# ---- 5. Prepare output directory ----

if (-not (Test-Path "dist-installer")) {
    New-Item -ItemType Directory "dist-installer" | Out-Null
}

# ---- 6. Run Inno Setup ----

Step "Running Inno Setup compiler"
& $iscc "installer\phr-setup.iss" "/DMyAppVersion=$Version"
if ($LASTEXITCODE -ne 0) { Fail "ISCC compilation failed" }

$output = Get-ChildItem "dist-installer" -Filter "PHR-Setup-*.exe" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($output) {
    $sizeMB = [math]::Round($output.Length / 1MB, 1)
    OK "Installer: $($output.FullName) ($sizeMB MB)"
    Write-Host "`nDone." -ForegroundColor Green
} else {
    Fail "Installer .exe not found in dist-installer\"
}
