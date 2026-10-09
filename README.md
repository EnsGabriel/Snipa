# Snipa · cortes automáticos

Gera cortes verticais (9:16) com legenda a partir de um link ou arquivo de vídeo.
O processamento roda no seu PC (GPU NVIDIA). O site fica no Render e só mostra a interface.

## Arquitetura

```
Navegador (site no Render, index.html)
        │  HTTPS
        ▼
Tailscale Funnel  https://gabriel-pc.tailbd72a3.ts.net
        │  proxy
        ▼
Servidor no seu PC (uvicorn, 127.0.0.1:8000, servidor.py)
        │
        ├─ yt-dlp (baixa do link)
        ├─ FFmpeg (áudio, corte, 9:16)
        ├─ faster-whisper (transcrição, GPU)
        └─ Ollama llama3.1 (escolhe os trechos)
```

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Interface completa (um arquivo). Vai para o Render. |
| `servidor.py` | API FastAPI: recebe o vídeo, fila, limites, download por link assinado. |
| `video_cortes.py` | Pipeline: download, transcrição, escolha dos cortes, legenda e render. |
| `iniciar.bat` | Sobe o servidor local. |
| `instalar.ps1` | Instalação única: venv, dependências e arquivo `.env`. |
| `requirements.txt` | Dependências Python. |
| `.gitignore` | Impede subir `.env`, `dados/`, `saida/` e `.venv/` ao GitHub. |

## O que já está feito

- Site sem tela de configuração: o endereço do servidor está fixo em `index.html`.
- Sem chave de acesso no fluxo do usuário.
- Aba Live e Configurações removidas (a rota `/lives` não existia no servidor).
- Limites: jobs por hora por IP (padrão 5), teto diário total (padrão 40), fila de um vídeo por vez.
- Links de download expiram em 1 hora e são assinados com uma chave que muda a cada reinício.
- Vídeos originais são apagados após o processamento; clipes são apagados após 24 horas.
- Links só http/https e sem endereços internos (proteção contra SSRF).

## Limitações conhecidas

- **Sem login.** Quem descobrir o endereço do Funnel pode criar jobs e usar sua GPU, dentro dos limites. Esse é o ponto mais importante a resolver antes de divulgar o site.
- O site (HTML e JS) é público: qualquer pessoa consegue ler o código que roda no navegador. Não coloque segredos em `index.html`.
- O limite por IP depende do cabeçalho `X-Forwarded-For` enviado pelo Funnel. Se ele não chegar, todos os usuários contam como um só.
- Cor, tamanho de letra, posição da legenda e layout (`cor`, `tamanho`, `posicao`, `layout`, `camera`) são enviados pelo site, mas o servidor ainda não os usa.

## Como rodar no seu PC

1. Instale Python 3.10+, FFmpeg (no PATH), Ollama (com `ollama pull llama3.1`) e o driver NVIDIA.
2. Instale o Tailscale, faça login e ative o Funnel na porta 8000:
   ```powershell
   tailscale funnel --bg 8000
   ```
   O endereço deve ser `https://gabriel-pc.tailbd72a3.ts.net`. Se for outro, troque a constante `BASE` em `index.html`.
3. Na pasta do projeto, rode uma vez:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
   ```
4. Para subir sozinho com o Windows (uma vez):
   ```powershell
   schtasks /create /tn "CortesServidor" /tr "C:\cortes\iniciar.bat" /sc onlogon /rl highest
   ```
5. Teste: `curl.exe -i https://gabriel-pc.tailbd72a3.ts.net/saude` deve responder `{"ok":true}`.

## Como publicar o site no Render

1. Crie um repositório **privado** no GitHub e envie os arquivos desta pasta.
2. No Render: **New → Static Site**, conecte o repositório.
3. Configure: Build Command vazio, Publish Directory `.`.
4. Copie o endereço gerado (ex.: `https://snipa.onrender.com`) e coloque em `CORTES_ORIGENS` no `.env` do PC. Reinicie o servidor.

## Próximos passos

- [ ] Login com Supabase (e-mail ou Google) e verificação do token no servidor.
- [ ] Tabela de usuários com `papel` (admin/comum) e `creditos`.
- [ ] Admin isento de marca d'água e de créditos.
- [ ] Teste grátis com marca d'água (1 vídeo por usuário ou IP).
- [ ] Créditos por corte, debitados antes do processamento e devolvidos se falhar.
- [ ] Pagamento (Mercado Pago ou Stripe) com webhook validado, liberando créditos.
- [ ] Usar as opções de cor, tamanho, posição e layout no render.
- [ ] Reimplementar a aba Live, se ainda fizer sentido.
- [ ] Medir o tempo de um corte de 30 minutos antes de vender, já que a RTX 2060 vai limitar a fila.
