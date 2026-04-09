@echo off
setlocal

set CACHE_DIR=D:\gradle-deprem
set TEMP_DIR=D:\temp-deprem
set MIRROR_DIR=D:\DepremAnalizAndroid\mobile

if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

set GRADLE_USER_HOME=%CACHE_DIR%
set TEMP=%TEMP_DIR%
set TMP=%TEMP_DIR%
set "NODE_ENV=development"

PowerShell -ExecutionPolicy Bypass -File "%~dp0sync-android-workdir.ps1"
if errorlevel 1 exit /b %errorlevel%

pushd "%MIRROR_DIR%"
npx expo run:android
set EXIT_CODE=%ERRORLEVEL%
popd

exit /b %EXIT_CODE%
