// ===== Utilitários =====
"use strict";
const $=s=>document.querySelector(s);
function h(tag,a={},...kids){const e=document.createElement(tag);
  for(const[k,v]of Object.entries(a)){if(k==="on")for(const[ev,fn]of Object.entries(v))e.addEventListener(ev,fn);else if(k in e&&k!=="list")e[k]=v;else e.setAttribute(k,v)}
  for(const c of kids.flat())if(c!=null)e.append(c.nodeType?c:document.createTextNode(c));return e}
const store={
  get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
// ===== Servidor (API) =====
const BASE="https://gabriel-pc.tailbd72a3.ts.net";
const cfg=()=>({whisper:"large-v3-turbo",llm:"llama3.1",idioma:"pt"});
const base=()=>BASE;
async function api(path,opt={}){
  let r;try{r=await fetch(BASE+path,opt)}
  catch{throw new Error("Não consegui falar com o servidor. Tente novamente em alguns minutos.")}
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.detail||"Erro "+r.status);return j}

// ===== Rotas e navegação =====
let timer=null;
const rotas={live:vLive,novo:vNovo,baixar:vBaixar,video:vVideo,projetos:vProjetos,job:vJob};
function ir(){clearInterval(timer);const[,r,id]=location.hash.split("/");const n=rotas[r]?r:"novo";
  $("#nav").replaceChildren(...[["novo","✂","Novo"],["baixar","⬇","Baixar"],["projetos","▤","Projetos"],["live","●","Live"]]
    .map(([k,ic,t])=>h("a",{href:"#/"+k,className:k===n?"on":""},h("b",{},ic),t)),
    h("a",{href:"editor.html"},h("b",{},"🎞"),"Editor"));
  $("#app").replaceChildren();rotas[n](id)}
addEventListener("hashchange",ir);

function sel(opts,val,id){const s=h("select",{id});opts.forEach(([v,t])=>s.append(h("option",{value:v,textContent:t,selected:String(v)===String(val)})));return s}

// ===== Modelos de vídeo (layouts, câmera e foto) =====
const IC={
 preencher:'<rect width="36" height="64" fill="#6c4cff"/><path d="M14 26l10 6-10 6z" fill="#fff"/>',
 inteiro:'<rect width="36" height="64" fill="#6c4cff" opacity=".3"/><rect y="22" width="36" height="20" fill="#6c4cff"/><path d="M15 27l8 5-8 5z" fill="#fff"/>',
 metade:'<rect width="36" height="31" fill="#6c4cff"/><rect y="33" width="36" height="31" fill="#9d8cff"/><circle cx="18" cy="11" r="4" fill="#fff"/><path d="M9 31c0-6 4-9 9-9s9 3 9 9z" fill="#fff"/><circle cx="18" cy="43" r="4" fill="#fff"/><path d="M9 63c0-6 4-9 9-9s9 3 9 9z" fill="#fff"/>',
 dividido:'<rect width="36" height="38" fill="#6c4cff"/><path d="M14 13l9 6-9 6z" fill="#fff"/><rect y="40" width="36" height="24" fill="#f5b942"/><circle cx="18" cy="49" r="4.5" fill="#14161f"/><path d="M9 64c0-6 4-9 9-9s9 3 9 9z" fill="#14161f"/>'};
function mkLay(ini={}){
  const defs=[["preencher","Preencher"],["inteiro","Inteiro"],["metade","Metade e metade"],["dividido","Jogo + câmera"]];
  let cur=ini.layout||"preencher";
  const box=h("div",{className:"lays"});
  Object.defineProperty(box,"value",{get:()=>cur});
  const ico=(k,i)=>'<svg viewBox="0 0 36 64"><clipPath id="lc'+i+'"><rect width="36" height="64" rx="6"/></clipPath><g clip-path="url(#lc'+i+')">'+IC[k]+'</g></svg>';
  const btns=defs.map(([k,t],i)=>{
    const b=h("button",{className:"lay"+(k===cur?" on":""),type:"button",on:{click:()=>{cur=k;
      btns.forEach((x,j)=>{x.className="lay"+(defs[j][0]===cur?" on":"")});camBox.style.display=cur==="dividido"?"flex":"none";fotoBox.style.display=cur==="preencher"?"none":"flex"}}});
    b.innerHTML=ico(k,i);b.append(t);return b});
  btns.forEach(x=>box.append(x));
  const cs=sel([["baixo-direita","Câmera: canto inferior direito"],["baixo-esquerda","Câmera: canto inferior esquerdo"],["cima-direita","Câmera: canto superior direito"],["cima-esquerda","Câmera: canto superior esquerdo"]],ini.camera||"baixo-direita","cam");
  const inset=h("div",{className:"inset"});
  const desenhar=()=>{const[v,hz]=cs.value.split("-");const x=hz==="direita"?44:2,y=v==="baixo"?22:2;
    inset.innerHTML='<svg viewBox="0 0 64 36" width="64" height="36"><rect x=".5" y=".5" width="63" height="35" rx="4" fill="none" stroke="#9a9aa3"/><rect x="'+x+'" y="'+y+'" width="18" height="12" rx="2" fill="#f5b942"/></svg>'};
  cs.addEventListener("change",desenhar);desenhar();
  const camBox=h("div",{className:"chips",style:"display:"+(cur==="dividido"?"flex":"none")+";align-items:center;margin-top:0"},inset,cs);
  Object.defineProperty(camBox,"value",{get:()=>cs.value});
  const fin=h("input",{type:"file",accept:"image/*",on:{change:()=>{const f=fin.files[0];prev.style.display=f?"block":"none";if(f)prev.src=URL.createObjectURL(f)}}});
  const prev=h("img",{style:"display:none"});
  const fotoBox=h("div",{className:"foto"},"Foto opcional para este modelo (aparece embaixo):",fin,prev);
  fotoBox.style.display=cur==="preencher"?"none":"flex";
  const painel=h("details",{className:"mod"},h("summary",{},"🎬 Modelos de vídeo"),box,camBox,fotoBox);
  return{lay:box,cam:camBox,foto:fin,painel}}

// ===== Página: Novo corte =====
function vNovo(){
  const c=cfg();let arq=null;
  const url=h("input",{placeholder:"Cole o link do vídeo (YouTube e outros)",id:"url"});
  const fi=h("input",{type:"file",accept:".mp4,.mov,.mkv,.webm,.avi,.m4v",hidden:true,on:{change:e=>pick(e.target.files[0])}});
  const msg=h("p",{className:"err",style:"text-align:center"});
  const pill=h("div",{className:"pill"});
  function pick(f){if(!f)return;arq=f;url.value="";url.placeholder="Arquivo: "+f.name}
  ["dragover","dragleave","drop"].forEach(ev=>pill.addEventListener(ev,e=>{e.preventDefault();pill.style.outline=ev==="dragover"?"2px dashed var(--p)":"";if(ev==="drop")pick(e.dataTransfer.files[0])}));
  const q=sel([3,5,8,10].map(n=>[n,n+" cortes"]),5,"q");
  const d=sel([["20-40","20 a 40 s"],["30-60","30 a 60 s"],["60-90","60 a 90 s"]],"30-60","d");
  const i=sel([["pt","Português"],["en","Inglês"],["es","Espanhol"],["auto","Detectar idioma"]],c.idioma,"i");
  const cr=sel([["amarelo","Destaque amarelo"],["laranja","Destaque laranja"],["verde","Destaque verde"],["azul","Destaque azul"]],"amarelo","cr");
  const tm=sel([["pequeno","Letra pequena"],["medio","Letra média"],["grande","Letra grande"]],"medio","tm");
  const ps=sel([["baixo","Legenda embaixo"],["centro","Legenda no centro"],["alto","Legenda no alto"]],"baixo","ps");
  const ly=mkLay();
  const go=h("button",{className:"cta",textContent:"Obter cortes em 1 clique",on:{click:async()=>{
    msg.textContent="";
    if(!arq&&!url.value.trim()){msg.textContent="Cole um link ou envie um arquivo.";return}
    const[mn,mx]=d.value.split("-"),fd=new FormData();
    if(arq)fd.append("arquivo",arq);else fd.append("url",url.value.trim());
    fd.append("cortes",q.value);fd.append("dmin",mn);fd.append("dmax",mx);
    fd.append("whisper",c.whisper);fd.append("llm",c.llm);fd.append("idioma",i.value);fd.append("cor",cr.value);fd.append("tamanho",tm.value);fd.append("posicao",ps.value);fd.append("layout",ly.lay.value);fd.append("camera",ly.cam.value);if(ly.foto.files[0])fd.append("imagem",ly.foto.files[0]);
    go.disabled=true;
    try{const r=await api("/jobs",{method:"POST",body:fd});
      const L=store.get("jobs",[]);let t;try{t=arq?arq.name:new URL(url.value).hostname}catch{t="vídeo"}
      L.unshift({id:r.id,titulo:t,quando:Date.now(),cortes:+q.value});store.set("jobs",L.slice(0,30));
      location.hash="#/job/"+r.id}catch(e){msg.textContent=e.message;go.disabled=false}}}});
  pill.append(url,go);
  const L=store.get("jobs",[]);
  $("#app").append(
    h("div",{className:"hero"},h("div",{className:"tag"},"// SNIPA · CORTES · LEGENDAS · 9:16"),
      h("h1",{},"Cole um link.",h("br"),"Receba os cortes ",h("b",{style:"color:var(--p)"},"prontos."))),
    pill,msg,
    h("div",{className:"chips"},h("button",{textContent:"⬆ Enviar arquivo",on:{click:()=>fi.click()}}),fi,q,d,i),
    h("div",{className:"chips"},cr,tm,ps),
    ly.painel,
    h("p",{className:"s m",style:"text-align:center"},"Para vídeos grandes, prefira colar o link."),
    L.length?h("h3",{style:"margin-top:40px"},"Seus projetos recentes"):"",
    h("div",{className:"cards"},L.slice(0,6).map(p=>h("a",{className:"card",href:(p.tipo==="download"?"#/video/":"#/job/")+p.id},
      h("b",{},p.titulo),h("span",{className:"s"},(p.tipo==="download"?"vídeo completo":p.cortes+" cortes")+" · "+new Date(p.quando).toLocaleDateString("pt-BR"))))))}

// ===== Cartão de corte =====
function cardClip(c){const u=base()+c.url;
  return h("div",{className:"clip"},h("video",{src:u,controls:true,preload:"metadata"}),
    h("h4",{},"Bloco "+c.bloco+" · "+c.titulo),h("div",{className:"s m"},Math.round(c.fim-c.inicio)+" s · potencial "+c.score+"/10"),
    c.legenda?h("p",{className:"s",style:"white-space:pre-wrap;background:var(--c);border:1px solid var(--b);border-radius:10px;padding:8px;margin:8px 0"},c.legenda):null,
    c.legenda?h("button",{textContent:"Copiar legenda",style:"width:100%;margin-bottom:6px",on:{click:async e=>{try{await navigator.clipboard.writeText(c.legenda);e.target.textContent="Copiado ✓"}catch{e.target.textContent="Selecione e copie o texto acima"}}}}):null,
    h("a",{className:"btn pr",href:u,textContent:"Baixar",style:"width:100%;margin-top:2px"}))}

// ===== Página: Live =====
function vLive(){
  const c=cfg(),lidr={id:null};
  const msg=h("p",{className:"err",style:"text-align:center"}),st=h("p",{className:"m",style:"text-align:center"}),grade=h("div",{className:"grid"});
  const url=h("input",{placeholder:"Link do canal ao vivo (ex.: https://kick.com/canal)"});
  const bl=sel([[5,"Blocos de 5 min"],[10,"Blocos de 10 min"],[15,"Blocos de 15 min"]],10,"bl");
  const nc=sel([1,2,3].map(n=>[n,n+" corte(s) por bloco"]),2,"nc");
  const cr=sel([["amarelo","Destaque amarelo"],["laranja","Destaque laranja"],["verde","Destaque verde"],["azul","Destaque azul"]],"amarelo","cr");
  const tm=sel([["pequeno","Letra pequena"],["medio","Letra média"],["grande","Letra grande"]],"medio","tm");
  const ps=sel([["baixo","Legenda embaixo"],["centro","Legenda no centro"],["alto","Legenda no alto"]],"baixo","ps");
  const ly=mkLay();
  const parar=h("button",{textContent:"Parar monitoramento",style:"display:none",on:{click:async()=>{try{await api("/lives/"+lidr.id,{method:"DELETE"})}catch(e){msg.textContent=e.message}}}});
  async function tick(){let j;try{j=await api("/lives/"+lidr.id)}catch(e){msg.textContent=e.message;return}
    msg.textContent="";
    st.textContent=({gravando:"● Gravando a live",offline:"Canal offline, tentando de novo…",encerrada:"Monitoramento encerrado"}[j.estado]||j.estado)+" · "+j.blocos+" bloco(s) gravado(s), "+j.prontos+" processado(s)";
    grade.replaceChildren(...j.clips.map(cardClip));
    if(j.estado==="encerrada"&&j.prontos>=j.blocos){clearInterval(timer);go.disabled=false;parar.style.display="none"}}
  const go=h("button",{className:"cta",textContent:"Monitorar live",on:{click:async()=>{
    msg.textContent="";const fd=new FormData();
    fd.append("url",url.value.trim());fd.append("bloco",bl.value);fd.append("cortes",nc.value);fd.append("dmin",20);fd.append("dmax",60);
    fd.append("whisper",c.whisper);fd.append("llm",c.llm);fd.append("idioma",c.idioma);fd.append("cor",cr.value);fd.append("tamanho",tm.value);fd.append("posicao",ps.value);fd.append("layout",ly.lay.value);fd.append("camera",ly.cam.value);if(ly.foto.files[0])fd.append("imagem",ly.foto.files[0]);
    try{const r=await api("/lives",{method:"POST",body:fd});lidr.id=r.id;go.disabled=true;parar.style.display="";tick();timer=setInterval(tick,5000)}
    catch(e){msg.textContent=e.message}}}});
  $("#app").append(h("div",{className:"hero"},h("div",{className:"tag"},"// MONITOR DE LIVE"),
      h("h1",{},"Cortes ",h("b",{style:"color:var(--p)"},"enquanto a live rola."))),
    h("div",{className:"pill"},url,go),msg,
    h("div",{className:"chips"},bl,nc,cr,tm,ps),
    ly.painel,
    h("p",{className:"s m",style:"text-align:center"},"A live é gravada em blocos; cada bloco vira cortes em poucos minutos. Use só em lives suas ou com autorização."),
    h("div",{style:"text-align:center;margin:12px 0"},parar),st,grade)}

// ===== Página: Projeto (progresso e cortes) =====
const COR=[["amarelo","Destaque amarelo"],["laranja","Destaque laranja"],["verde","Destaque verde"],["azul","Destaque azul"]];
const TM=[["pequeno","Letra pequena"],["medio","Letra média"],["grande","Letra grande"]];
const PS=[["baixo","Legenda embaixo"],["centro","Legenda no centro"],["alto","Legenda no alto"]];

// corte pronto, com painel "Editar" (início/fim, modelo, foto e legenda) que refaz o vídeo no servidor
function cardJob(id,c,n){
  const video=h("video",{controls:true,preload:"metadata"}),info=h("div",{className:"s m"});
  const dl=h("a",{className:"btn pr",textContent:"Baixar",style:"width:100%;margin-top:2px"});
  const msg=h("p",{className:"err s"}),painel=h("div",{className:"box",style:"display:none"});
  function mostrar(x){c=x;const u=base()+x.url;video.src=u;dl.href=u;
    info.textContent=Math.round(x.fim-x.inicio)+" s · potencial "+x.score+"/10"}
  mostrar(c);
  async function esperar(){
    for(;;){await new Promise(r=>setTimeout(r,3000));
      if(!document.body.contains(video))return;
      const j=await api("/jobs/"+id),x=j.clips[n];
      if(!x.refazendo){if(x.erro_edicao)throw new Error(x.erro_edicao);
        mostrar(x);painel.replaceChildren();painel.style.display="none";return}}}
  function montar(){
    const e=c.estilo||{},k="e"+n;
    const ini=h("input",{type:"number",step:"0.1",min:"0",value:c.inicio}),fim=h("input",{type:"number",step:"0.1",min:"0",value:c.fim});
    const cor=sel(COR,e.cor||"amarelo",k+"c"),tam=sel(TM,e.tamanho||"medio",k+"t"),pos=sel(PS,e.posicao||"baixo",k+"p");
    const ly=mkLay(e);ly.painel.open=true;let tirar=false;
    const rem=c.tem_foto?h("label",{className:"s m",style:"display:block;margin:6px 0"},
      h("input",{type:"checkbox",style:"width:auto;margin-right:6px",on:{change:ev=>{tirar=ev.target.checked}}}),"Remover a foto atual"):null;
    const go=h("button",{className:"pr",textContent:"Refazer corte",style:"width:100%",on:{click:async()=>{
      msg.textContent="";const fd=new FormData();
      fd.append("inicio",ini.value);fd.append("fim",fim.value);fd.append("layout",ly.lay.value);fd.append("camera",ly.cam.value);
      fd.append("cor",cor.value);fd.append("tamanho",tam.value);fd.append("posicao",pos.value);
      if(ly.foto.files[0])fd.append("imagem",ly.foto.files[0]);if(tirar)fd.append("remover_foto","1");
      go.disabled=true;go.textContent="Refazendo…";
      try{await api("/jobs/"+id+"/cortes/"+(n+1)+"/refazer",{method:"POST",body:fd});await esperar()}
      catch(er){msg.textContent=er.message}
      go.disabled=false;go.textContent="Refazer corte"}}});
    painel.append(h("div",{className:"f"},h("label",{},"Início (segundos)"),ini,h("label",{},"Fim (segundos)"),fim),
      h("div",{className:"chips"},cor,tam,pos),ly.painel,rem,go)}
  const btn=h("button",{textContent:"✎ Editar",style:"width:100%;margin-bottom:6px",on:{click:()=>{
    if(!painel.firstChild)montar();painel.style.display=painel.style.display==="none"?"block":"none"}}});
  return h("div",{className:"clip"},video,h("h4",{},"Corte "+(n+1)+" · "+c.titulo),info,
    c.legenda?h("p",{className:"s",style:"white-space:pre-wrap;background:var(--c);border:1px solid var(--b);border-radius:10px;padding:8px;margin:8px 0"},c.legenda):null,
    msg,btn,painel,dl)}

const ETAPAS=[["Baixar vídeo",8],["Extrair áudio",15],["Transcrever",55],["Escolher cortes",60],["Renderizar",101]];
function vJob(id){
  const topo=h("div",{}),passos=h("div",{className:"box"}),grade=h("div",{className:"grid"}),erro=h("p",{className:"err"});
  $("#app").append(h("h2",{},"Seu projeto"),topo,passos,erro,grade,
    h("p",{className:"s m"},"Baixe os clipes que quiser guardar: eles são apagados do servidor após 24 horas."));
  async function tick(){
    let j;try{j=await api("/jobs/"+id)}catch(e){erro.textContent=e.message;return}
    erro.textContent="";const p=j.progresso||0;
    topo.textContent=j.estado==="concluido"?"Pronto!":j.estado==="erro"?"":(j.etapa||"Na fila")+"…";
    const st=h("div",{className:"steps"});
    ETAPAS.forEach(([n,lim],k)=>{const ant=k?ETAPAS[k-1][1]:0;
      st.append(h("span",{className:j.estado==="concluido"||p>=lim?"ok":""},(j.estado==="concluido"||p>=lim?"✓ ":p>=ant?"● ":"○ ")+n))});
    passos.replaceChildren(st,h("div",{className:"bar"},h("div",{style:"width:"+(j.estado==="concluido"?100:p)+"%"})));
    if(j.estado==="erro"){erro.textContent=j.erro||"Falhou.";clearInterval(timer)}
    if(j.estado==="concluido"){clearInterval(timer);
      grade.replaceChildren(...j.clips.map((c,n)=>cardJob(id,c,n)))}}
  tick();timer=setInterval(tick,3000)}

// ===== Página: Baixar vídeo completo =====
function vBaixar(){
  const msg=h("p",{className:"err",style:"text-align:center"});
  const url=h("input",{placeholder:"Cole o link do vídeo (TikTok, Instagram, YouTube e outros)"});
  const go=h("button",{className:"cta",textContent:"Baixar vídeo",on:{click:async()=>{
    msg.textContent="";if(!url.value.trim()){msg.textContent="Cole um link.";return}
    const fd=new FormData();fd.append("url",url.value.trim());go.disabled=true;
    try{const r=await api("/downloads",{method:"POST",body:fd});
      const L=store.get("jobs",[]);let t;try{t=new URL(url.value).hostname}catch{t="vídeo"}
      L.unshift({id:r.id,titulo:t,quando:Date.now(),tipo:"download"});store.set("jobs",L.slice(0,30));
      location.hash="#/video/"+r.id}catch(e){msg.textContent=e.message;go.disabled=false}}}});
  $("#app").append(h("div",{className:"hero"},h("div",{className:"tag"},"// BAIXAR VÍDEO COMPLETO"),
      h("h1",{},"Cole um link.",h("br"),"Baixe o vídeo ",h("b",{style:"color:var(--p)"},"inteiro."))),
    h("div",{className:"pill"},url,go),msg,
    h("p",{className:"s m",style:"text-align:center"},"Use só com vídeos seus ou que você tem permissão para baixar e usar."))}

function vVideo(id){
  const topo=h("div",{className:"m"}),erro=h("p",{className:"err"}),area=h("div",{style:"max-width:640px"});
  $("#app").append(h("h2",{},"Seu vídeo"),topo,erro,area,h("p",{className:"s m"},"O arquivo é apagado do servidor após 24 horas."));
  async function tick(){let j;try{j=await api("/jobs/"+id)}catch(e){erro.textContent=e.message;return}
    erro.textContent="";
    if(j.estado==="erro"){topo.textContent="";erro.textContent=j.erro||"Falhou.";clearInterval(timer);return}
    if(j.estado!=="concluido"){topo.textContent=(j.etapa||"Na fila")+"…";return}
    clearInterval(timer);topo.textContent="Pronto!";const c=j.clips[0],u=base()+c.url;
    area.replaceChildren(h("div",{className:"clip dl"},h("video",{src:u,controls:true,preload:"metadata"}),
      h("div",{className:"s m"},Math.round(c.fim)+" s"),
      h("a",{className:"btn pr",href:u,textContent:"Baixar",style:"width:100%;margin-top:8px"})))}
  tick();timer=setInterval(tick,3000)}

// ===== Página: Meus projetos =====
function vProjetos(){
  const L=store.get("jobs",[]);const box=h("div");
  $("#app").append(h("h2",{},"Meus projetos"),h("p",{className:"s m"},"Neste navegador. Clipes são apagados do servidor após 24 horas."),box);
  if(!L.length)box.append(h("p",{className:"m"},"Nenhum projeto ainda."));
  L.forEach(p=>box.append(h("div",{className:"item"},
    h("div",{},h("b",{},p.titulo),h("div",{className:"s m"},(p.tipo==="download"?"vídeo completo":p.cortes+" cortes")+" · "+new Date(p.quando).toLocaleString("pt-BR"))),
    h("div",{},h("a",{className:"btn",href:(p.tipo==="download"?"#/video/":"#/job/")+p.id,textContent:"Abrir"})," ",
      h("button",{textContent:"Apagar",on:{click:async()=>{try{await api("/jobs/"+p.id,{method:"DELETE"})}catch{}
        store.set("jobs",store.get("jobs",[]).filter(x=>x.id!==p.id));ir()}}})))))}
// ===== Início =====

ir();
