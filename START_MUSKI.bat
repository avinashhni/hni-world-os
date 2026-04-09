@echo off
cd /d %~dp0
title MUSKI LIVE RUNTIME
echo ===============================
echo   STARTING MUSKI LIVE RUNTIME
echo ===============================
echo.
pnpm exec tsx backend/apps/muski-core-runtime/src/index.ts
echo.
echo ===============================
echo   MUSKI PROCESS FINISHED
echo ===============================
echo.
pause
cmd /k