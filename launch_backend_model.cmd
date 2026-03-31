@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
"C:\Program Files\PostgreSQL\18\pgAdmin 4\python\python.exe" "%SCRIPT_DIR%launch_backend_model.py"
