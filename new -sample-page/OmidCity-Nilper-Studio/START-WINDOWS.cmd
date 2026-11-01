@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js, then run this file again.
 pause
 exit /b 1
)
echo Open http://127.0.0.1:4178 in your browser.
echo Keep this window open while using the viewer.
node server.mjs
pause
