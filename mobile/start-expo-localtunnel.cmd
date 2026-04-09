@echo off
setlocal
cd /d "%~dp0"
npx localtunnel --port 8081 1>expo-localtunnel.log 2>expo-localtunnel.err
