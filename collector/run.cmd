@echo off
rem Entry point for Windows Task Scheduler: collect 06:45-10:30 today.
rem The model horizon runs to the 10:15 slot, so collection goes past the 09:30 peak.
cd /d "%~dp0"
if not exist "..\data\logs" mkdir "..\data\logs"
"C:\Program Files\nodejs\node.exe" collect.mjs --start 06:45 --end 10:30 >> "..\data\logs\scheduler.out" 2>&1
