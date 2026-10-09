# Rode UMA vez, dentro da pasta do projeto:  powershell -ExecutionPolicy Bypass -File .\instalar.ps1
$ErrorActionPreference = "Stop"

python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
& .\.venv\Scripts\python.exe -m pip freeze | Out-File -Encoding ascii requirements.lock.txt

if (-not (Test-Path .env)) {
    @"
CORTES_ORIGENS=https://SEU-SITE.onrender.com
CORTES_MAX_UPLOAD_MB=500
CORTES_RETENCAO_HORAS=24
CORTES_APAGAR_ORIGINAL=1
CORTES_MAX_JOBS_HORA=5
CORTES_MAX_JOBS_DIA=40
CORTES_MAX_HORAS_VIDEO=1
CORTES_LLMS=llama3.1,qwen2.5:7b
"@ | Set-Content -Encoding ascii .env
    Write-Host "Edite o .env e troque CORTES_ORIGENS pelo endereco real do seu site no Render."
}
Write-Host "Instalacao concluida."
