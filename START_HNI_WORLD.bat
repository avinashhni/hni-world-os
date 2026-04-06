@echo off
echo Starting HNI WORLD Offline OS...

cd /d %~dp0

echo Running system check...
powershell -ExecutionPolicy Bypass -File scripts\01_machine_check.ps1

pause