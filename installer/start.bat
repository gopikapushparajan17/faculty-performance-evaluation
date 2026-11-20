@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
set "BACKEND_DIR=%PROJECT_ROOT%\backend"
set "PYTHON=%PROJECT_ROOT%\installer\runtime-venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo.
    echo ERROR: Application runtime is not installed.
    echo Please run installer\setup.ps1 first.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Faculty Performance Evaluation System
echo ============================================
echo.
echo Starting application server...
echo.

start "Faculty Evaluation Server" /D "%BACKEND_DIR%" "%PYTHON%" -m uvicorn main:app --host 127.0.0.1 --port 8000

echo Waiting for application server...

set "READY="

for /L %%i in (1,1,30) do (
    powershell -NoProfile -Command "try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/health' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {} ; exit 1" >nul 2>&1

    if not errorlevel 1 (
        set "READY=1"
        goto :server_ready
    )

    timeout /t 1 /nobreak >nul
)

echo.
echo ERROR: Application server did not become ready.
echo Please check the server window for details.
echo.
pause
exit /b 1

:server_ready

echo Application server is ready.
echo.
echo Opening application...
start "" http://localhost:8000

echo.
echo Application started at:
echo http://localhost:8000
echo.
echo The server window must remain open while using the application.
echo.

exit /b 0