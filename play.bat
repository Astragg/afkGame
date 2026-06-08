@echo off
cd /d "%~dp0"
title Aetherworld

set PORT=3456
set URL=http://localhost:%PORT%

echo.
echo  Aetherworld
echo  -----------
echo  Starting server at %URL%
echo  Keep this window open while you play.
echo  Close it to stop the server.
echo.

rem Wait for server, then open the correct URL (not index.html)
start /min cmd /c "ping -n 4 127.0.0.1 >nul && start %URL%"

npx --yes serve -l %PORT% .
if errorlevel 1 (
  echo.
  echo  Server failed to start. Make sure Node.js is installed: https://nodejs.org
  pause
)
