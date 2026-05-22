$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot

# Find AHK v2 compiler
$ahkPaths = @(
    "C:\Program Files\AutoHotkey\v2\Ahk2Exe.exe",
    "C:\Program Files\AutoHotkey\Compiler\Ahk2Exe.exe",
    "C:\Program Files (x86)\AutoHotkey\Compiler\Ahk2Exe.exe",
    (Get-Command Ahk2Exe.exe -ErrorAction SilentlyContinue)?.Source
)

$ahkExe = $null
foreach ($p in $ahkPaths) {
    if ($p -and (Test-Path $p)) { $ahkExe = $p; break }
}

if (-not $ahkExe) {
    Write-Error "AutoHotkey v2 compiler (Ahk2Exe.exe) not found.`nInstall AutoHotkey v2 from https://autohotkey.com"
    exit 1
}

$src  = Join-Path $ScriptDir "PHR-launcher.ahk"
$out  = Join-Path $ScriptDir "PHR.exe"
$icon = Join-Path $ScriptDir "..\installer\assets\icon.ico"

$args = @("/in", $src, "/out", $out)
if (Test-Path $icon) {
    $args += @("/icon", $icon)
}

Write-Host "Compiling: $src"
Write-Host "Output:    $out"
& $ahkExe @args
if ($LASTEXITCODE -ne 0) {
    Write-Error "Ahk2Exe failed with exit code $LASTEXITCODE"
    exit 1
}

Write-Host "Done: $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
