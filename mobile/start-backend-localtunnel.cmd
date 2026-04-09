@echo off
setlocal
cd /d "%~dp0"
npx localtunnel --port 5000 1>backend-localtunnel.log 2>backend-localtunnel.err
