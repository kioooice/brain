@echo off
setlocal

set "ROOT=%~dp0"
set "PYTHON=%ROOT%.venv\Scripts\python.exe"
set "URL=http://127.0.0.1:5001"

if not exist "%PYTHON%" (
    echo .venv not found. Please create the virtual environment first.
    pause
    exit /b 1
)

pushd "%ROOT%"

start "" /min "%PYTHON%" app.py

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$url = '%URL%';" ^
    "for ($i = 0; $i -lt 100; $i++) {" ^
    "  try {" ^
    "    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1;" ^
    "    if ($response.StatusCode -ge 200) { Start-Process $url; exit 0 }" ^
    "  } catch {}" ^
    "  Start-Sleep -Milliseconds 200" ^
    "}" ^
    "Start-Process $url"

popd
