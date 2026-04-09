@echo off
setlocal
cd /d "%~dp0"
npx ngrok http 5000 1>backend-ngrok.log 2>backend-ngrok.err
