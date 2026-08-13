@echo off
cd /d "%~dp0"

set "PYTHON="
where python >nul 2>nul && set "PYTHON=python"
if not defined PYTHON where py >nul 2>nul && set "PYTHON=py"

if not defined PYTHON (
    echo [ERROR] Python not found. Install from https://python.org
    pause
    exit /b 1
)

%PYTHON% server.py

pause
