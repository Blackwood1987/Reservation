@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-demo.ps1"
exit /b %errorlevel%
