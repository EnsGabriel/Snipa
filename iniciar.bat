<<<<<<< HEAD
@echo off
cd /d "%~dp0"
echo Iniciando servidor (127.0.0.1:8000). O Tailscale Funnel deve estar ativo.
start "Servidor Cortes" cmd /k ".venv\Scripts\python.exe -m uvicorn servidor:app --host 127.0.0.1 --port 8000 --no-server-header"
=======
@echo off
cd /d "%~dp0"
echo Iniciando servidor (127.0.0.1:8000). O Tailscale Funnel deve estar ativo.
start "Servidor Cortes" cmd /k ".venv\Scripts\python.exe -m uvicorn servidor:app --host 127.0.0.1 --port 8000 --no-server-header"
>>>>>>> d3e48b7c8976f262e51eec0d43f2eae9c5cb815a
