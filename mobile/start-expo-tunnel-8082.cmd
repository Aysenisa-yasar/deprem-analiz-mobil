@echo off
setlocal
cd /d "%~dp0"
npx expo start --tunnel --clear --port 8082 1>expo-tunnel.log 2>expo-tunnel.err
