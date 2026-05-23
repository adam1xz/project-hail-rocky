$phrDir  = Join-Path $env:USERPROFILE ".phr"
$cfgFile = Join-Path $phrDir "config.json"

foreach ($sub in @("", "history", "logs")) {
    $d = if ($sub) { Join-Path $phrDir $sub } else { $phrDir }
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null }
}

if (-not (Test-Path $cfgFile)) {
    [System.IO.File]::WriteAllText($cfgFile, '{"firstRun":true,"language":"en"}', [System.Text.Encoding]::UTF8)
}
