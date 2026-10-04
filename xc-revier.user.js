// ==UserScript==
// @name         XC Revier: XContest-Flüge ins Spiel laden
// @namespace    https://deadfox-maker.github.io/xc-revier/
// @version      2.5
// @description  Zeigt auf XContest-Fluglisten, welche Flüge schon im XC Revier sind, holt die fehlenden IGC-Dateien und lädt sie nach Prüfung von Schirm und Klasse direkt ins Spiel.
// @author       XC Revier
// @match        *://www.xcontest.org/*
// @match        *://xcontest.org/*
// @match        *://*.xcontest.org/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      xcontest.org
// @connect      www.xcontest.org
// @connect      supabase.co
// @connect      deadfox-maker.github.io
// @run-at       document-idle
// @updateURL    https://deadfox-maker.github.io/xc-revier/xc-revier.user.js
// @downloadURL  https://deadfox-maker.github.io/xc-revier/xc-revier.user.js
// ==/UserScript==

(function(){
'use strict';
if(window.top!==window.self||window.name==='xcrevier') return; // nicht im Rahmen und nicht im eigenen Hilfsfenster laufen
const GAME='https://deadfox-maker.github.io/xc-revier/';
const BUILD='v2.5 · 04.10.2026 21:16';
const RX=/:[^\/]+\/\d{1,2}\.\d{1,2}\.\d{4}\/\d{1,2}:\d{2}/;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rnd=(a,b)=>a+Math.random()*(b-a);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const gm1=(url,opt={})=>new Promise((res,rej)=>{ GM_xmlhttpRequest({method:opt.method||'GET',url,headers:opt.headers||{},data:opt.body,timeout:opt.timeout||30000,
  onload:r=>res({ok:r.status>=200&&r.status<300,status:r.status,text:r.responseText,headers:r.responseHeaders||''}),onerror:()=>rej(new Error('Netzfehler')),ontimeout:()=>rej(new Error('Zeitüberschreitung'))}); });
const gm=async(url,opt={})=>{ try{ return await gm1(url,opt); }catch(e){ if(opt.method&&opt.method!=='GET'&&!/rpc\//.test(url)) throw e; await sleep(1500); return gm1(url,opt); } };

// ---------- Fluglinks auf dieser Seite ----------
const absUrl=a=>{ try{ return new URL(a.getAttribute('href'),location.href).href; }catch(e){ return ''; } };
let flights=[]; let busy=false; let scanSig='';
function scanFlights(){
  const isFlightUrl=h=>{ try{ const u=new URL(h); return (u.hostname===location.hostname||/(^|\.)xcontest\.org$/.test(u.hostname))&&/\/[^\/:]*:[^\/]+\/\d{1,2}\.\d{1,2}\.\d{4}\/\d{1,2}:\d{2}$/.test(u.pathname); }catch(e){ return false; } };
  const linkEls=[...document.querySelectorAll('a[href]')].filter(a=>isFlightUrl(absUrl(a)));
  const out=[]; const seen=new Set();
  for(const a of linkEls){ const u=new URL(absUrl(a)); const href=u.origin+u.pathname; if(seen.has(href)) continue; seen.add(href);
    const m=href.match(/:([^\/]+)\/(\d{1,2})\.(\d{1,2})\.(\d{4})\/(\d{1,2}):(\d{2})/);
    out.push({url:href,a,row:a.closest('tr')||a.parentElement,xcPilot:decodeURIComponent(m[1]).replace(/[_+]/g,' '),date:`${m[4]}-${m[3].padStart(2,'0')}-${m[2].padStart(2,'0')}`,hhmm:m[5].padStart(2,'0')+m[6],status:'?',why:''}); }
  return out;
}

// ---------- Panel ----------
const st={code:GM_getValue('code',''),name:GM_getValue('name',''),tempo:GM_getValue('tempo','normal')};
const panel=document.createElement('div'); panel.id='xcr-panel';
panel.style.cssText='position:fixed;top:8px;right:8px;z-index:2147483000;width:420px;max-height:92vh;overflow:auto;background:#1E252C;color:#E7ECEF;border:1px solid #2F3941;border-radius:8px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
panel.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #2F3941"><strong style="font-size:15px">XC Revier</strong><span id="xcr-sum" style="color:#98A4AE">suche Flugliste …</span><span title="Skriptversion und Erstellzeit" style="color:#5F6B75;font-size:11px;white-space:nowrap">${BUILD}</span><button id="xcr-min" title="Einklappen" style="margin-left:auto;background:none;border:1px solid #2F3941;color:#E7ECEF;border-radius:4px;cursor:pointer;padding:2px 8px">–</button></div>
<div id="xcr-body" style="padding:10px 12px">
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
  <input id="xcr-name" placeholder="Dein Name" value="${esc(st.name)}" style="padding:6px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF">
  <input id="xcr-code" placeholder="Upload-Code" value="${esc(st.code)}" style="padding:6px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF">
  <select id="xcr-club" style="padding:6px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF;grid-column:1/-1" hidden></select>
  <select id="xcr-tempo" style="padding:6px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF"><option value="normal">Tempo normal (3 bis 5 s)</option><option value="langsam">Tempo langsam (6 bis 10 s)</option></select>
  <button id="xcr-check" style="padding:6px 10px;border:0;border-radius:4px;background:#5A9BE6;color:#0E1419;font-weight:700;cursor:pointer">Abgleich mit dem Spiel</button>
 </div>
 <div id="xcr-role" style="color:#98A4AE;margin-bottom:6px"></div>
 <div id="xcr-log" style="max-height:30vh;overflow:auto;border-top:1px solid #2F3941;padding-top:6px"></div>
 <div id="xcr-prep" hidden></div>
 <div id="xcr-actions" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"></div>
</div>`;
document.body.appendChild(panel);
const $=s=>panel.querySelector(s);
$('#xcr-tempo').value=st.tempo;
$('#xcr-min').onclick=()=>{ const b=$('#xcr-body'); b.hidden=!b.hidden; $('#xcr-min').textContent=b.hidden?'+':'–'; };
const log=(s,c)=>{ const d=document.createElement('div'); d.textContent=s; if(c) d.style.color=c; $('#xcr-log').appendChild(d); $('#xcr-log').scrollTop=1e9; return d; };
const setSum=t=>{ $('#xcr-sum').textContent=t; };
const COL={ok:'#3FC29A',todo:'#98A4AE',fail:'#F07A53',busy:'#5A9BE6'};
function mark(f){ let s=f.row&&f.row.querySelector('.xcr-st'); if(!s){ s=document.createElement('span'); s.className='xcr-st'; s.style.cssText='margin-left:6px;font-weight:700;font-size:12px;white-space:nowrap'; (f.a.parentElement||f.row).appendChild(s); }
  const map={ok:['✓ im Spiel',COL.ok],todo:['○ fehlt',COL.todo],fail:['✗ '+f.why,COL.fail],busy:['… lädt',COL.busy],ready:['● geprüft',COL.busy],'?':['',COL.todo]};
  const [t,c]=map[f.status]||['',COL.todo]; s.textContent=t; s.style.color=c; s.title=f.why||''; }

// ---------- Spiel-Konfiguration ----------
let cfg=null, gliders=null, role=null, clubs=[];
const dbH=()=>({apikey:cfg.supabaseKey,'Content-Type':'application/json'});
async function loadCfg(){ if(cfg) return; const r=await gm(GAME+'config.json?'+Date.now()); if(!r.ok) throw new Error('config.json nicht erreichbar'); cfg=JSON.parse(r.text);
  try{ const g=await gm(GAME+'gliders.json?'+Date.now()); gliders=JSON.parse(g.text); }catch(e){ gliders={}; }
  try{ const c=await gm(cfg.supabaseUrl+'/rest/v1/clubs_public?select=id,name,region&order=created_at',{headers:dbH()}); clubs=JSON.parse(c.text); }catch(e){} }
const norm=x=>' '+String(x).toLowerCase().replace(/([a-z])(\d)/g,'$1 $2').replace(/(\d)([a-z])/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim()+' ';
function gliderClass(name){ if(!name||!gliders) return ''; const s=norm(name); let best='',bl=0;
  for(const mf in gliders){ if(mf.startsWith('_')) continue; const mfHit=s.includes(norm(mf).trim()+' ')||s.includes(' '+norm(mf).trim());
    for(const cls of ['A','B','C','D','CCC']) for(const m of (gliders[mf][cls]||[])){ const k=norm(m); if(s.includes(k)){ const sc=k.length+(mfHit?10:0); if(sc>bl){best=cls;bl=sc;} } } }
  return best; }
function gliderOptions(sel){ let h='<option value="">Schirm wählen…</option>'; const mfs=Object.keys(gliders||{}).filter(k=>!k.startsWith('_')).sort();
  for(const mf of mfs){ h+=`<optgroup label="${esc(mf)}">`; for(const c of ['A','B','C','D','CCC']) for(const m of (gliders[mf][c]||[]).slice().sort()){ const full=mf+' '+m; h+=`<option value="${esc(full)}" ${full===sel?'selected':''}>EN-${c} · ${esc(m)}</option>`; } h+='</optgroup>'; } return h; }

// ---------- IGC ----------
function parseIGC(text){ const lines=text.split(/\r?\n/); let date=null,pilot=null,glider=null,coords=[],firstTime=null;
  for(const ln of lines){ if(ln.startsWith('HFDTE')){ const m=ln.match(/(\d{2})(\d{2})(\d{2})/); if(m) date=`20${m[3]}-${m[2]}-${m[1]}`; }
    else if(/^HFGTY/.test(ln)){ const i=ln.indexOf(':'); if(i>0){ const v=ln.slice(i+1).trim(); if(v) glider=v; } }
    else if(/^HFPLT/.test(ln)){ const i=ln.indexOf(':'); if(i>0){ const v=ln.slice(i+1).trim(); if(v) pilot=v; } }
    else if(ln[0]==='B'&&ln.length>=35){ const lat=parseInt(ln.slice(7,9))+parseInt(ln.slice(9,14))/60000, latS=ln[14]; const lon=parseInt(ln.slice(15,18))+parseInt(ln.slice(18,23))/60000, lonS=ln[23];
      if(isNaN(lat)||isNaN(lon)||ln[24]==='V') continue; if(!firstTime) firstTime=ln.slice(1,7); coords.push([lonS==='W'?-lon:lon, latS==='S'?-lat:lat]); } }
  if(coords.length<10) throw new Error('zu wenige Trackpunkte');
  return {pilot:(pilot&&pilot.toUpperCase()!=='NKN')?pilot:null,date,time:firstTime||'000000',coords,glider}; }
const kmBetween=(a,b)=>{ const kx=111.32*Math.cos(a[1]*Math.PI/180), dx=(a[0]-b[0])*kx, dy=(a[1]-b[1])*110.57; return Math.sqrt(dx*dx+dy*dy); };
function validate(c){ let mx=0; for(let i=0;i<c.length;i++){ const [lo,la]=c[i]; if(Math.abs(lo)<0.01&&Math.abs(la)<0.01) return 'GPS-Punkt bei 0/0'; if(Math.abs(la)>90||Math.abs(lo)>180) return 'ungültige Koordinate'; if(i){ const d=kmBetween(c[i-1],c[i]); if(d>mx) mx=d; } } if(mx>30) return 'GPS-Sprung '+Math.round(mx)+' km'; return null; }
function dp(pts,tol){ if(pts.length<3) return pts; let dmax=0,idx=0; const [x1,y1]=pts[0],[x2,y2]=pts[pts.length-1]; const L=Math.hypot(y2-y1,x2-x1)||1e-12;
  for(let i=1;i<pts.length-1;i++){ const [x,y]=pts[i]; const d=Math.abs((y2-y1)*x-(x2-x1)*y+x2*y1-y2*x1)/L; if(d>dmax){dmax=d;idx=i;} }
  if(dmax>tol){ const a=dp(pts.slice(0,idx+1),tol), b=dp(pts.slice(idx),tol); return a.slice(0,-1).concat(b); } return [pts[0],pts[pts.length-1]]; }
const visibleText=h=>String(h).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<head[\s\S]*?<\/head>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const isVerify=h=>{ const t=visibleText(h).slice(0,4000); return /verify (that )?you are (a )?human|are you (a )?human|checking your browser|just a moment|not a robot|kein roboter|security check|sicherheitsüberprüfung|nejste robot/i.test(t); };
const isHtml=t=>/^\s*</.test(t)||/<html|<!doctype/i.test(t.slice(0,500));
const isLogin=t=>/type="password"/i.test(t)&&!/track\.php/.test(t);

// ---------- Abgleich ----------
let clubId=null, inDb=[];
async function check(){
  st.code=$('#xcr-code').value.trim(); st.name=$('#xcr-name').value.trim(); st.tempo=$('#xcr-tempo').value;
  GM_setValue('code',st.code); GM_setValue('name',st.name); GM_setValue('tempo',st.tempo);
  if(!st.code){ log('Bitte Upload-Code eingeben.','#F07A53'); return false; }
  $('#xcr-check').disabled=true;
  try{ await loadCfg(); const r=await gm(cfg.supabaseUrl+'/rest/v1/rpc/code_info',{method:'POST',headers:dbH(),body:JSON.stringify({code:st.code})}); role=r.ok?JSON.parse(r.text):null; }catch(e){ log('Datenbank nicht erreichbar: '+e.message,'#F07A53'); $('#xcr-check').disabled=false; return false; }
  if(!role){ $('#xcr-role').textContent='Code unbekannt.'; $('#xcr-check').disabled=false; return false; }
  const sel=$('#xcr-club');
  if(role.role==='super'){ sel.hidden=false; if(!sel.options.length){ sel.innerHTML=clubs.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.region?' · '+esc(c.region):''}</option>`).join(''); sel.value=GM_getValue('club',clubs[0]&&clubs[0].id); } clubId=sel.value; GM_setValue('club',clubId); sel.onchange=()=>{ clubId=sel.value; GM_setValue('club',clubId); }; }
  else { clubId=role.club; sel.hidden=true; }
  const cn=(clubs.find(c=>c.id===clubId)||{}).name||clubId;
  $('#xcr-role').textContent=(role.role==='super'?'Hauptadmin':role.role==='admin'?'Admin':'Upload')+' · Club: '+cn;
  flights.forEach(f=>{ f.status='?'; f.why=''; f.twin=null; }); // Abgleich immer frisch
  const dates=[...new Set(flights.map(f=>f.date))];
  inDb=[];
  for(const d of dates){ try{ const r=await gm(cfg.supabaseUrl+'/rest/v1/flights_public?select=pilot,date,time,xc_url,glider,en_class&club_id=eq.'+encodeURIComponent(clubId)+'&date=eq.'+d,{headers:dbH()}); if(r.ok) inDb=inDb.concat(JSON.parse(r.text)); }catch(e){} }
  const byUrl=new Set(inDb.map(x=>x.xc_url).filter(Boolean));
  const tok=s=>norm(s).trim().split(' ').filter(t=>t.length>2);
  const mins=t=>{ const d=String(t||'').replace(/\D/g,''); return +d.slice(0,2)*60+ +d.slice(2,4); };
  const noLink=inDb.filter(x=>!x.xc_url);
  log('Im Spiel an dem Tag: '+inDb.length+' Flüge, davon '+noLink.length+' ohne XContest-Link'+(noLink.length&&noLink.length<=40?' ('+noLink.map(x=>x.pilot+' '+String(x.time).slice(0,2)+':'+String(x.time).slice(2,4)).join(', ')+')':''),'#98A4AE');
  const used=new Set(); let ok=0;
  const inWindow=(f,x)=>{ const hm=mins(f.hhmm), t=mins(x.time); let best=1e9; for(const off of [60,120]){ const d=hm-off-t; if(d>=-5&&d<=90) best=Math.min(best,Math.abs(d)); } return best; };
  const pick=(f,test)=>{ let best=null,bestD=1e9; for(const x of noLink){ if(x.date!==f.date||used.has(x)||!test(f,x)) continue; const d=inWindow(f,x); if(d<bestD){ bestD=d; best=x; } } return best; };
  for(const f of flights){ if(byUrl.has(f.url)){ f.status='ok'; f.why=''; ok++; mark(f); } }
  // Durchgang 1: ganzer Name gleich. Durchgang 2: ein Namensbestandteil gleich. Jeweils gleicher Tag und Aufzeichnungsbeginn
  // (Spiel, UTC) zwischen 90 min vor und 5 min nach der XContest-Startzeit (UTC+1 oder UTC+2).
  for(const f of flights){ if(f.status==='ok') continue; const x=pick(f,(f,x)=>norm(f.xcPilot)===norm(x.pilot)); if(x){ used.add(x); f.status='ok'; f.why='derselbe Flug, ohne XContest-Link gespeichert'; f.twin=x; ok++; } }
  for(const f of flights){ if(f.status==='ok') continue; const a=tok(f.xcPilot); const x=pick(f,(f,x)=>{ const b=tok(x.pilot); return a.some(w=>b.includes(w)); }); if(x){ used.add(x); f.status='ok'; f.why='vermutlich derselbe Flug (im Spiel als "'+x.pilot+'"), Link wird erst nach Trackvergleich nachgetragen'; ok++; } else f.status='todo'; }
  flights.forEach(mark);
  for(const f of flights){ if(f.twin) linkTwin(f); }
  const todo=flights.filter(f=>f.status==='todo');
  setSum(ok+' von '+flights.length+' im Spiel');
  log(ok+' von '+flights.length+' Flügen sind schon im Spiel ('+cn+').', '#3FC29A');
  $('#xcr-actions').innerHTML='';
  if(todo.length){ const b=document.createElement('button'); b.textContent=todo.length+' fehlende holen und prüfen'; b.style.cssText='padding:6px 10px;border:0;border-radius:4px;background:#5A9BE6;color:#0E1419;font-weight:700;cursor:pointer'; b.onclick=()=>fetchAll(todo,b); $('#xcr-actions').appendChild(b);
    const t=document.createElement('button'); t.textContent='1 Flug testen'; t.title='Holt nur den ersten fehlenden Flug, als Probelauf'; t.style.cssText='padding:6px 10px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF;cursor:pointer'; t.onclick=()=>{ b.remove(); fetchAll(todo.slice(0,1),t).then(()=>{ if(!busy) check(); }); }; $('#xcr-actions').appendChild(t); }
  else log('Dieser Tag ist komplett.', '#3FC29A');
  $('#xcr-check').disabled=false; return true;
}

// ---------- Holen ----------
let pauseResolve=null;
// Flüge im Spiel ohne Link, mit Track, je Datum (für die Erkennung über den Track)
const twinCache={};
async function dbTracks(date){ if(twinCache[date]) return twinCache[date];
  try{ const r=await gm(cfg.supabaseUrl+'/rest/v1/flights_public?select=pilot,date,time,coords&club_id=eq.'+encodeURIComponent(clubId)+'&date=eq.'+date+'&xc_url=is.null',{headers:dbH()}); twinCache[date]=r.ok?JSON.parse(r.text):[]; }catch(e){ twinCache[date]=[]; }
  return twinCache[date]; }
const trackKm=c=>{ let s=0; for(let i=1;i<c.length;i++) s+=kmBetween(c[i-1],c[i]); return s; };
const secs=t=>{ const d=String(t||'').replace(/\D/g,'').padEnd(6,'0'); return +d.slice(0,2)*3600+ +d.slice(2,4)*60+ +d.slice(4,6); };
async function findTwin(igc){
  const list=await dbTracks(igc.date); const km=trackKm(igc.coords);
  for(const x of list){ if(!x.coords||x.coords.length<2) continue;
    if(Math.abs(secs(x.time)-secs(igc.time))>120) continue;
    if(kmBetween(x.coords[0],igc.coords[0])>3||kmBetween(x.coords[x.coords.length-1],igc.coords[igc.coords.length-1])>3) continue;
    const k2=trackKm(x.coords); if(km>1&&k2>1&&(k2/km<0.85||k2/km>1.15)) continue;
    return x; }
  return null; }
async function linkTwin(f){ const x=f.twin; if(!x||x.linked) return; x.linked=true;
  try{ const r=await gm(cfg.supabaseUrl+'/rest/v1/rpc/set_xc_url',{method:'POST',headers:dbH(),body:JSON.stringify({code:st.code,p_date:x.date,p_time:x.time,p_pilot:x.pilot,p_url:f.url})}); if(r.ok&&r.text==='true') f.why=f.why.replace(/^vermutlich /,'')+' · Link nachgetragen'; mark(f); }catch(e){} }
// ---------- Flugseite im Hilfsfenster öffnen, genau wie beim Lesezeichen (dort bewährt) ----------
const IGC_RX=/(?:href|src)=["']([^"']*(?:track\.php[^"']*|\.igc(?:\?[^"']*)?))["']/i;
const IGC_SEL='a[href*="track.php"],a[href$=".igc"],a[href*=".igc?"],a[href*="/igc/"]';
let win=null, lastPage='', lastAnchor=null;
function getWin(){ if(win&&!win.closed) return win; win=window.open('about:blank','xcrevier','width=900,height=700'); return win; }
// Prüfungserkennung wie im Lesezeichen: Titel und sichtbarer Text, nicht der Quelltext
const winVerify=d=>{ try{ const t=(d.title+' '+(d.body?d.body.innerText.slice(0,600):'')).toLowerCase(); if(/verif|captcha|robot|human|mensch|checking your browser|just a moment|challenge/.test(t)) return true; return [...d.querySelectorAll('iframe[src*="captcha"],iframe[src*="challenge"],iframe[src*="challenges.cloudflare.com"],#challenge-form,.cf-turnstile,.g-recaptcha,.h-captcha')].some(e=>e.offsetWidth>60&&e.offsetHeight>40); }catch(e){ return false; } };
const winLogin=d=>{ try{ return !!d.querySelector('input[name*="login"][type="password"],form[action*="login"] input[type="password"]'); }catch(e){ return false; } };
async function linkViaWindow(f){
  const w=getWin(); if(!w) throw new Error('Hilfsfenster blockiert: bitte Popups für xcontest.org erlauben und nochmal klicken');
  let prev=''; try{ prev=w.document.URL; }catch(e){}
  w.location.href=f.url;
  let n=0, maxN=4*60, settled=0, warned=null, title='';
  while(n++<maxN){
    await sleep(250);
    if(w.closed) throw new Error('Hilfsfenster geschlossen');
    let d=null; try{ d=w.document; }catch(e){}
    if(!d) continue;
    const url=d.URL.split('#')[0]; const fresh=url!==prev&&url!=='about:blank';
    if(fresh){ const a=d.querySelector(IGC_SEL)||[...d.querySelectorAll('a')].find(x=>/\bIGC\b/i.test(x.textContent)&&!/XC/i.test(x.textContent.replace(/IGC/i,''))); if(a){ if(warned){ warned.textContent='✓ Prüfung erledigt'; warned.style.color='#3FC29A'; } lastAnchor=a; const h=a.getAttribute('href')||''; return /^(#|javascript:|$)/i.test(h)?url+'#igc-klick':new URL(h,url).href; } }
    if(winVerify(d)){ if(!warned){ warned=log('⚠ XContest zeigt im Hilfsfenster eine Prüfung. Bitte dort lösen, danach geht es von selbst weiter.','#E6A03B'); maxN=4*300; } n=Math.min(n,maxN-4*60); continue; }
    if(warned){ warned.textContent='✓ Prüfung erledigt'; warned.style.color='#3FC29A'; warned=null; }
    if(!fresh||d.readyState!=='complete') continue;
    title=d.title||'';
    if(winLogin(d)) throw Object.assign(new Error('nicht eingeloggt'),{login:true});
    if(++settled>60) break; // 15 s auf der fertigen Seite ohne IGC-Link (XContest lädt den Flug erst nach der Turnstile-Prüfung nach)
  }
  try{ lastPage=w.document.documentElement.outerHTML; }catch(e){}
  showDiag();
  throw new Error('kein IGC-Link (vom Piloten gesperrt?)'+(title?' · Seite: '+title.slice(0,60):''));
}
function showDiag(){ if($('#xcr-diag')) return; const b=document.createElement('button'); b.id='xcr-diag'; b.textContent='Diagnose speichern'; b.title='Speichert die zuletzt fehlgeschlagene Flugseite als Datei (ohne Skripte), zum Weiterschicken'; b.style.cssText='padding:6px 10px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF;cursor:pointer';
  b.onclick=()=>{ const html=lastPage.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,''); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'})); a.download='xcrevier-diagnose.html'; a.click(); }; $('#xcr-actions').appendChild(b); }
const looksIgc=t=>typeof t==='string'&&/^A[A-Z0-9]{3}/m.test(t.slice(0,300))&&/^B\d{6}/m.test(t);
// Datei abholen: 1. aus dem Hilfsfenster (mit Login-Cookies), 2. über die Erweiterung, 3. Klick auf den Link wie beim Lesezeichen, Datei dabei abfangen
async function fetchIgcText(igcUrl,a){
  const tried=[]; const w=(win&&!win.closed)?win:null; const clickOnly=/#igc-klick$/.test(igcUrl);
  if(w&&!clickOnly){ try{ const rr=await w.fetch(igcUrl,{credentials:'include'}); const t=await rr.text(); if(rr.ok&&looksIgc(t)) return t; tried.push('Fenster '+rr.status+(rr.ok?' (keine IGC-Datei)':'')); }catch(e){ tried.push('Fenster: '+e.message); } }
  if(!clickOnly) try{ const r=await gm(igcUrl,{timeout:60000}); if(r.ok&&looksIgc(r.text)) return r.text; tried.push('Erweiterung '+r.status+(r.ok?' (keine IGC-Datei)':'')); if(r.ok&&isHtml(r.text)&&isLogin(r.text)) tried.push('Login-Seite'); }catch(e){ tried.push('Erweiterung: '+e.message); }
  if(w&&a){ const t=await clickCapture(w,a); if(t) return t; tried.push('Klick ohne Daten'); }
  throw new Error('IGC nicht geladen ('+tried.join(' · ')+') · Link: '+igcUrl.slice(0,90));
}
// Klick auf den IGC-Link im Hilfsfenster; was die Seite dabei lädt (fetch, XHR oder Blob), wird abgefangen
function clickCapture(w,a){ return new Promise(res=>{
  let done=false; const finish=t=>{ if(done) return; done=true; try{ restore(); }catch(e){} res(t||null); };
  const pw=w.wrappedJSObject||w; const orig={fetch:pw.fetch,open:pw.XMLHttpRequest&&pw.XMLHttpRequest.prototype.open,cou:pw.URL&&pw.URL.createObjectURL};
  const restore=()=>{ try{ pw.fetch=orig.fetch; }catch(e){} try{ if(orig.open) pw.XMLHttpRequest.prototype.open=orig.open; }catch(e){} try{ if(orig.cou) pw.URL.createObjectURL=orig.cou; }catch(e){} };
  const check=t=>{ if(looksIgc(t)) finish(t); };
  try{ pw.fetch=function(){ const p=orig.fetch.apply(this,arguments); p.then(r=>{ try{ r.clone().text().then(check); }catch(e){} }); return p; }; }catch(e){}
  try{ pw.URL.createObjectURL=function(b){ try{ if(b&&b.text) b.text().then(check); }catch(e){} return orig.cou.apply(this,arguments); }; }catch(e){}
  try{ pw.XMLHttpRequest.prototype.open=function(){ this.addEventListener('load',function(){ try{ check(this.responseText); }catch(e){} }); return orig.open.apply(this,arguments); }; }catch(e){}
  try{ a.setAttribute('download',''); a.click(); }catch(e){ try{ w.location.href=a.href; }catch(e2){} }
  setTimeout(()=>finish(null),15000);
}); }
async function fetchOne(f){
  f.status='busy'; mark(f);
  // Jede Flugseite wird genau einmal geladen, im Hilfsfenster (wie beim Lesezeichen); dann die IGC-Datei
  const igcUrl=await linkViaWindow(f); log('IGC-Link: '+igcUrl.slice(0,100),'#98A4AE'); const text=await fetchIgcText(igcUrl,lastAnchor);
  const igc={text};
  const p=parseIGC(igc.text); const bad=validate(p.coords); if(bad) throw new Error(bad);
  if(!p.date) p.date=f.date;
  const twin=await findTwin(p); if(twin){ f.twin=twin; f.status='ok'; f.why='schon im Spiel als "'+twin.pilot+'" (gleicher Track)'; mark(f); linkTwin(f); return; }
  f.igc={pilot:p.pilot||f.xcPilot,pilotFromIgc:!!p.pilot,date:p.date,time:p.time,glider:p.glider||'',coords:dp(p.coords,0.0002).map(c=>[+c[0].toFixed(5),+c[1].toFixed(5)])};
  f.status='ready'; f.why=''; mark(f);
}
async function fetchAll(list,btn){
  $('#xcr-actions').querySelectorAll('button').forEach(b=>{ if(b!==btn&&/testen|holen/.test(b.textContent)) b.remove(); });
  if(!getWin()){ log('Hilfsfenster blockiert: bitte Popups für xcontest.org erlauben und nochmal klicken.','#F07A53'); return; }
  btn.disabled=true; busy=true; const slow=st.tempo==='langsam';
  let left=list.slice();
  for(let pass=1;pass<=3&&left.length;pass++){
    if(pass>1){ log('Durchgang '+pass+' für '+left.length+' Flüge in '+(pass===2?20:45)+' s …','#98A4AE'); await sleep((pass===2?20:45)*1000); }
    const fail=[];
    for(let i=0;i<left.length;i++){ const f=left[i]; log('Durchgang '+pass+': '+(i+1)+'/'+left.length+' '+f.xcPilot+' …','#98A4AE');
      try{ await fetchOne(f); if(f.status==='ok') log('✓ '+f.xcPilot+': '+f.why,'#3FC29A'); else log('● '+f.igc.pilot+(f.igc.glider?' · '+f.igc.glider:' · kein Schirm in der IGC'),'#5A9BE6'); }
      catch(e){ f.status='fail'; f.why=e.message; mark(f); fail.push(f); log('✗ '+f.xcPilot+': '+e.message,'#F07A53');
        if(/Hilfsfenster/.test(e.message)){ const rest=left.slice(i+1); const d=log('Das Hilfsfenster ist zu oder blockiert. Bitte offen lassen. ','#E6A03B'); const w2=document.createElement('button'); w2.textContent='Hilfsfenster öffnen und weiter'; w2.style.cssText='margin-left:6px;padding:2px 8px'; d.appendChild(w2); await new Promise(r=>{ w2.onclick=()=>{ w2.disabled=true; getWin(); r(); }; }); if(!getWin()){ log('Hilfsfenster weiterhin blockiert: bitte Popups für xcontest.org erlauben.','#F07A53'); fail.push(...rest); break; } continue; }
        if(e.verify||e.login){ const d=log(e.verify?'XContest verlangt eine Verifizierung. Bitte diesen Flug in einem neuen Tab öffnen, Prüfung lösen, dann hier "Weiter" klicken.':'Bitte in einem neuen Tab bei XContest einloggen, dann "Weiter" klicken.','#E6A03B'); const a=document.createElement('a'); a.href=f.url; a.target='_blank'; a.textContent=' Flug öffnen '; a.style.color='#5A9BE6'; d.appendChild(a); const w=document.createElement('button'); w.textContent='Weiter'; w.style.cssText='margin-left:6px;padding:2px 8px'; d.appendChild(w); await new Promise(r=>{ w.onclick=()=>{ w.disabled=true; r(); }; }); } }
      if((i+1)%10===0&&i+1<left.length){ const p=log('Pause 30 s …','#98A4AE'); for(let s=30;s>0;s--){ p.textContent='Pause '+s+' s, damit XContest nicht bremst …'; await sleep(1000); } p.textContent='Pause vorbei'; }
      else await sleep(slow?rnd(6000,10000):rnd(3000,5000)); }
    left=fail;
  }
  const ready=list.filter(f=>f.status==='ready'); const twins=list.filter(f=>f.status==='ok').length;
  setSum(flights.filter(f=>f.status==='ok').length+' von '+flights.length+' im Spiel');
  log(ready.length+' Flüge geholt und geprüft'+(twins?', '+twins+' waren schon im Spiel (gleicher Track)':'')+(left.length?', '+left.length+' nicht ladbar.':'.'),'#3FC29A');
  if(left.length){ const b=document.createElement('button'); b.textContent=left.length+' nochmal versuchen'; b.style.cssText='padding:6px 10px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF;cursor:pointer'; b.onclick=()=>fetchAll(left,b); $('#xcr-actions').appendChild(b); }
  if(!left.length){ const dg=$('#xcr-diag'); if(dg) dg.remove(); }
  if(ready.length) showPrep(ready); else busy=false;
  if(!left.length){ try{ win&&win.close(); }catch(e){} }
  btn.remove();
}

// ---------- Prüfen vor dem Hochladen (Schirm/Klasse pro Pilot) ----------
function collapseLog(){ const lg=$('#xcr-log'); if($('#xcr-logtog')) return; lg.style.maxHeight='0'; lg.style.overflow='hidden'; lg.style.paddingTop='0'; lg.style.borderTop='0';
  const t=document.createElement('button'); t.id='xcr-logtog'; t.textContent='Protokoll anzeigen'; t.style.cssText='margin:4px 0 8px;padding:2px 8px;border:1px solid #2F3941;border-radius:4px;background:none;color:#98A4AE;cursor:pointer;font-size:12px';
  t.onclick=()=>{ const open=lg.style.maxHeight==='0px'; lg.style.maxHeight=open?'30vh':'0'; lg.style.paddingTop=open?'6px':'0'; lg.style.borderTop=open?'1px solid #2F3941':'0'; t.textContent=open?'Protokoll ausblenden':'Protokoll anzeigen'; }; lg.parentNode.insertBefore(t,lg); }
function showPrep(ready){
  const box=$('#xcr-prep'); box.hidden=false;
  collapseLog(); const dg=$('#xcr-diag'); if(dg) dg.remove(); $('#xcr-actions').querySelectorAll('button').forEach(b=>{ if(/testen|holen/.test(b.textContent)) b.remove(); });
  setTimeout(()=>{ try{ box.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){} },50);
  const remembered=GM_getValue('gliders',{});
  const known={}; inDb.forEach(x=>{ if(x.glider) known[x.pilot]=known[x.pilot]||{glider:x.glider,cls:x.en_class}; });
  const pilots=[...new Set(ready.map(f=>f.igc.pilot))].sort((a,b)=>a.localeCompare(b));
  let h='<div style="border-top:1px solid #2F3941;margin-top:8px;padding-top:8px;font-weight:700">Vor dem Hochladen: Schirm und Klasse</div><div style="color:#98A4AE;margin-bottom:6px">Grün = aus der IGC erkannt. Bei den anderen bitte wählen, oder mit ✕ weglassen.</div>';
  for(const p of pilots){
    const fs=ready.filter(f=>f.igc.pilot===p); const g=fs.map(f=>f.igc.glider).find(Boolean)||'';
    let cls=gliderClass(g); let src=g&&cls?'igc':'';
    let pre=g; if(!cls&&known[p]){ pre=known[p].glider; cls=known[p].cls||gliderClass(pre); src=cls?'db':''; }
    if(!cls&&remembered[p]){ pre=remembered[p]; cls=gliderClass(pre); src=cls?'mem':''; }
    const ok=!!cls;
    h+=`<div class="xcr-prow" data-p="${esc(p)}" style="display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;padding:6px 0;border-top:1px solid #2F3941">
      <div><strong>${esc(p)}</strong> <span style="color:#98A4AE">· ${fs.length} ${fs.length===1?'Flug':'Flüge'}${fs[0].igc.pilotFromIgc?'':' · Name von XContest'}</span></div>
      <button class="xcr-skip" title="Diese Flüge nicht hochladen" style="background:none;border:0;color:#F07A53;font-size:16px;cursor:pointer">✕</button>
      <div style="grid-column:1/-1">${ok?`<span style="color:#3FC29A">✓ ${esc(pre)} · EN-${cls}</span><span style="color:#98A4AE"> (${src==='igc'?'aus der IGC':src==='db'?'wie zuletzt im Spiel':'gemerkt'})</span>`:
        `<div style="color:#E6A03B">${g?esc(g)+' (nicht in der Liste)':'kein Schirm in der IGC'}</div><select class="xcr-g" style="width:100%;padding:5px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF">${gliderOptions('')}</select>
         <div style="margin-top:4px;color:#98A4AE">oder nur Klasse: ${['A','B','C','D','CCC'].map(c=>`<label style="margin-right:6px"><input type="radio" name="cls-${esc(p)}" value="${c}"> ${c}</label>`).join('')}</div>`}</div>
      <input type="hidden" class="xcr-pre" value="${esc(pre)}"><input type="hidden" class="xcr-cls" value="${cls}"></div>`;
  }
  h+=`<div style="margin-top:10px;display:flex;gap:6px;align-items:center"><button id="xcr-up" style="padding:7px 12px;border:0;border-radius:4px;background:#3FC29A;color:#0E1419;font-weight:700;cursor:pointer">Ins Spiel hochladen</button><span id="xcr-upinfo" style="color:#98A4AE"></span></div>`;
  box.innerHTML=h;
  box.querySelectorAll('.xcr-skip').forEach(b=>b.onclick=()=>{ const row=b.closest('.xcr-prow'); row.dataset.skip='1'; row.style.opacity='.4'; b.disabled=true; ready.filter(f=>f.igc.pilot===row.dataset.p).forEach(f=>{ f.status='fail'; f.why='weggelassen'; mark(f); }); });
  $('#xcr-up').onclick=()=>upload(ready);
}

// ---------- Hochladen ----------
async function upload(ready){
  busy=true;
  const btn=$('#xcr-up'); btn.disabled=true; const info=$('#xcr-upinfo');
  const rows=[...panel.querySelectorAll('.xcr-prow')]; const choice={}; const missing=[];
  for(const r of rows){ if(r.dataset.skip) continue; const p=r.dataset.p; let g=r.querySelector('.xcr-pre').value, c=r.querySelector('.xcr-cls').value;
    const sel=r.querySelector('.xcr-g'); if(sel&&sel.value){ g=sel.value; c=gliderClass(g); } const rad=r.querySelector('input[type=radio]:checked'); if(rad) c=rad.value;
    if(!c){ missing.push(p); continue; } choice[p]={g,c}; }
  if(missing.length){ info.textContent='Bitte Schirm oder Klasse wählen (oder ✕): '+missing.join(', '); info.style.color='#F07A53'; btn.disabled=false; return; }
  const remembered=GM_getValue('gliders',{}); for(const p in choice){ if(choice[p].g) remembered[p]=choice[p].g; } GM_setValue('gliders',remembered);
  const list=ready.filter(f=>choice[f.igc.pilot]); let ok=0,dup=0,fail=0;
  for(let i=0;i<list.length;i++){ const f=list[i]; info.textContent='Lade '+(i+1)+' von '+list.length+' …'; info.style.color='#98A4AE';
    const ch=choice[f.igc.pilot];
    const body={pilot:f.igc.pilot,date:f.igc.date,time:f.igc.time,coords:f.igc.coords,club_code:st.code,glider:ch.g||f.igc.glider||null,en_class:ch.c,uploaded_by:st.name||null,xc_url:f.url};
    if(role.role==='super') body.club_id=clubId;
    try{ const r=await gm(cfg.supabaseUrl+'/rest/v1/flights',{method:'POST',headers:{...dbH(),Prefer:'return=minimal'},body:JSON.stringify(body)});
      if(r.ok){ ok++; f.status='ok'; f.why=''; } else if(r.status===409){ dup++; f.status='ok'; f.why='war schon drin'; } else { let m=''; try{ m=JSON.parse(r.text).message||''; }catch(e){} throw new Error(m||('HTTP '+r.status)); } }
    catch(e){ fail++; f.status='fail'; f.why=e.message; log('✗ '+f.igc.pilot+': '+e.message,'#F07A53'); }
    mark(f); await sleep(300);
  }
  const total=flights.filter(f=>f.status==='ok').length; setSum(total+' von '+flights.length+' im Spiel');
  info.textContent=''; log('Hochgeladen: '+ok+(dup?', '+dup+' waren schon drin':'')+(fail?', '+fail+' Fehler':'')+'. Jetzt '+total+' von '+flights.length+' im Spiel.','#3FC29A');
  const a=document.createElement('a'); a.href=GAME+'?club='+encodeURIComponent(clubId)+'&season='+season(flights[0].date); a.target='_blank'; a.textContent='Spiel öffnen (rechnet die neuen Tage und speichert)'; a.style.cssText='color:#5A9BE6;font-weight:700'; $('#xcr-actions').appendChild(a);
  btn.remove(); busy=false;
}
const season=ds=>{ const y=+ds.slice(0,4), m=+ds.slice(5,7); return m>=10?y:y-1; };

$('#xcr-check').onclick=check;
function applyScan(){
  if(busy) return;
  const found=scanFlights(); const sig=found.map(f=>f.url).join('|');
  if(sig===scanSig) return; scanSig=sig;
  document.querySelectorAll('.xcr-st').forEach(e=>e.remove());
  flights=found; $('#xcr-actions').innerHTML=''; $('#xcr-prep').hidden=true; $('#xcr-prep').innerHTML='';
  if(!flights.length){ setSum('keine Flugliste auf dieser Seite'); $('#xcr-check').disabled=true; $('#xcr-check').style.opacity='.5'; $('#xcr-log').textContent='Skript läuft. Bitte eine Flugliste öffnen (z. B. Flüge, dann Tageswertung PG), dann erscheint hier der Abgleich.'; return; }
  setSum(flights.length+' Flüge auf dieser Seite'); $('#xcr-check').disabled=false; $('#xcr-check').style.opacity='1'; $('#xcr-log').textContent='';
  if(st.code) check();
}
applyScan();
const mo=new MutationObserver(()=>{ clearTimeout(mo.t); mo.t=setTimeout(applyScan,800); });
mo.observe(document.body,{childList:true,subtree:true});
setInterval(applyScan,3000);
})();
