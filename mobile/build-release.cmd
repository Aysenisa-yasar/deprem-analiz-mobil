@echo off
setlocal

set CACHE_DIR=D:\gradle-deprem
set TEMP_DIR=D:\temp-deprem
set MIRROR_DIR=D:\DepremAnalizAndroid\mobile
set APK_PATH=%MIRROR_DIR%\android\app\build\outputs\apk\release\app-release.apk
set AAB_PATH=%MIRROR_DIR%\android\app\build\outputs\bundle\release\app-release.aab

if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

set GRADLE_USER_HOME=%CACHE_DIR%
set TEMP=%TEMP_DIR%
set TMP=%TEMP_DIR%
set NODE_ENV=development
set EXPO_PUBLIC_API_URL=https://depremanaliz.onrender.com

set SDK_ROOT=%ANDROID_HOME%
if "%SDK_ROOT%"=="" set SDK_ROOT=%ANDROID_SDK_ROOT%
if "%SDK_ROOT%"=="" set SDK_ROOT=%LOCALAPPDATA%\Android\Sdk

set APKSIGNER=
for /f "delims=" %%I in ('where /r "%SDK_ROOT%\build-tools" apksigner.bat 2^>nul') do if not defined APKSIGNER set APKSIGNER=%%I

PowerShell -ExecutionPolicy Bypass -File "%~dp0sync-android-workdir.ps1"
if errorlevel 1 exit /b %errorlevel%

pushd "%MIRROR_DIR%\android"
call .\gradlew.bat assembleRelease bundleRelease --no-daemon
set EXIT_CODE=%ERRORLEVEL%
popd

if not "%EXIT_CODE%"=="0" exit /b %EXIT_CODE%

if defined APKSIGNER (
  call "%APKSIGNER%" verify --verbose --print-certs "%APK_PATH%"
  if errorlevel 1 exit /b %ERRORLEVEL%
)

echo.
echo Release APK  : %APK_PATH%
echo Release AAB  : %AAB_PATH%
if defined APKSIGNER echo APK signature verified with: %APKSIGNER%

exit /b 0
