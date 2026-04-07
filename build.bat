@echo off
setlocal

set "ROOT=%~dp0"
set "PYTHON=%ROOT%.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo .venv not found. Please create the virtual environment first.
    pause
    exit /b 1
)

pushd "%ROOT%"

"%PYTHON%" -m pip install pyinstaller
if errorlevel 1 (
    echo PyInstaller installation failed.
    popd
    pause
    exit /b 1
)

"%PYTHON%" -m PyInstaller --noconfirm --clean --onefile --noconsole --name LingganShouji --add-data "templates;templates" --collect-all webview --collect-all pythonnet --collect-all clr_loader --hidden-import clr launcher.py
if errorlevel 1 (
    echo Build failed.
    popd
    pause
    exit /b 1
)

echo Build complete. The EXE is in dist\LingganShouji.exe
popd
pause
