@echo off
rem Entry point for Windows Task Scheduler: publish today's collection as a PR.
cd /d "%~dp0"
if not exist "..\data\logs" mkdir "..\data\logs"
"C:\Program Files\nodejs\node.exe" publish-data.mjs >> "..\data\logs\publish.out" 2>&1
