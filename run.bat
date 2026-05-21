@echo off
setlocal

echo [Rocky Desktop] Starting...
cd /d "%~dp0"

REM Compile electron main process
echo [Rocky Desktop] Compiling Electron main...
call npx tsc -p tsconfig.electron.json
if errorlevel 1 (
  echo [ERROR] TypeScript compilation failed.
  pause
  exit /b 1
)

REM Start app in dev mode
echo [Rocky Desktop] Launching...
set DEV=true
call npx concurrently -k -n VITE,ELECTRON -c cyan,yellow ^
  "npx vite --port=3000" ^
  "electron ."
