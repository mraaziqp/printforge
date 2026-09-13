@echo off
rem Double-click to start ComfyUI, the PrintForge bridge and the web app, then open the browser.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-printforge.ps1"
if errorlevel 1 pause
