"use strict";
// ===== Utilitários e estado =====
const BASE="https://gabriel-pc.tailbd72a3.ts.net";
const $=s=>document.querySelector(s);
const PREV=$("#pv"),PI=$("#pi"),TELA=$("#tela");
const M={},P=[];            // M: mídias importadas; P: itens da linha do tempo (a ordem define quem fica por cima)
let proj="",fila=Promise.resolve(),W=1080,H=1920,PPS=60,t=0,tocando=false,ult=0,sel=null,uid=0;
const total=()=>P.reduce((m,c)=>Math.max(m,c.ini+c.dur),0);
const fmt=x=>Math.floor(x/60)+":"+(x%60).toFixed(1).padStart(4,"0");
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
const aviso=m=>{$("#msg").textContent=m||""};

// ===== Importar mídias =====
function tipoDe(f){return f.type.startsWith("image")?"imagem":f.type.startsWith("audio")?"audio":"video"}
$("#arq").addEventListener("change",e=>{for(const f of e.target.files)importar(f);e.target.value=""});
function importar(f){
  const id="m"+(++uid),m=M[id]={id,nome:f.name,tipo:tipoDe(f),url:URL.createObjectURL(f),dur:5,servidor:null};
  const lin=el("div"),nm=el("span",null,f.name),bt=el("button",null,"+");bt.title="Adicionar à linha do tempo";
  bt.onclick=()=>adicionar(id);lin.append(nm,bt);$("#lista").append(lin);
  if(m.tipo!=="imagem"){const x=document.createElement(m.tipo==="audio"?"audio":"video");x.preload="metadata";x.src=m.url;
    x.onloadedmetadata=()=>{m.dur=x.duration||5};}
  m.up=fila=fila.then(async()=>{try{const fd=new FormData();fd.append("arquivo",f);fd.append("projeto",proj);
    const r=await fetch(BASE+"/editor/midia",{method:"POST",body:fd}),j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.detail||"Erro "+r.status);proj=j.projeto;m.servidor=j.midia}
    catch(er){aviso("Falha ao enviar "+f.name+": "+(er.message||"servidor indisponível"))}})}
function adicionar(id){const m=M[id],faixa=m.tipo==="audio"?"a":"v";
  const fim=P.filter(c=>c.faixa===faixa).reduce((x,c)=>Math.max(x,c.ini+c.dur),0);
  P.push({id:"c"+(++uid),faixa,m:id,ini:fim,dur:m.tipo==="imagem"?5:Math.max(.5,m.dur),corte:0,vol:1});sel=P[P.length-1];tudo()}

// ===== Linha do tempo =====
const FX=$("#fx"),ROL=$("#rol");
function desenhar(){
  FX.replaceChildren();FX.style.width=Math.max(total()+10,30)*PPS+"px";
  const reg=el("div","reg");for(let s=0;s<Math.max(total()+10,30);s+=s%5===0&&PPS<40?5:1){if(PPS<40&&s%5)continue;const i=el("i",null,s%5===0||PPS>=60?fmt(s).replace(".0",""):"");i.style.left=s*PPS+"px";reg.append(i)}
  reg.onpointerdown=e=>{t=Math.max(0,(e.clientX-FX.getBoundingClientRect().left)/PPS);parar();mostrar()};FX.append(reg);
  const faixas={};for(const k of["v","t","a"]){faixas[k]=el("div","fa");FX.append(faixas[k])}
  for(const c of P){const d=el("div","cl "+c.faixa+(c===sel?" on":""),c.faixa==="t"?c.texto:M[c.m].nome);
    d.style.left=c.ini*PPS+"px";d.style.width=Math.max(10,c.dur*PPS)+"px";
    const h=el("b");d.append(h);faixas[c.faixa].append(d);
    d.onpointerdown=e=>{e.preventDefault();sel=c;arrastar(e,c,e.target===h?"dur":"ini")}}
  const ph=el("div");ph.id="ph";FX.append(ph);ponto()}
function arrastar(e,c,modo){
  const x0=e.clientX,v0=c[modo],m=c.m&&M[c.m];
  const mv=ev=>{let v=v0+(ev.clientX-x0)/PPS;
    if(modo==="ini")v=Math.max(0,v);else{v=Math.max(.2,v);if(m&&m.tipo!=="imagem")v=Math.min(v,Math.max(.2,m.dur-c.corte))}
    c[modo]=v;desenhar();props();mostrar()};
  const up=()=>{removeEventListener("pointermove",mv);removeEventListener("pointerup",up);tudo()};
  addEventListener("pointermove",mv);addEventListener("pointerup",up);tudo()}
function ponto(){const p=$("#ph");if(p)p.style.left=t*PPS+"px";$("#tempo").textContent=fmt(t)+" / "+fmt(total())}

// ===== Prévia =====
function mostrar(){
  let c=null;for(let i=P.length-1;i>=0;i--){const x=P[i];if(x.faixa==="v"&&t>=x.ini&&t<x.ini+x.dur){c=x;break}}
  PREV.style.display=PI.style.display="none";
  if(c){const m=M[c.m];
    if(m.tipo==="imagem"){PI.src=m.url;PI.style.display="block"}
    else{PREV.style.display="block";if(PREV.dataset.m!==c.m){PREV.src=m.url;PREV.dataset.m=c.m}
      const alvo=c.corte+(t-c.ini);if(!tocando||Math.abs(PREV.currentTime-alvo)>.3)PREV.currentTime=alvo;
      PREV.volume=Math.min(1,c.vol);if(tocando&&PREV.paused)PREV.play().catch(()=>{});if(!tocando)PREV.pause()}}
  else PREV.pause();
  const tx=$("#txt");tx.replaceChildren();const k=TELA.clientHeight/H;
  for(const x of P)if(x.faixa==="t"&&t>=x.ini&&t<x.ini+x.dur){const d=el("div",null,x.texto);
    d.style.top=x.y+"%";d.style.fontSize=x.tam*k+"px";d.style.color=x.cor;tx.append(d)}
  ponto()}
function tocar(){if(tocando)return parar();if(t>=total())t=0;tocando=true;ult=performance.now();$("#pl").textContent="⏸";requestAnimationFrame(passo)}
function parar(){tocando=false;$("#pl").textContent="▶";PREV.pause()}
function passo(ts){if(!tocando)return;t+=(ts-ult)/1000;ult=ts;if(t>=total()){t=total();parar()}mostrar();if(tocando)requestAnimationFrame(passo)}
$("#pl").onclick=tocar;
addEventListener("keydown",e=>{if(e.code==="Space"&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();tocar()}});

// ===== Edição =====
$("#dv").onclick=()=>{const c=sel;if(!c||t<=c.ini+.1||t>=c.ini+c.dur-.1)return aviso("Coloque o cursor dentro do clipe selecionado para dividir.");aviso();
  const n={...c,id:"c"+(++uid),ini:t,dur:c.ini+c.dur-t,corte:c.corte+(t-c.ini)};c.dur=t-c.ini;P.splice(P.indexOf(c)+1,0,n);sel=n;tudo()};
$("#ex").onclick=()=>{if(sel){P.splice(P.indexOf(sel),1);sel=null;tudo()}};
$("#tx").onclick=()=>{const s=prompt("Texto do título:");if(s)P.push(sel={id:"c"+(++uid),faixa:"t",texto:s,ini:t,dur:3,y:80,tam:70,cor:"#ffffff"}),tudo()};
$("#zm").oninput=e=>{PPS=+e.target.value;desenhar()};
$("#fmt").onchange=e=>{[W,H]=e.target.value.split("x").map(Number);TELA.style.aspectRatio=W+"/"+H;mostrar()};
function props(){const p=$("#prop");p.replaceChildren();if(!sel){p.textContent="Selecione um clipe na linha do tempo.";return}
  const campo=(rot,tipo,v,fn,extra={})=>{const l=el("label","s m",rot+" "),i=el("input");i.type=tipo;Object.assign(i,extra);i.value=v;
    i.oninput=()=>{fn(i.value);desenhar();mostrar()};l.append(i);p.append(l)};
  if(sel.faixa==="t"){campo("Texto","text",sel.texto,v=>sel.texto=v);campo("Tamanho","number",sel.tam,v=>sel.tam=+v||70,{min:20,max:300});
    campo("Posição","range",sel.y,v=>sel.y=+v,{min:0,max:100});campo("Cor","color",sel.cor,v=>sel.cor=v)}
  else campo("Volume","range",sel.vol*100,v=>sel.vol=v/100,{min:0,max:200})}
function tudo(){desenhar();props();mostrar()}

// ===== Exportar =====
$("#exp").onclick=async()=>{aviso();const b=$("#exp");
  if(!P.some(c=>c.faixa==="v"))return aviso("Adicione um vídeo ou imagem na linha do tempo.");
  b.disabled=true;b.textContent="Enviando…";
  try{await fila;const mids=P.filter(c=>c.faixa!=="t").map(c=>M[c.m]);
    if(mids.some(m=>!m.servidor))throw new Error("Algum arquivo não foi enviado ao servidor. Importe de novo.");
    const corpo={projeto:proj,largura:W,altura:H,
      clips:P.filter(c=>c.faixa!=="t").map(c=>({tipo:M[c.m].tipo,midia:M[c.m].servidor,ini:c.ini,dur:c.dur,corte:c.corte,vol:c.vol})),
      textos:P.filter(c=>c.faixa==="t").map(c=>({texto:c.texto,ini:c.ini,dur:c.dur,y:c.y,tam:c.tam,cor:c.cor}))};
    const r=await fetch(BASE+"/editor/exportar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(corpo)});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.detail||"Erro "+r.status);
    try{const L=JSON.parse(localStorage.getItem("jobs")||"[]");L.unshift({id:j.id,titulo:"Vídeo editado",quando:Date.now(),tipo:"download"});localStorage.setItem("jobs",JSON.stringify(L.slice(0,30)))}catch{}
    location.href="index.html#/video/"+j.id}
  catch(er){aviso(er.message||"Não consegui falar com o servidor.");b.disabled=false;b.textContent="Exportar"}};
tudo();
