@echo off
cd /d "%~dp0"
echo Iniciando servidor (127.0.0.1:8000). O Tailscale Funnel deve estar ativo.
start "Servidor Cortes" cmd /k ".venv\Scripts\python.exe -m uvicorn servidor:app --host 127.0.0.1 --port 8000 --no-server-header"
