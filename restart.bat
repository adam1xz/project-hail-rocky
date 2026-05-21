@echo off
echo ============================================
echo  Rocky Desktop - Hard Reset
echo  Clears all settings, history, and logs
echo ============================================
echo.

echo [1/3] Stopping Rocky if running...
taskkill /f /im "rocky-desktop.exe" >nul 2>&1
taskkill /f /im "electron.exe" >nul 2>&1
timeout /t 1 /nobreak >nul

echo [2/3] Clearing app settings (electron-store)...
rmdir /s /q "%APPDATA%\rocky-desktop" >nul 2>&1
rmdir /s /q "%APPDATA%\Electron" >nul 2>&1

echo [3/3] Clearing Rocky data folder (~/.rocky)...
rmdir /s /q "%USERPROFILE%\.rocky" >nul 2>&1

echo.
echo Done. All settings, history, and logs cleared.
echo Rocky will start fresh on next launch.
echo.
pause
