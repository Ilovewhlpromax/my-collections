@echo off
rem ============================================================
rem Supabase keepalive - BOOT ping (low resource usage)
rem Uses cmd + curl only (NO PowerShell) to keep memory minimal.
rem - retries up to 5x if network is not ready yet at boot
rem - runs for a few seconds then exits
rem ============================================================
setlocal

rem ---- read config.js (url + anon key) ----
set "SB_URL="
set "SB_ANON="
for /f "usebackq tokens=2 delims='" %%a in (`findstr /c:"url:" "%~dp0config.js"`) do set "SB_URL=%%a"
for /f "usebackq tokens=2 delims='" %%b in (`findstr /c:"anonKey:" "%~dp0config.js"`) do set "SB_ANON=%%b"

if "%SB_ANON%"=="" exit /b 1

rem ---- REST ping (real DB activity, retries for slow boot network) ----
curl -s -o NUL --max-time 12 --connect-timeout 8 --retry 3 --retry-delay 5 -H "apikey: %SB_ANON%" -H "Authorization: Bearer %SB_ANON%" "%SB_URL%/rest/v1/forum_topics?select=id&limit=1"
echo [%date% %time%] boot ping rest exit=%errorlevel% >> "%~dp0keepalive.log"

rem ---- Auth ping ----
curl -s -o NUL --max-time 12 --connect-timeout 8 "%SB_URL%/auth/v1/health"
echo [%date% %time%] boot ping auth exit=%errorlevel% >> "%~dp0keepalive.log"

exit /b 0
