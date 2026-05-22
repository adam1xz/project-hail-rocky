param(
    [string]$Version = "1.0.0",
    [switch]$SkipBuild,
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
$issccPaths = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    (Get-Command ISCC.exe -ErrorAction SilentlyContinue)?.Source
)
foreach ($p in $issccPaths) {
    if ($p -and (Test-Path $p)) { $iscc = $p; break }
}
if (-not $iscc) {
    Fail "Inno Setup 6 not found. Download from https://jrsoftware.org/isinfo.php"
}
OK "Inno Setup: $iscc"

if (-not (Test-Path "node_modules")) { Fail "Run 'npm install' first" }
OK "node_modules present"

# ---- 2. Build Electron app ----

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

    $unpackedDir = Get-ChildItem "dist-release" -Filter "win-unpacked" -Directory | Select-Object -First 1
    if (-not $unpackedDir) { Fail "dist-release\win-unpacked not found after build" }
    OK "Electron app packaged: $($unpackedDir.FullName)"
} else {
    Warn "Skipping build (--SkipBuild)"
    if (-not (Test-Path "dist-release\win-unpacked")) {
        Fail "dist-release\win-unpacked missing and --SkipBuild set"
    }
}

# ---- 3. Compile AHK launcher ----

if (-not $SkipLauncher) {
    Step "Compiling AHK launcher"
    & "$ProjectRoot\launcher\compile-launcher.ps1"
    if ($LASTEXITCODE -ne 0) { Fail "AHK compile failed" }
    OK "PHR.exe compiled"
} else {
    Warn "Skipping launcher compile (--SkipLauncher)"
    if (-not (Test-Path "launcher\PHR.exe")) {
        Fail "launcher\PHR.exe missing and --SkipLauncher set"
    }
}

# ---- 4. Generate QR code image ----

Step "Generating QR code image"
$qrTarget = "$ProjectRoot\installer\assets\qr-mobile.bmp"
$qrUrl    = "https://github.com/adam1xz/project-hail-rocky-app/releases"
try {
    # Use Python + qrcode library if available
    $qrScript = @"
import sys
try:
    import qrcode
    from PIL import Image
    qr = qrcode.make('$qrUrl')
    qr.convert('RGB').save(r'$qrTarget', 'BMP')
    print('QR generated')
except ImportError:
    print('qrcode not available - skipping QR image generation')
    sys.exit(1)
"@
    $qrScript | python - 2>&1 | Write-Host
    if (Test-Path $qrTarget) { OK "QR image generated" }
} catch {
    Warn "Could not generate QR image (install 'qrcode pillow' to enable). Using placeholder."
}

# Check required assets
Step "Checking installer assets"
$requiredAssets = @(
    "installer\assets\icon.ico",
    "installer\assets\side-panel.bmp"
)
foreach ($a in $requiredAssets) {
    if (-not (Test-Path $a)) {
        Warn "Missing asset: $a -- installer will use Inno Setup defaults"
    } else {
        OK $a
    }
}

# ---- 5. Create output directory ----

if (-not (Test-Path "dist-installer")) {
    New-Item -ItemType Directory "dist-installer" | Out-Null
}

# ---- 6. Run Inno Setup ----

Step "Running Inno Setup compiler"
& $iscc "installer\phr-setup.iss" /DMyAppVersion="$Version"
if ($LASTEXITCODE -ne 0) { Fail "ISCC failed" }

$output = Get-ChildItem "dist-installer" -Filter "PHR-Setup-*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($output) {
    OK "Installer created: $($output.FullName)"
    Write-Host "`nDone. Output: $($output.FullName)" -ForegroundColor Green
} else {
    Fail "Installer .exe not found in dist-installer\"
}
