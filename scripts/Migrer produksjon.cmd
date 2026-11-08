@echo off
rem Dobbeltklikk denne fila for å oppdatere tabellene i produksjonsdatabasen.
rem Den spør etter DATABASE_URL i et eget vindu. Adressen vises ikke og lagres ikke.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0migrer-produksjon.ps1"
echo.
pause
