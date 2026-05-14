@echo off
title Wagle Web Server
echo.
echo  ========================================
echo   Wagle Electricals - Web Server
echo  ========================================
echo.
echo  Starting server...
echo  Open your browser and go to:
echo.
echo    http://localhost:5000
echo.
echo  Keep this window open while using the site.
echo  Close this window to stop the server.
echo  ========================================
echo.
cd /d "%~dp0backend"
node server.js
pause
