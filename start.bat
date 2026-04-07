@echo off
setlocal

set "ROOT=%~dp0"
set "PYTHON=%ROOT%.venv\Scripts\python.exe"

if exist "%PYTHON%" (
    pushd "%ROOT%"
    start "" "%PYTHON%" launcher.py
    popd
    goto end
)

echo .venv not found. Please create the virtual environment first.
echo   D:\02-Projects\brain\.venv\Scripts\python.exe app.py

:end
pause
