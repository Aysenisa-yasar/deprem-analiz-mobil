@echo off
setlocal
cd /d "%~dp0"
npx ngrok http 8081 --authtoken 5W1bR67GNbWcXqmxZzBG1_56GezNeaX6sSRvn8npeQ8 1>expo-ngrok.log 2>expo-ngrok.err
