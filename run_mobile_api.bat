@echo off
setlocal

set BRAIN_HOST=0.0.0.0
set BRAIN_PORT=5001
set BRAIN_DEBUG=1

if not exist .venv\Scripts\python.exe (
  echo [ERROR] Missing .venv\Scripts\python.exe
  echo Please create virtualenv and install requirements first.
  exit /b 1
)

.venv\Scripts\python.exe app.py
