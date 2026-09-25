@echo off
title Fluxa IPTV - Desktop
cd /d "%~dp0"
echo ===================================================
echo           FLUXA IPTV - APPLICATION DESKTOP
echo ===================================================

:: Verifier si le backend Python tourne deja
netstat -ano | findstr :8000 >nul
if %errorlevel% neq 0 (
    echo [1/3] Demarrage du backend Python...
    start /b python backend/run.py
    timeout /t 2 /nobreak >nul
) else (
    echo [1/3] Backend Python deja actif sur le port 8000.
)

:: Verifier si Next.js tourne deja
netstat -ano | findstr :3001 >nul
if %errorlevel% neq 0 (
    echo [2/3] Demarrage du serveur Next.js...
    start /b npx next dev -p 3001
    timeout /t 3 /nobreak >nul
) else (
    echo [2/3] Serveur Next.js deja actif sur le port 3001.
)

echo [3/3] Ouverture de la fenetre Fluxa IPTV Desktop...
call npx electron .
