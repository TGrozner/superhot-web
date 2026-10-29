@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20+ manquant : https://nodejs.org/
  pause
  exit /b 1
)
start "FRAME//BREAK local server" cmd /k "node server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173"
