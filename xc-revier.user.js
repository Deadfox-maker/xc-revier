// ==UserScript==
// @name         XC Revier: XContest-Flüge ins Spiel laden
// @namespace    https://deadfox-maker.github.io/xc-revier/
// @version      1.2
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
const GAME='https://deadfox-maker.github.io/xc-revier/';
const RX=/:[^\/]+\/\d{1,2}\.\d{1,2}\.\d{4}\/\d{1,2}:\d{2}/;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rnd=(a,b)=>a+Math.random()*(b-a);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const gm=(url,opt={})=>new Promise((res,rej)=>{ GM_xmlhttpRequest({method:opt.method||'GET',url,headers:opt.headers||{},data:opt.body,timeout:opt.timeout||30000,
  onload:r=>res({ok:r.status>=200&&r.status<300,status:r.status,text:r.responseText,headers:r.responseHeaders||''}),onerror:()=>rej(new Error('Netzfehler')),ontimeout:()=>rej(new Error('Zeitüberschreitung'))}); });

// ---------- Fluglinks auf dieser Seite ----------
const absUrl=a=>{ try{ return new URL(a.getAttribute('href'),location.href).href; }catch(e){ return ''; } };
let flights=[]; let busy=false; let scanSig='';
function scanFlights(){
  const linkEls=[...document.querySelectorAll('a[href]')].filter(a=>RX.test(absUrl(a)));
  const out=[]; const seen=new Set();
  for(const a of linkEls){ const href=absUrl(a).split('#')[0]; if(seen.has(href)) continue; seen.add(href);
    const m=href.match(/:([^\/]+)\/(\d{1,2})\.(\d{1,2})\.(\d{4})\/(\d{1,2}):(\d{2})/);
    out.push({url:href,a,row:a.closest('tr')||a.parentElement,xcPilot:decodeURIComponent(m[1]).replace(/[_+]/g,' '),date:`${m[4]}-${m[3].padStart(2,'0')}-${m[2].padStart(2,'0')}`,hhmm:m[5].padStart(2,'0')+m[6],status:'?',why:''}); }
  return out;
}

// ---------- Panel ----------
const st={code:GM_getValue('code',''),name:GM_getValue('name',''),tempo:GM_getValue('tempo','normal')};
const panel=document.createElement('div'); panel.id='xcr-panel';
panel.style.cssText='position:fixed;top:8px;right:8px;z-index:2147483000;width:420px;max-height:92vh;overflow:auto;background:#1E252C;color:#E7ECEF;border:1px solid #2F3941;border-radius:8px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)';
panel.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #2F3941"><strong style="font-size:15px">XC Revier</strong><span id="xcr-sum" style="color:#98A4AE">suche Flugliste …</span><button id="xcr-min" title="Einklappen" style="margin-left:auto;background:none;border:1px solid #2F3941;color:#E7ECEF;border-radius:4px;cursor:pointer;padding:2px 8px">–</button></div>
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
const isVerify=t=>/verif|captcha|robot|checking your browser|just a moment|cf-turnstile|h-captcha|g-recaptcha/i.test(t.slice(0,4000)+t.slice(-4000));
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
  const dates=[...new Set(flights.map(f=>f.date))];
  inDb=[];
  for(const d of dates){ try{ const r=await gm(cfg.supabaseUrl+'/rest/v1/flights_public?select=pilot,date,time,xc_url,glider,en_class&club_id=eq.'+encodeURIComponent(clubId)+'&date=eq.'+d,{headers:dbH()}); if(r.ok) inDb=inDb.concat(JSON.parse(r.text)); }catch(e){} }
  const byUrl=new Set(inDb.map(x=>x.xc_url).filter(Boolean));
  const tok=s=>norm(s).trim().split(' ').filter(t=>t.length>2);
  let ok=0;
  for(const f of flights){
    if(byUrl.has(f.url)){ f.status='ok'; ok++; mark(f); continue; }
    // Rückfall für Flüge, die ohne XContest-Link hochgeladen wurden: gleicher Tag, Startzeit ±3 min (UTC+1/+2), Namensbestandteil gleich
    const hm=+f.hhmm.slice(0,2)*60+ +f.hhmm.slice(2);
    const hit=inDb.find(x=>{ if(x.date!==f.date||x.xc_url) return false; const t=+x.time.slice(0,2)*60+ +x.time.slice(2,4); const diff=Math.min(Math.abs(hm-t-60),Math.abs(hm-t-120),Math.abs(hm-t)); if(diff>3) return false; const a=tok(f.xcPilot), b=tok(x.pilot); return a.some(w=>b.includes(w)); });
    if(hit){ f.status='ok'; f.why='vermutlich derselbe Flug (ohne XContest-Link gespeichert)'; ok++; } else f.status='todo';
    mark(f);
  }
  const todo=flights.filter(f=>f.status==='todo');
  setSum(ok+' von '+flights.length+' im Spiel');
  log(ok+' von '+flights.length+' Flügen sind schon im Spiel ('+cn+').', '#3FC29A');
  $('#xcr-actions').innerHTML='';
  if(todo.length){ const b=document.createElement('button'); b.textContent=todo.length+' fehlende holen und prüfen'; b.style.cssText='padding:6px 10px;border:0;border-radius:4px;background:#5A9BE6;color:#0E1419;font-weight:700;cursor:pointer'; b.onclick=()=>fetchAll(todo,b); $('#xcr-actions').appendChild(b); }
  else log('Dieser Tag ist komplett.', '#3FC29A');
  $('#xcr-check').disabled=false; return true;
}

// ---------- Holen ----------
let pauseResolve=null;
async function fetchOne(f){
  f.status='busy'; mark(f);
  const page=await gm(f.url,{timeout:40000});
  if(isVerify(page.text)){ throw Object.assign(new Error('Verifizierung nötig'),{verify:true}); }
  if(!page.ok) throw new Error('Seite nicht geladen ('+page.status+')');
  if(isLogin(page.text)) throw Object.assign(new Error('nicht eingeloggt'),{login:true});
  const m=page.text.match(/href="([^"]*(?:track\.php[^"]*|\.igc[^"]*))"/i);
  if(!m) throw new Error('kein IGC-Link (vom Piloten gesperrt?)');
  const igcUrl=new URL(m[1].replace(/&amp;/g,'&'),f.url).href;
  const igc=await gm(igcUrl,{timeout:60000});
  if(!igc.ok) throw new Error('IGC nicht geladen ('+igc.status+')');
  if(isVerify(igc.text)&&!/^A/m.test(igc.text)) throw Object.assign(new Error('Verifizierung nötig'),{verify:true});
  const p=parseIGC(igc.text); const bad=validate(p.coords); if(bad) throw new Error(bad);
  if(!p.date) p.date=f.date;
  f.igc={pilot:p.pilot||f.xcPilot,pilotFromIgc:!!p.pilot,date:p.date,time:p.time,glider:p.glider||'',coords:dp(p.coords,0.0002).map(c=>[+c[0].toFixed(5),+c[1].toFixed(5)])};
  f.status='ready'; f.why=''; mark(f);
}
async function fetchAll(list,btn){
  btn.disabled=true; busy=true; const slow=st.tempo==='langsam';
  let left=list.slice();
  for(let pass=1;pass<=3&&left.length;pass++){
    if(pass>1){ log('Durchgang '+pass+' für '+left.length+' Flüge in '+(pass===2?20:45)+' s …','#98A4AE'); await sleep((pass===2?20:45)*1000); }
    const fail=[];
    for(let i=0;i<left.length;i++){ const f=left[i]; log('Durchgang '+pass+': '+(i+1)+'/'+left.length+' '+f.xcPilot+' …','#98A4AE');
      try{ await fetchOne(f); log('● '+f.igc.pilot+(f.igc.glider?' · '+f.igc.glider:' · kein Schirm in der IGC'),'#5A9BE6'); }
      catch(e){ f.status='fail'; f.why=e.message; mark(f); fail.push(f); log('✗ '+f.xcPilot+': '+e.message,'#F07A53');
        if(e.verify||e.login){ const d=log(e.verify?'XContest verlangt eine Verifizierung. Bitte diesen Flug in einem neuen Tab öffnen, Prüfung lösen, dann hier "Weiter" klicken.':'Bitte in einem neuen Tab bei XContest einloggen, dann "Weiter" klicken.','#E6A03B'); const a=document.createElement('a'); a.href=f.url; a.target='_blank'; a.textContent=' Flug öffnen '; a.style.color='#5A9BE6'; d.appendChild(a); const w=document.createElement('button'); w.textContent='Weiter'; w.style.cssText='margin-left:6px;padding:2px 8px'; d.appendChild(w); await new Promise(r=>{ w.onclick=()=>{ w.disabled=true; r(); }; }); } }
      if((i+1)%10===0&&i+1<left.length){ const p=log('Pause 30 s …','#98A4AE'); for(let s=30;s>0;s--){ p.textContent='Pause '+s+' s, damit XContest nicht bremst …'; await sleep(1000); } p.textContent='Pause vorbei'; }
      else await sleep(slow?rnd(6000,10000):rnd(3000,5000)); }
    left=fail;
  }
  const ready=list.filter(f=>f.status==='ready');
  log(ready.length+' Flüge geholt und geprüft'+(left.length?', '+left.length+' nicht ladbar.':'.'),'#3FC29A');
  if(left.length){ const b=document.createElement('button'); b.textContent=left.length+' nochmal versuchen'; b.style.cssText='padding:6px 10px;border:1px solid #2F3941;border-radius:4px;background:#151A1F;color:#E7ECEF;cursor:pointer'; b.onclick=()=>fetchAll(left,b); $('#xcr-actions').appendChild(b); }
  if(ready.length) showPrep(ready); else busy=false;
  btn.remove();
}

// ---------- Prüfen vor dem Hochladen (Schirm/Klasse pro Pilot) ----------
function showPrep(ready){
  const box=$('#xcr-prep'); box.hidden=false;
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
