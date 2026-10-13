"""Renderiza um projeto do editor (linha do tempo) com FFmpeg."""
import re
from pathlib import Path

import video_cortes as vc

MIDIA_RE = re.compile(r"m_[0-9a-f]{8}\.[a-z0-9]{2,4}")
EXT_VIDEO = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
EXT_IMG = {".png", ".jpg", ".jpeg", ".webp"}
EXT_AUDIO = {".mp3", ".wav", ".m4a", ".aac", ".ogg"}


def _n(v, lo, hi, pad=0.0):
    try:
        x = float(v)
    except (TypeError, ValueError):
        x = pad
    return max(lo, min(hi, x))


def limpar(d):
    """Valida o projeto vindo do site e devolve um dicionario seguro."""
    W = int(_n(d.get("largura"), 240, 3840, 1080)) // 2 * 2
    H = int(_n(d.get("altura"), 240, 3840, 1920)) // 2 * 2
    clips, textos = [], []
    for c in (d.get("clips") or [])[:60]:
        if not (MIDIA_RE.fullmatch(str(c.get("midia", ""))) and c.get("tipo") in ("video", "imagem", "audio")):
            vc.falhar("Midia invalida no projeto.")
        clips.append({"tipo": c["tipo"], "midia": c["midia"], "ini": _n(c.get("ini"), 0, 7200),
                      "dur": _n(c.get("dur"), 0.2, 7200, 1), "corte": _n(c.get("corte"), 0, 86400),
                      "vol": _n(c.get("vol"), 0, 2, 1)})
    for t in (d.get("textos") or [])[:40]:
        cor = str(t.get("cor", ""))
        textos.append({"texto": re.sub(r"[{}\\\r\n]", " ", str(t.get("texto", ""))[:200]),
                       "ini": _n(t.get("ini"), 0, 7200), "dur": _n(t.get("dur"), 0.2, 7200, 3),
                       "y": _n(t.get("y"), 0, 100, 80), "tam": _n(t.get("tam"), 20, 300, 70),
                       "cor": cor if re.fullmatch(r"#[0-9a-fA-F]{6}", cor) else "#ffffff"})
    if not any(c["tipo"] != "audio" for c in clips):
        vc.falhar("Adicione pelo menos um video ou imagem na linha do tempo.")
    total = max(c["ini"] + c["dur"] for c in clips + textos)
    if total > 1800:
        vc.falhar("Projeto muito longo (maximo 30 minutos).")
    return {"largura": W, "altura": H, "clips": clips, "textos": textos, "total": total}


def _tem_audio(f):
    r = vc.rodar(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                  "-of", "csv=p=0", str(f)], timeout=60)
    return r.returncode == 0 and bool(r.stdout.strip())


def _ass(p, caminho):
    W, H = p["largura"], p["altura"]
    linhas = ["[Script Info]", "ScriptType: v4.00+", f"PlayResX: {W}", f"PlayResY: {H}", "", "[V4+ Styles]",
              "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, "
              "Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
              "Alignment, MarginL, MarginR, MarginV, Encoding",
              f"Style: Default,{vc.FONTE},70,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,4,1,5,40,40,40,1",
              "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    for t in p["textos"]:
        c = t["cor"][1:]
        bgr = "&H00" + c[4:6] + c[2:4] + c[0:2] + "&"
        pos = "{\\an5\\pos(%d,%d)\\fs%d\\c%s}" % (W // 2, int(H * t["y"] / 100), int(t["tam"]), bgr)
        linhas.append(f"Dialogue: 0,{vc.tempo_ass(t['ini'])},{vc.tempo_ass(t['ini'] + t['dur'])},Default,,0,0,0,,{pos}{t['texto']}")
    caminho.write_text("\n".join(linhas) + "\n", encoding="utf-8-sig")


def renderizar(proj, saida_dir, p):
    W, H, total = p["largura"], p["altura"], p["total"]
    ent, filt, audios, n = [], [f"color=c=black:s={W}x{H}:r=30:d={total:.3f}[b0]"], [], 0
    for i, c in enumerate(p["clips"]):
        f = proj / c["midia"]
        if not f.is_file():
            vc.falhar("Uma midia do projeto nao foi encontrada. Importe de novo.")
        ini, dur, corte = c["ini"], c["dur"], (0 if c["tipo"] == "imagem" else c["corte"])
        ent += (["-loop", "1", "-t", f"{dur:.3f}", "-i", str(f)] if c["tipo"] == "imagem" else ["-i", str(f)])
        if c["tipo"] != "audio":
            filt.append(f"[{i}:v]trim=start={corte:.3f}:duration={dur:.3f},setpts=PTS-STARTPTS+{ini:.3f}/TB,"
                        f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black,"
                        f"setsar=1,fps=30[v{i}]")
            filt.append(f"[b{n}][v{i}]overlay=enable='between(t,{ini:.3f},{ini + dur:.3f})':eof_action=pass[b{n + 1}]")
            n += 1
        if c["tipo"] != "imagem" and (c["tipo"] == "audio" or _tem_audio(f)):
            ms = int(ini * 1000)
            filt.append(f"[{i}:a]atrim=start={corte:.3f}:duration={dur:.3f},asetpts=PTS-STARTPTS,"
                        f"adelay={ms}:all=1,volume={c['vol']:.2f}[a{i}]")
            audios.append(f"[a{i}]")
    if p["textos"]:
        _ass(p, saida_dir / "texto.ass")
        filt.append(f"[b{n}]ass=texto.ass[vout]")
    else:
        filt.append(f"[b{n}]null[vout]")
    mapa = ["-map", "[vout]"]
    if audios:
        filt.append("".join(audios) + (f"amix=inputs={len(audios)}:duration=longest:dropout_transition=0,"
                                       f"volume={len(audios)}[aout]" if len(audios) > 1 else "anull[aout]"))
        mapa += ["-map", "[aout]"]
    base = ["ffmpeg", "-y", *ent, "-filter_complex", ";".join(filt), *mapa, "-t", f"{total:.3f}", "-r", "30"]
    fim = ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "clip_01.mp4"]
    r = vc.rodar(base + ["-c:v", "h264_nvenc", "-preset", "p5", "-cq", "23", "-b:v", "0"] + fim, cwd=saida_dir, timeout=1800)
    if r.returncode != 0:
        r = vc.rodar(base + ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21"] + fim, cwd=saida_dir, timeout=3600)
    if r.returncode != 0:
        vc.falhar("Nao consegui renderizar o projeto.", r.stderr[-400:])
