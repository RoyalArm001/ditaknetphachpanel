@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\exceljs" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo RackMap: http://localhost:3000
echo Keep this window open. Close it to stop RackMap.
node server.js
pause
