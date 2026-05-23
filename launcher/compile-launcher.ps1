$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$csc = $null

foreach ($p in @(
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)) {
    if (Test-Path $p) { $csc = $p; break }
}
if (-not $csc) {
    $found = Get-ChildItem "C:\Windows\Microsoft.NET\Framework64" -Filter "csc.exe" -Recurse -ErrorAction SilentlyContinue |
             Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { $csc = $found.FullName }
}
if (-not $csc) {
    Write-Error "csc.exe not found. .NET Framework 4.x is required (included with Windows 10/11)."
    exit 1
}

$src  = Join-Path $ScriptDir "PHR-launcher.cs"
$out  = Join-Path $ScriptDir "PHR.exe"
$icon = Join-Path $ScriptDir "..\installer\assets\icon.ico"

Write-Host "Compiler: $csc"
Write-Host "Source:   $src"
Write-Host "Output:   $out"

$cscArgs = @(
    "/nologo",
    "/target:winexe",
    "/optimize+",
    "/out:$out",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Drawing.dll",
    "/reference:System.Net.Http.dll",
    $src
)
if (Test-Path $icon) {
    $cscArgs += "/win32icon:$icon"
}

& $csc @cscArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "csc compilation failed (exit $LASTEXITCODE)"
    exit 1
}

if (-not (Test-Path $out)) {
    Write-Error "csc exited 0 but $out was not created"
    exit 1
}

$kb = [math]::Round((Get-Item $out).Length / 1KB)
Write-Host "Done: $out ($kb KB)"
