@echo off
REM Double-click to open the test menu, or run:  run.bat full
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
pause
