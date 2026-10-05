@echo off
title Typica Coffee Roasters Server
echo ====================================================
echo   Typica Coffee Roasters - Launching Full-Stack App
echo ====================================================

set NODE_EXE="C:\Users\win 11\.gemini\antigravity\scratch\node22\node-v22.17.0-win-x64\node.exe"

start "" msedge http://localhost:3000
%NODE_EXE% server.js

pause
