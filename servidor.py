#!/usr/bin/env python3
"""
servidor.py - API FastAPI para o sistema de cortes (com seguranca).

Seguranca embutida:
  - sem login: protecao por origem (CORS), limite de jobs por hora por IP e teto diario total
  - escuta so em 127.0.0.1 (quem expoe e o Tailscale Funnel)
  - CORS restrito ao seu site; docs/openapi desligados
  - upload: limite de tamanho, extensoes permitidas, ffprobe valida o arquivo
  - links: so http/https e sem enderecos internos (anti-SSRF)
  - modelos de Whisper/LLM em lista fechada
  - IDs aleatorios; downloads por link assinado que expira em 1 h
  - apaga o video original ao terminar e tudo apos X horas
  - nao grava links nem chaves em log
"""
import hashlib
import hmac
import json
import logging
import os
import queue
import re
import secrets
import shutil
import threading
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import video_cortes as vc

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cortes")

# ---------------------------- configuracao ----------------------------------
ORIGENS = [o.strip() for o in os.getenv("CORTES_ORIGENS", "").split(",") if o.strip()]
DADOS = Path(os.getenv("CORTES_DADOS", "dados")).resolve()
MAX_UPLOAD = int(os.getenv("CORTES_MAX_UPLOAD_MB", "2048")) * 1024 * 1024
RETENCAO_H = float(os.getenv("CORTES_RETENCAO_HORAS", "24"))
APAGAR_ORIGINAL = os.getenv("CORTES_APAGAR_ORIGINAL", "1") == "1"
MAX_JOBS_HORA = int(os.getenv("CORTES_MAX_JOBS_HORA", "10"))
MAX_FILA = int(os.getenv("CORTES_MAX_FILA", "5"))
MAX_HORAS_VIDEO = float(os.getenv("CORTES_MAX_HORAS_VIDEO", "4"))
WHISPER_OK = {"small", "medium", "large-v3", "large-v3-turbo"}
LLM_OK = {m.strip() for m in os.getenv("CORTES_LLMS", "llama3.1,qwen2.5:7b").split(",") if m.strip()}
EXT_OK = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
ID_RE = re.compile(r"[0-9a-f]{32}")
NOME_RE = re.compile(r"clip_[0-9]{2}\.mp4")
MAX_DIA = int(os.getenv("CORTES_MAX_JOBS_DIA", "40"))
CHAVE_DOWNLOAD = secrets.token_bytes(32)  # assina os links de download; muda a cada reinicio


# ---------------------------- limitador simples -----------------------------
class Janela:
    def __init__(self, maximo, segundos):
        self.maximo, self.segundos = maximo, segundos
        self.eventos = defaultdict(deque)
        self.trava = threading.Lock()

    def _limpar(self, chave):
        q, corte = self.eventos[chave], time.time() - self.segundos
        while q and q[0] < corte:
            q.popleft()
        return q

    def cheia(self, chave):
        with self.trava:
            return len(self._limpar(chave)) >= self.maximo

    def registrar(self, chave):
        with self.trava:
            self._limpar(chave).append(time.time())


CRIACOES = Janela(MAX_JOBS_HORA, 3600)  # por IP
TOTAL_DIA = Janela(MAX_DIA, 86400)      # total de todos, protege a placa


def ip_cliente(req: Request):
    # o Funnel repassa pelo proxy local; o IP real vem no fim do X-Forwarded-For
    fw = req.headers.get("x-forwarded-for", "")
    if fw:
        return fw.split(",")[-1].strip()
    return req.client.host if req.client else "?"


# ---------------------------- estado dos jobs -------------------------------
JOBS = {}
ENTRADAS = {}  # links ficam so na memoria (nunca em disco/log)
TRAVA = threading.Lock()
FILA = queue.Queue()


def gravar(jid, **campos):
    with TRAVA:
        j = JOBS[jid]
        j.update(campos)
        try:
            (DADOS / jid / "status.json").write_text(json.dumps(j), encoding="utf-8")
        except OSError:
            pass


def assinar(jid, nome, exp):
    msg = f"{jid}/{nome}/{exp}".encode()
    return hmac.new(CHAVE_DOWNLOAD, msg, hashlib.sha256).hexdigest()


def visao_publica(j):
    clips = []
    if j["estado"] == "concluido":
        exp = int(time.time()) + 3600
        for c in j.get("clips", []):
            clips.append({**c, "url": f"/baixar/{j['id']}/{c['arquivo']}?exp={exp}"
                                       f"&sig={assinar(j['id'], c['arquivo'], exp)}"})
    return {"id": j["id"], "estado": j["estado"], "etapa": j.get("etapa", ""),
            "progresso": j.get("progresso", 0), "erro": j.get("erro", ""), "clips": clips}


# ---------------------------- trabalhador (1 por vez: a GPU e uma so) -------
def executar(jid):
    j = JOBS[jid]
    pasta = DADOS / jid
    try:
        gravar(jid, estado="processando", etapa="Preparando", progresso=2)
        if jid in ENTRADAS:
            gravar(jid, etapa="Baixando o video", progresso=4)
            video = vc.baixar_url(ENTRADAS.pop(jid), pasta)
        else:
            video = next(pasta.glob("original.*"))
        vc.verificar_midia(video, MAX_HORAS_VIDEO)
        p = j["params"]
        res = vc.processar(
            video, pasta, p["cortes"], p["dmin"], p["dmax"], p["whisper"], p["llm"], p["idioma"],
            etapa=lambda nome, pct: gravar(jid, etapa=nome, progresso=pct),
        )
        gravar(jid, estado="concluido", etapa="Pronto", progresso=100, clips=res["cortes"])
    except vc.ErroCortes as e:
        log.warning("job %s falhou: %s | %s", jid, e.msg, e.detalhe[:200])
        gravar(jid, estado="erro", erro=e.msg)
    except Exception:
        log.exception("job %s: erro inesperado", jid)
        gravar(jid, estado="erro", erro="Erro interno ao processar o video.")
    finally:
        ENTRADAS.pop(jid, None)
        if APAGAR_ORIGINAL:
            for f in list(pasta.glob("original.*")) + [pasta / "audio.wav"]:
                try:
                    f.unlink()
                except OSError:
                    pass


def trabalhador():
    while True:
        jid = FILA.get()
        try:
            executar(jid)
        finally:
            FILA.task_done()


def faxineiro():
    while True:
        time.sleep(1800)
        limite = time.time() - RETENCAO_H * 3600
        for pasta in DADOS.iterdir():
            try:
                if not (pasta.is_dir() and ID_RE.fullmatch(pasta.name)):
                    continue
                if JOBS.get(pasta.name, {}).get("estado") in ("fila", "processando"):
                    continue
                if pasta.stat().st_mtime < limite:
                    shutil.rmtree(pasta, ignore_errors=True)
                    JOBS.pop(pasta.name, None)
                    log.info("job %s apagado (retencao)", pasta.name)
            except OSError:
                pass


# ---------------------------- app -------------------------------------------
@asynccontextmanager
async def ciclo(app):
    for exe in ("ffmpeg", "ffprobe"):
        if not shutil.which(exe):
            raise RuntimeError(f"{exe} nao encontrado no PATH.")
    DADOS.mkdir(parents=True, exist_ok=True)
    for pasta in DADOS.iterdir():  # recarrega jobs antigos; os interrompidos viram erro
        st = pasta / "status.json"
        if pasta.is_dir() and ID_RE.fullmatch(pasta.name) and st.exists():
            try:
                j = json.loads(st.read_text(encoding="utf-8"))
                if j.get("estado") in ("fila", "processando"):
                    j.update(estado="erro", erro="O servidor foi reiniciado durante o processamento.")
                JOBS[pasta.name] = j
            except (OSError, json.JSONDecodeError):
                pass
    threading.Thread(target=trabalhador, daemon=True).start()
    threading.Thread(target=faxineiro, daemon=True).start()
    log.info("Servidor pronto. Dados em %s", DADOS)
    yield


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=ciclo)
app.add_middleware(
    CORSMiddleware, allow_origins=ORIGENS, allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["X-API-Key", "Content-Type"], max_age=600,
)


@app.middleware("http")
async def cabecalhos(request: Request, call_next):
    if request.method == "POST":
        tam = request.headers.get("content-length")
        if tam and tam.isdigit() and int(tam) > MAX_UPLOAD + 1024 * 1024:
            return JSONResponse({"detail": "Arquivo grande demais."}, status_code=413)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.get("/saude")
def saude():
    return {"ok": True}


@app.post("/jobs", status_code=202)
def criar_job(
    req: Request,
    arquivo: Optional[UploadFile] = File(None),
    url: str = Form(""),
    cortes: int = Form(5, ge=1, le=10),
    dmin: int = Form(30, ge=10, le=120),
    dmax: int = Form(60, ge=15, le=180),
    whisper: str = Form("medium"),
    llm: str = Form("llama3.1"),
    idioma: str = Form("pt"),
):
    ip = ip_cliente(req)
    if CRIACOES.cheia(ip):
        raise HTTPException(429, "Limite de videos por hora atingido.")
    if TOTAL_DIA.cheia("todos"):
        raise HTTPException(429, "Limite diario de videos atingido. Tente amanha.")
    if bool(arquivo and arquivo.filename) == bool(url.strip()):
        raise HTTPException(400, "Envie um arquivo OU um link.")
    if dmin >= dmax:
        raise HTTPException(400, "A duracao minima deve ser menor que a maxima.")
    if whisper not in WHISPER_OK or llm not in LLM_OK or not re.fullmatch(r"auto|[a-z]{2}", idioma):
        raise HTTPException(400, "Opcao invalida.")
    if FILA.qsize() >= MAX_FILA:
        raise HTTPException(503, "Fila cheia. Tente novamente em alguns minutos.")

    if url.strip():
        try:
            url = vc.validar_url(url)
        except vc.ErroCortes as e:
            raise HTTPException(400, e.msg)

    jid = uuid.uuid4().hex
    pasta = DADOS / jid
    pasta.mkdir(parents=True)

    if arquivo and arquivo.filename:
        ext = Path(arquivo.filename).suffix.lower()
        if ext not in EXT_OK:
            shutil.rmtree(pasta, ignore_errors=True)
            raise HTTPException(400, "Formato nao permitido.")
        total, estourou = 0, False
        with open(pasta / f"original{ext}", "wb") as f:
            while chunk := arquivo.file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD:
                    estourou = True
                    break
                f.write(chunk)
        if estourou:
            shutil.rmtree(pasta, ignore_errors=True)
            raise HTTPException(413, "Arquivo grande demais.")
    else:
        ENTRADAS[jid] = url

    CRIACOES.registrar(ip)
    TOTAL_DIA.registrar("todos")
    with TRAVA:
        JOBS[jid] = {"id": jid, "estado": "fila", "etapa": "Na fila", "progresso": 0,
                     "criado_em": time.time(),
                     "params": {"cortes": cortes, "dmin": dmin, "dmax": dmax,
                                "whisper": whisper, "llm": llm, "idioma": idioma}}
    gravar(jid)
    FILA.put(jid)
    log.info("job %s criado", jid)
    return {"id": jid}


@app.get("/jobs/{jid}")
def ver_job(jid: str):
    if not ID_RE.fullmatch(jid) or jid not in JOBS:
        raise HTTPException(404, "Nao encontrado.")
    return visao_publica(JOBS[jid])


@app.delete("/jobs/{jid}")
def apagar_job(jid: str):
    if not ID_RE.fullmatch(jid) or jid not in JOBS:
        raise HTTPException(404, "Nao encontrado.")
    if JOBS[jid]["estado"] in ("fila", "processando"):
        raise HTTPException(409, "O job ainda esta em andamento.")
    shutil.rmtree(DADOS / jid, ignore_errors=True)
    JOBS.pop(jid, None)
    return {"ok": True}


@app.get("/baixar/{jid}/{nome}")
def baixar(jid: str, nome: str, exp: int, sig: str):
    if not (ID_RE.fullmatch(jid) and NOME_RE.fullmatch(nome)):
        raise HTTPException(404, "Nao encontrado.")
    if exp < time.time() or not hmac.compare_digest(sig, assinar(jid, nome, exp)):
        raise HTTPException(403, "Link expirado ou invalido.")
    caminho = DADOS / jid / nome
    if not caminho.is_file():
        raise HTTPException(404, "Nao encontrado.")
    return FileResponse(caminho, media_type="video/mp4", filename=nome,
                        headers={"Cache-Control": "private, no-store"})
