// ══════════════════════════════════════════════════════════════════
//  Gartenverein – Mitglieder & E-Mail-Verteiler
//  Standalone, max. Sicherheit: echtes E-Mail/Passwort-Login (Firebase Auth),
//  KEIN anonymer Zugang. Daten nur fuer angemeldete Konten lesbar/schreibbar.
// ══════════════════════════════════════════════════════════════════
(function(){
"use strict";

// ── Helfer ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const val = id => { const el=$(id); return el ? el.value.trim() : ''; };
function toast(msg,type){ const e=document.createElement('div'); e.className='toast'+(type?(' '+type):''); e.textContent=msg; $('toasts').appendChild(e); setTimeout(()=>e.remove(),3200); }
function openModal(html, wide){ const m=$('modal-body'); m.innerHTML=html; m.classList.toggle('modal-wide', !!wide); $('modal-bg').classList.add('show'); }
function closeModal(){ $('modal-bg').classList.remove('show'); }
const telHref  = t => 'tel:'+String(t||'').replace(/[^\d+]/g,'');
const mailHref = m => 'mailto:'+esc(String(m||'').trim());
function normEmails(parts){
  const seen=new Set(), out=[];
  (Array.isArray(parts)?parts:[parts]).forEach(s=>String(s||'').split(/[,;\s]+/).forEach(tok=>{
    const e=tok.trim(); if(e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)){ const k=e.toLowerCase(); if(!seen.has(k)){ seen.add(k); out.push(e); } }
  }));
  return out;
}
function openMail(emails, feld){
  const list=normEmails(emails);
  if(!list.length){ toast('Keine gültigen E-Mail-Adressen.','err'); return; }
  const url='mailto:?'+(feld||'bcc')+'='+encodeURIComponent(list.join(','));
  if(url.length>1900) toast('Sehr viele Adressen – ggf. „Kopieren" nutzen.','');
  try{ window.location.href=url; }catch(e){ const a=document.createElement('a'); a.href=url; a.click(); }
}
function copyText(txt){
  if(!txt){ toast('Nichts zu kopieren.','err'); return; }
  const done=()=>toast('Adressen kopiert ✓','ok');
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done,()=>fallbackCopy(txt,done)); }
  else fallbackCopy(txt,done);
}
function fallbackCopy(txt,done){ try{ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }catch(e){ toast('Kopieren nicht möglich.','err'); } }
const newId = () => 'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);

// ── State ──────────────────────────────────────────────────────────
let _user=null, _ref=null;
let _cache={ mitglieder:{}, verteiler:{}, meta:{} };
let _view='mitglieder', _q='', _statusFilter='';

function members(){ return Object.values(_cache.mitglieder||{}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'})); }
function lists(){ return Object.values(_cache.verteiler||{}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'})); }
function whoLabel(){ return (_user&&(_user.displayName||_user.email))||''; }
// ── Rechnungsführer: Finanzdaten nur für ihn sichtbar ──────────────
function myEmail(){ return String((_user&&_user.email)||'').toLowerCase().trim(); }
function rechnungsfuehrer(){ return String((_cache.meta&&_cache.meta.rechnungsfuehrer)||'').toLowerCase().trim(); }
// Solange kein Rechnungsführer festgelegt ist, sehen alle die Finanzdaten
// (für die Ersteinrichtung). Danach nur noch der hinterlegte Rechnungsführer.
function canSeeFinance(){ const rf=rechnungsfuehrer(); return !rf || myEmail()===rf; }
function canManageRf(){ const rf=rechnungsfuehrer(); return !rf || myEmail()===rf; }

// ── Firebase Init + Auth ───────────────────────────────────────────
function init(){
  try{
    if(window.APP_TITEL){ $('login-titel').textContent=window.APP_TITEL; $('brand').textContent=window.APP_TITEL; document.title=window.APP_TITEL+' – Mitglieder & Verteiler'; }
    firebase.initializeApp(window.FIREBASE_CONFIG);
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
    firebase.auth().onAuthStateChanged(handleAuth);
  }catch(e){
    document.body.innerHTML='<div style="padding:40px;font-family:Arial">⚠️ Firebase-Konfiguration fehlt oder ist ungültig.<br><br>Bitte <b>firebase-config.js</b> mit deinen Projektdaten ausfüllen.<br><small>'+esc(e&&e.message)+'</small></div>';
  }
  $('login-form').addEventListener('submit', doLogin);
}
function handleAuth(user){
  // Nur echte Passwort-Konten zulassen (kein anonym)
  if(user && (user.providerData||[]).some(p=>p.providerId==='password')){
    _user=user;
    $('login').classList.remove('show');
    $('app').classList.add('show');
    $('who').textContent=whoLabel();
    startData();
  } else {
    if(user){ try{ firebase.auth().signOut(); }catch(e){} }
    _user=null;
    $('app').classList.remove('show');
    $('login').classList.add('show');
    setTimeout(()=>$('li-email').focus(),60);
  }
}
function doLogin(ev){
  ev.preventDefault();
  const email=val('li-email'), pw=$('li-pw').value;
  $('login-err').style.display='none';
  if(!email||!pw){ showLoginErr('Bitte E-Mail und Passwort eingeben.'); return; }
  firebase.auth().signInWithEmailAndPassword(email, pw).catch(err=>{
    const c=err&&err.code;
    showLoginErr(
      c==='auth/invalid-credential'||c==='auth/wrong-password'||c==='auth/user-not-found' ? 'E-Mail oder Passwort falsch.' :
      c==='auth/too-many-requests' ? 'Zu viele Versuche – bitte später erneut.' :
      c==='auth/invalid-email' ? 'Ungültige E-Mail-Adresse.' :
      ('Anmeldung fehlgeschlagen: '+(err&&err.message||''))
    );
  });
}
function showLoginErr(m){ const el=$('login-err'); el.textContent=m; el.style.display='block'; }
function logout(){ try{ firebase.auth().signOut(); }catch(e){} }

// Passwort vergessen (Login): Reset-Mail an die eingegebene Adresse
function forgotPw(){
  const email=val('li-email');
  if(!email || !/@/.test(email)){ showLoginErr('Bitte zuerst oben deine E-Mail eingeben – dann „Passwort vergessen".'); return; }
  firebase.auth().sendPasswordResetEmail(email)
    .then(()=>{ showLoginErr(''); toast('E-Mail zum Zurücksetzen verschickt ✓','ok'); })
    .catch(err=>{ showLoginErr('Konnte keine Mail senden: '+(err&&err.message||'')); });
}

// Eigenes Passwort ändern – sicher: altes Passwort wird geprüft (Reauth)
function changePwModal(){
  openModal(`<h3>🔑 Mein Passwort ändern</h3>
   <div class="field"><label>Aktuelles Passwort *</label><input id="p-cur" type="password" autocomplete="current-password"></div>
   <div class="field"><label>Neues Passwort * <span style="font-weight:400;text-transform:none">(mind. 6 Zeichen)</span></label><input id="p-new" type="password" autocomplete="new-password"></div>
   <div class="field"><label>Neues Passwort wiederholen *</label><input id="p-new2" type="password" autocomplete="new-password"></div>
   <div class="actions-row"><button class="btn" onclick="GV.close()">Abbrechen</button><button class="btn primary" onclick="GV.savePw()">Ändern</button></div>`);
}
function savePw(){
  const cur=val('p-cur'), n1=val('p-new'), n2=val('p-new2');
  if(n1.length<6){ toast('Neues Passwort: mindestens 6 Zeichen.','err'); return; }
  if(n1!==n2){ toast('Die neuen Passwörter stimmen nicht überein.','err'); return; }
  const user=firebase.auth().currentUser; if(!user){ toast('Nicht angemeldet.','err'); return; }
  const cred=firebase.auth.EmailAuthProvider.credential(user.email, cur);
  user.reauthenticateWithCredential(cred).then(()=>user.updatePassword(n1))
    .then(()=>{ closeModal(); toast('Passwort geändert ✓','ok'); })
    .catch(err=>{ const c=err&&err.code; toast((c==='auth/wrong-password'||c==='auth/invalid-credential')?'Aktuelles Passwort ist falsch.':'Fehler: '+(err&&err.message||''),'err'); });
}

// Neuen Login anlegen (über zweite App-Instanz, damit die eigene Sitzung bleibt)
function provisionUser(email, pw){
  return new Promise((resolve,reject)=>{
    try{
      const cfg=firebase.app().options;
      const sec=(firebase.apps||[]).find(a=>a.name==='admin-prov') || firebase.initializeApp(cfg,'admin-prov');
      sec.auth().createUserWithEmailAndPassword(email, pw)
        .then(()=>{ try{ sec.auth().signOut(); }catch(_){}; resolve(); })
        .catch(err=>{ try{ sec.auth().signOut(); }catch(_){}; reject(err); });
    }catch(e){ reject(e); }
  });
}
function addUserModal(){
  openModal(`<h3>👤 Nutzer anlegen</h3>
   <div class="muted" style="margin-bottom:12px">Legt einen neuen Login an. Tipp: Häkchen unten setzen → die Person bekommt eine Mail und vergibt ihr Passwort selbst (du musst es dann nicht kennen).</div>
   <div class="field"><label>E-Mail *</label><input id="u-email" type="email" autocomplete="off"></div>
   <div class="field"><label>Start-Passwort * <span style="font-weight:400;text-transform:none">(mind. 6 Zeichen)</span></label><input id="u-pw" type="text" autocomplete="off" placeholder="z. B. Start1234"></div>
   <label class="ck"><input type="checkbox" id="u-reset" checked> Mail zum eigenen Passwort-Setzen an die Person senden</label>
   <div class="actions-row"><button class="btn" onclick="GV.close()">Abbrechen</button><button class="btn primary" onclick="GV.saveUser()">Anlegen</button></div>`);
}
function saveUser(){
  const email=val('u-email'), pw=val('u-pw');
  if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Bitte eine gültige E-Mail eingeben.','err'); return; }
  if(pw.length<6){ toast('Start-Passwort: mindestens 6 Zeichen.','err'); return; }
  const reset=!!($('u-reset')&&$('u-reset').checked);
  toast('Lege Nutzer an …','');
  provisionUser(email, pw).then(()=>{
    if(reset) firebase.auth().sendPasswordResetEmail(email).catch(()=>{});
    closeModal(); toast('Nutzer angelegt ✓'+(reset?' – Mail zum Passwort-Setzen verschickt.':''),'ok');
  }).catch(err=>{ const c=err&&err.code;
    toast(c==='auth/email-already-in-use'?'Diese E-Mail hat schon einen Zugang.':(c==='auth/weak-password'?'Passwort zu schwach.':(c==='auth/invalid-email'?'Ungültige E-Mail.':'Fehler: '+(err&&err.message||''))),'err');
  });
}

// ── Datenschicht (realtime, granulare Writes) ──────────────────────
function startData(){
  if(_ref) return;  // nur einmal
  _ref = firebase.database().ref('gv');
  ['mitglieder','verteiler','meta'].forEach(coll=>{
    _ref.child(coll).on('value', snap=>{
      _cache[coll] = snap.val() || {};
      if($('modal-bg').classList.contains('show')) return; // Formular offen → nicht neu zeichnen
      render();
    });
  });
}
function saveMeta(obj){ const meta=Object.assign({}, _cache.meta||{}, obj); _cache.meta=meta; if(_ref) _ref.child('meta').set(meta).catch(e=>toast('Speichern fehlgeschlagen: '+(e&&e.message),'err')); }
// Schreiben = sofort lokal übernehmen (optimistisch) + im Hintergrund speichern.
// So erscheint die Änderung SOFORT, ohne aufs Echtzeit-Signal zu warten.
function saveMember(m){ m.updatedAt=Date.now(); m.updatedBy=whoLabel(); if(!_cache.mitglieder) _cache.mitglieder={}; _cache.mitglieder[m.id]=m; if(_ref) _ref.child('mitglieder').child(m.id).set(m).catch(e=>toast('Speichern fehlgeschlagen: '+(e&&e.message),'err')); }
function delMember(id){ if(_cache.mitglieder) delete _cache.mitglieder[id]; if(_ref) _ref.child('mitglieder').child(id).remove().catch(e=>toast('Löschen fehlgeschlagen: '+(e&&e.message),'err')); }
function saveListe(v){ v.updatedAt=Date.now(); v.updatedBy=whoLabel(); if(!_cache.verteiler) _cache.verteiler={}; _cache.verteiler[v.id]=v; if(_ref) _ref.child('verteiler').child(v.id).set(v).catch(e=>toast('Speichern fehlgeschlagen: '+(e&&e.message),'err')); }
function delListe(id){ if(_cache.verteiler) delete _cache.verteiler[id]; if(_ref) _ref.child('verteiler').child(id).remove().catch(e=>toast('Löschen fehlgeschlagen: '+(e&&e.message),'err')); }

// ══════════════════════════════════════════════════════════════════
//  Ansichten
// ══════════════════════════════════════════════════════════════════
function show(v){ _view=v; _q=''; const s=$('search'); if(s) s.value=''; render(); }
function onSearch(v){ _q=String(v||'').toLowerCase().trim(); render(); }
function statusFilter(v){ _statusFilter=v||''; render(); }
function render(){
  const tb=$('tab-beitraege');
  $('tab-mitglieder').classList.toggle('active', _view==='mitglieder');
  $('tab-verteiler').classList.toggle('active', _view==='verteiler');
  const tg=$('tab-gartenordnung'); if(tg) tg.classList.toggle('active', _view==='gartenordnung');
  if(tb) tb.classList.toggle('active', _view==='beitraege');
  $('view').innerHTML = _view==='verteiler' ? viewVerteiler()
    : (_view==='gartenordnung' ? viewGartenordnung()
    : (_view==='beitraege' ? viewBeitraege() : viewMitglieder()));
}

// ── Mitglieder ─────────────────────────────────────────────────────
function matchM(m){ return [m.name,m.email,m.tel,m.adresse,m.note,(m.parzellen||[]).map(p=>p.nr).join(' '),(m.aemter||[]).map(a=>a.amt).join(' ')].map(x=>String(x||'').toLowerCase()).join(' ').includes(_q); }
function memberCard(m){ const amt=currentAmt(m), pz=currentParz(m);
  return `<div class="card" style="cursor:pointer" onclick="GV.openMember('${m.id}')">
      <h3>${esc(m.name||'(ohne Name)')}</h3>
      ${(m.email||m.tel)?`<div class="links" style="margin-top:6px" onclick="event.stopPropagation()">
        ${m.email?`<a href="${mailHref(m.email)}">✉️ ${esc(m.email)}</a>`:''}
        ${m.tel?`<a href="${telHref(m.tel)}">📞 ${esc(m.tel)}</a>`:''}
      </div>`:''}
      <div class="links" style="margin-top:6px">
        ${statusChip(m)}
        ${amt?`<span class="chip cur">🏅 ${esc(amt)}</span>`:''}
        ${pz?`<span class="chip">🌳 Parzelle ${esc(pz)}</span>`:''}
        ${m.sepaAktiv?`<span class="chip">🏦 SEPA</span>`:''}
      </div>
    </div>`; }
function leftCard(m){ return `<div class="card" style="cursor:pointer" onclick="GV.openMember('${m.id}')">
      <h3>${esc(m.name||'(ohne Name)')}</h3>
      <div class="sub">${statusLabel(m)}</div>
      ${(m.parzellen&&m.parzellen.length)?`<div class="links" style="margin-top:8px">${m.parzellen.map(p=>`<span class="chip">🌳 ${esc(p.nr)} ${parzRange(p)}</span>`).join('')}</div>`:''}
    </div>`; }
function viewMitglieder(){
  let arr=members(); if(_q) arr=arr.filter(matchM);
  if(_statusFilter) arr=arr.filter(m=>mStatus(m)===_statusFilter);
  const active=arr.filter(isAktiv), left=arr.filter(m=>!isAktiv(m));
  // Übersicht: Amtsinhaber oben, der Rest nach niedrigster Parzellennummer
  active.sort((a,b)=>{
    const aA=currentAmt(a)?1:0, bA=currentAmt(b)?1:0;
    if(aA!==bA) return bA-aA;
    if(aA&&bA) return String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'});
    const pa=minParz(a), pb=minParz(b);
    if(pa!==pb) return pa-pb;
    return String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'});
  });
  const cards=active.map(memberCard).join('') || `<div class="muted">${_q?'Keine aktiven Treffer.':'Noch keine Mitglieder. Lege das erste an.'}</div>`;
  return `<div class="sec">
    <h2><span>👥 Mitglieder (${members().filter(isAktiv).length})</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select class="btn" style="font-weight:600" onchange="GV.statusFilter(this.value)" title="Nach Status filtern">
          <option value="" ${_statusFilter===''?'selected':''}>Status: Alle</option>
          ${STATUS_OPTS.concat([['verstorben','Verstorben']]).map(([v,l])=>`<option value="${v}" ${_statusFilter===v?'selected':''}>${l}</option>`).join('')}
        </select>
        <button class="btn" title="Mitglieder & Bankdaten per Excel" onclick="GV.impExp()">⇅ Import/Export</button>
        <button class="btn primary" onclick="GV.newMember()">＋ Mitglied</button>
      </span></h2>
    <div class="list">${cards}</div>
    ${left.length?`<details style="margin-top:14px"><summary style="cursor:pointer;color:var(--muted);font-size:13px;font-weight:600">🗂️ Ehemalige Mitglieder – ausgetreten/verstorben (${left.length})</summary><div class="list" style="margin-top:10px">${left.map(leftCard).join('')}</div></details>`:''}
  </div>
  ${freieGaertenHtml()}`;
}
function mailAlle(){
  const emails=members().filter(isAktiv).map(m=>m.email).filter(Boolean);
  if(!emails.length){ toast('Keine E-Mail-Adressen hinterlegt.','err'); return; }
  openMail(emails,'bcc');
}
// ── Freie Gärten: Parzellen, die (durch Austritt/Tod) frei geworden sind ──
function occupiedParz(){ const s={}; members().forEach(m=>{ if(isFormer(m)) return; (m.parzellen||[]).forEach(p=>{ if(p.nr && !p.bis) s[String(p.nr)]=m.name; }); }); return s; }
function lastHolder(nr){ let best=null; members().forEach(m=>(m.parzellen||[]).forEach(p=>{ if(String(p.nr)!==String(nr)) return; const key=String(p.bis||p.von||''); if(!best || key>best.key) best={name:m.name, bis:p.bis||'', key}; })); return best; }
function freieGaertenHtml(){
  const occ=occupiedParz();
  const universe=new Set(); members().forEach(m=>(m.parzellen||[]).forEach(p=>{ if(p.nr) universe.add(String(p.nr)); }));
  let free=[...universe].filter(nr=>!occ[nr]);
  free.sort((a,b)=>{ const na=parseInt(a,10), nb=parseInt(b,10); if(!isNaN(na)&&!isNaN(nb)&&na!==nb) return na-nb; return String(a).localeCompare(String(b),'de',{numeric:true}); });
  if(!free.length) return '';
  const items=free.map(nr=>{ const h=lastHolder(nr);
    return `<span class="chip" style="background:#fff4e5;border-color:#ffd9a0;color:#b56a00">🌳 ${esc(nr)}${h&&h.name?` – zuletzt ${esc(h.name)}`:''}${h&&h.bis?' (bis '+fmtDateShort(h.bis)+')':''}</span>`;
  }).join('');
  return `<div class="sec" style="margin-top:16px">
    <h2><span>🌳 Freie Gärten (${free.length})</span></h2>
    <div class="muted" style="margin-bottom:8px">Parzellen, die durch Austritt oder Tod frei geworden sind und aktuell niemandem zugeordnet sind.</div>
    <div class="links">${items}</div>
  </div>`;
}
function parzRowHtml(p){ p=p||{};
  return `<div class="parz-row">
    <input class="pz-nr" placeholder="Parzelle Nr." value="${esc(p.nr||'')}" data-von="${esc(p.von||'')}" data-bis="${esc(p.bis||'')}" oninput="GV.parzPrefill(this)" style="flex:1;min-width:70px">
    <button type="button" class="x" title="Zeile entfernen" onclick="GV.delParz(this)">✕</button>
  </div>`;
}
// Gespeicherte Größe (m²) je Parzellennummer (für Besitzerwechsel-Übernahme)
function parzGroesse(nr){ const r=(_cache.meta&&_cache.meta.parzGroesse)||{}; const v=r[String(nr||'').trim()]; return (v!=null&&v!=='')?v:null; }
// Datum automatisch: neue Parzelle bekommt das Eintrittsdatum als „von";
// bestehende behalten ihr Datum; „bis" wird bei Austritt/Tod automatisch gesetzt.
function readParz(eintritt){
  const def = eintritt || new Date().toISOString().slice(0,10);
  return Array.from(document.querySelectorAll('.pz-nr')).map(inp=>{
    const nr=(inp.value||'').trim(); if(!nr) return null;
    return { nr, von:(inp.getAttribute('data-von')||'')||def, bis:inp.getAttribute('data-bis')||'' };
  }).filter(Boolean).sort((a,b)=>String(a.von||'').localeCompare(String(b.von||'')));
}
const AEMTER=['1. Vorsitzende/r','2. Vorsitzende/r','Kassenwart/in','Schriftführer/in','Beisitzer/in','Gerätewart/in','Wertermittler/in','Vorstand'];
// Verwaltbare Ämter-Liste (in meta gespeichert, sonst Standard)
function aemterListe(){ const s=(_cache.meta&&_cache.meta.aemterListe)||''; const arr=String(s).split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean); return arr.length?arr:AEMTER; }
function manageAemter(){
  const cur=aemterListe().join('\n');
  const v=prompt('Ämter verwalten (ein Amt pro Zeile):', cur);
  if(v===null) return;
  saveMeta({aemterListe:String(v).trim()});
  const dl=$('amt-list'); if(dl) dl.innerHTML=aemterListe().map(a=>`<option value="${esc(a)}">`).join('');
  toast('Ämter-Liste gespeichert ✓','ok');
}
// Niedrigste AKTUELLE Parzellennummer (für Sortierung); ohne Parzelle = ganz unten
function minParz(m){ let min=Infinity; (m.parzellen||[]).forEach(p=>{ if(p.bis) return; const n=parseInt(p.nr,10); if(!isNaN(n)&&n<min) min=n; }); return min; }
function amtRowHtml(a){ a=a||{};
  return `<div class="amt-item">
    <div class="amt-row">
      <input class="am-amt" list="amt-list" placeholder="Amt" value="${esc(a.amt||'')}" oninput="GV.amtPrev(this)" style="flex:1.4;min-width:110px">
      <input class="am-von" type="date" value="${esc(a.von||'')}" title="von" style="flex:1">
      <input class="am-bis" type="date" value="${esc(a.bis||'')}" title="bis (leer = aktuell)" style="flex:1">
      <button type="button" class="x" title="Zeile entfernen" onclick="GV.delAmt(this)">✕</button>
    </div>
    <div class="am-prev">${amtHoldersText(a.amt)}</div>
  </div>`;
}
// Bisherige Inhaber eines Amtes (über alle Mitglieder, inkl. ehemaliger)
function amtHoldersList(amtName){
  if(!amtName) return [];
  const out=[];
  members().forEach(m=>(m.aemter||[]).forEach(a=>{ if(a.amt && String(a.amt).toLowerCase()===String(amtName).toLowerCase()) out.push({name:m.name||'?', von:a.von||'', bis:a.bis||''}); }));
  out.sort((a,b)=>String(a.von||'').localeCompare(String(b.von||'')));
  return out;
}
function amtHoldersText(amtName){
  const l=amtHoldersList(amtName);
  if(!String(amtName||'').trim()) return '';
  if(!l.length) return 'Dieses Amt hatte bisher niemand.';
  return '👥 Bisher: '+l.map(h=>esc(h.name)+' '+parzRange(h)).join(' · ');
}
function amtPrev(input){ const item=input.closest('.amt-item'); if(!item) return; const box=item.querySelector('.am-prev'); if(box) box.innerHTML=amtHoldersText(input.value.trim()); }
function readAemter(){
  return Array.from(document.querySelectorAll('.amt-row')).map(r=>({
    amt:(r.querySelector('.am-amt').value||'').trim(),
    von:r.querySelector('.am-von').value||'',
    bis:r.querySelector('.am-bis').value||''
  })).filter(a=>a.amt).sort((a,b)=>String(a.von||'').localeCompare(String(b.von||'')));
}
function currentAmt(m){ if(isFormer(m)) return ''; const as=Array.isArray(m.aemter)?m.aemter:[]; const open=as.filter(a=>!a.bis); return open.map(a=>a.amt).join(', '); }
// SEPA/Bankdaten als kopierbarer Block (für Überweisung/Lastschrift)
function sepaText(m){
  const L=[];
  L.push('Kontoinhaber: '+(m.kontoinhaber||m.name||''));
  if(m.iban) L.push('IBAN: '+m.iban);
  if(m.bic) L.push('BIC: '+m.bic);
  if(m.mandatsref) L.push('Mandatsreferenz: '+m.mandatsref+(m.mandatsdatum?(' vom '+fmtDateShort(m.mandatsdatum)):''));
  return L.join('\n');
}
function copySepa(id){ const m=_cache.mitglieder[id]; if(!m) return; if(!String(m.iban||'').trim()){ toast('Keine IBAN hinterlegt.','err'); return; } copyText(sepaText(m)); }
function copySepaForm(){
  const m={ name:val('m-name'), kontoinhaber:val('m-inhaber'), iban:val('m-iban'), bic:val('m-bic'), mandatsref:val('m-mref'), mandatsdatum:val('m-mdat') };
  if(!String(m.iban).trim()){ toast('Keine IBAN eingegeben.','err'); return; }
  copyText(sepaText(m));
}
function isFormer(m){ return m.status==='ausgetreten' || m.status==='verstorben'; }
function statusLabel(m){ return m.status==='verstorben' ? ('🕯️ verstorben'+(m.austrittsdatum?' am '+fmtDateShort(m.austrittsdatum):'')) : ('🚪 ausgetreten'+(m.austrittsdatum?' am '+fmtDateShort(m.austrittsdatum):'')); }
// ── Mitgliedsstatus ───────────────────────────────────────────────
const STATUS_OPTS=[['aktiv','Aktiv'],['passiv','Passiv'],['ehrenmitglied','Ehrenmitglied'],['ausgetreten','Ausgetreten']];
const STATUS_LABEL={aktiv:'Aktiv',passiv:'Passiv',ehrenmitglied:'Ehrenmitglied',ausgetreten:'Ausgetreten',verstorben:'Verstorben'};
function mStatus(m){ return m.status||'aktiv'; }
function statusChip(m){ const s=mStatus(m); if(s==='aktiv') return '';
  const col=s==='ehrenmitglied'?'background:#fff7e0;border-color:#f0d58a;color:#8a6d00':(s==='passiv'?'background:#eef2f8;border-color:#dbe2ee;color:#5a6b85':'');
  return `<span class="chip" style="${col}">${esc(STATUS_LABEL[s]||s)}</span>`;
}
function currentParz(m){ if(isFormer(m)) return ''; const ps=Array.isArray(m.parzellen)?m.parzellen:[]; const open=ps.filter(p=>!p.bis); if(open.length) return open[open.length-1].nr; return ''; }
function fmtDateShort(s){ if(!s) return ''; const p=String(s).split('-'); return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(s); }
function parzRange(p){ return `(${fmtDateShort(p.von)||'?'} – ${p.bis?fmtDateShort(p.bis):'heute'})`; }
function isAktiv(m){ return !isFormer(m); }
// Austritt: persönliche Daten löschen, NUR Name + Parzellen-Verlauf behalten,
// offene Parzellen mit dem Austrittsdatum schließen, Adresse aus Verteilern entfernen.
function doArchive(id, status){
  const m=_cache.mitglieder[id]; if(!m) return;
  const istTod = status==='verstorben';
  const label = istTod ? 'Sterbedatum' : 'Austrittsdatum';
  const def=new Date().toISOString().slice(0,10);
  const datum=prompt(`${label} (JJJJ-MM-TT).\nAchtung: Alle persönlichen Daten (E-Mail, Telefon, Adresse, Bankdaten) werden gelöscht – nur Name, Parzellen- und Ämter-Verlauf bleiben erhalten.`, def);
  if(datum===null) return;
  const d=(String(datum).trim())||def;
  const oldMail=String(m.email||'').toLowerCase().trim();
  const parz=(Array.isArray(m.parzellen)?m.parzellen:[]).map(p=>({nr:p.nr, von:p.von||'', bis:p.bis||d}));
  const aem=(Array.isArray(m.aemter)?m.aemter:[]).map(a=>({amt:a.amt, von:a.von||'', bis:a.bis||d}));
  // Vollständig ersetzen → alle anderen Felder (Mail/Tel/Adresse/SEPA …) fallen weg
  saveMember({ id:m.id, name:m.name, status:(istTod?'verstorben':'ausgetreten'), austrittsdatum:d,
    eintrittsdatum:m.eintrittsdatum||'', parzellen:parz, aemter:aem, createdAt:m.createdAt||Date.now() });
  // Aus allen Verteilern entfernen
  if(oldMail){ lists().forEach(v=>{ const cur=normEmails(v.emails); if(cur.some(e=>e.toLowerCase()===oldMail)) saveListe(Object.assign({},v,{emails:cur.filter(e=>e.toLowerCase()!==oldMail)})); }); }
  closeModal(); render(); toast((istTod?'Als verstorben markiert':'Austritt eingetragen')+' – persönliche Daten gelöscht.','ok');
}
function memberForm(m){
  const ls=lists();
  const myMail=String(m.email||'').toLowerCase().trim();
  const vBlock = ls.length ? `<div class="field"><label>✉️ Zu Verteiler hinzufügen</label>
     <div class="pick">${ls.map(v=>{ const inIt=myMail && normEmails(v.emails).some(e=>e.toLowerCase()===myMail);
        return `<label><input type="checkbox" class="m-vt" value="${esc(v.id)}" ${inIt?'checked':''}> ${esc(v.name||'(ohne Name)')}</label>`; }).join('')}</div>
     <div class="muted" style="margin-top:4px">Wirkt nur mit hinterlegter E-Mail.</div></div>` : '';
  return `<h3>${m.id?'✎ Mitglied':'＋ Mitglied'}</h3>
   ${isFormer(m)?`<div style="background:#fdecea;border:1px solid #f0bcb6;border-radius:8px;padding:8px 10px;margin-bottom:12px;color:#c0392b;font-size:13px">${statusLabel(m)} – persönliche Daten wurden gelöscht. Name, Parzellen- &amp; Ämter-Verlauf bleiben erhalten.</div>`:''}
   <div style="display:flex;gap:10px;flex-wrap:wrap">
     <div class="field" style="flex:2;min-width:180px"><label>Name *</label><input id="m-name" value="${esc(m.name||'')}"></div>
     <div class="field" style="flex:1;min-width:120px"><label>Mitgliednummer</label><input id="m-nr" value="${esc(m.mitgliednr||'')}" placeholder="z. B. 18"></div>
   </div>
   <div style="display:flex;gap:10px;flex-wrap:wrap">
     <div class="field" style="flex:1;min-width:150px"><label>Status</label><select id="m-status">${STATUS_OPTS.concat(mStatus(m)==='verstorben'?[['verstorben','Verstorben']]:[]).map(([v,l])=>`<option value="${v}" ${mStatus(m)===v?'selected':''}>${l}</option>`).join('')}</select></div>
     <div class="field" style="flex:1;min-width:140px"><label>Eintrittsdatum</label><input id="m-eintritt" type="date" value="${esc(m.eintrittsdatum||'')}"></div>
   </div>
   <div class="field"><label>E-Mail</label><input id="m-email" type="email" value="${esc(m.email||'')}"></div>
   <div class="field"><label>Telefon</label><input id="m-tel" value="${esc(m.tel||'')}"></div>
   <div class="field"><label>Adresse <span style="font-weight:400;text-transform:none">(mehrzeilig – mit Enter neue Zeile)</span></label><textarea id="m-adresse" rows="3" placeholder="Straße Nr.&#10;PLZ Ort">${esc(m.adresse||'')}</textarea></div>

   <div class="sec-head">🌳 Gartenparzellen (Verlauf)</div>
   <div id="m-parz">${(Array.isArray(m.parzellen)?m.parzellen:[]).map(parzRowHtml).join('')}</div>
   <button type="button" class="btn" onclick="GV.addParz()">＋ Parzelle</button>
   <div class="muted" style="margin-top:4px">Datum wird automatisch gesetzt: „von" = Eintrittsdatum, „bis" beim Austritt/Tod.</div>

   <div class="sec-head" style="display:flex;justify-content:space-between;align-items:center">🏅 Ämter (Verlauf) <button type="button" class="btn" style="padding:4px 10px;font-size:12px" onclick="GV.manageAemter()">⚙ Ämter verwalten</button></div>
   <datalist id="amt-list">${aemterListe().map(a=>`<option value="${esc(a)}">`).join('')}</datalist>
   <div id="m-amt">${(Array.isArray(m.aemter)?m.aemter:[]).map(amtRowHtml).join('')}</div>
   <button type="button" class="btn" onclick="GV.addAmt()">＋ Amt</button>
   <div class="muted" style="margin-top:4px">„bis" leer lassen = aktuelles Amt.</div>

   <div class="sec-head" style="display:flex;justify-content:space-between;align-items:center">🏦 SEPA-Lastschrift <button type="button" class="btn" style="padding:4px 10px;font-size:12px" onclick="GV.copySepaForm()">⧉ Bankdaten kopieren</button></div>
   <label class="ck"><input type="checkbox" id="m-sepa" ${m.sepaAktiv?'checked':''}> SEPA-Lastschriftmandat erteilt</label>
   <div class="field"><label>Kontoinhaber <span style="font-weight:400;text-transform:none">(falls abweichend)</span></label><input id="m-inhaber" value="${esc(m.kontoinhaber||'')}"></div>
   <div style="display:flex;gap:10px;flex-wrap:wrap">
     <div class="field" style="flex:2;min-width:180px"><label>IBAN</label><input id="m-iban" value="${esc(m.iban||'')}" placeholder="DE.." autocomplete="off"></div>
     <div class="field" style="flex:1;min-width:90px"><label>BIC</label><input id="m-bic" value="${esc(m.bic||'')}" autocomplete="off"></div>
   </div>
   <div style="display:flex;gap:10px;flex-wrap:wrap">
     <div class="field" style="flex:1;min-width:150px"><label>Mandatsreferenz</label><input id="m-mref" value="${esc(m.mandatsref||'')}"></div>
     <div class="field" style="flex:1;min-width:130px"><label>Mandat vom</label><input id="m-mdat" type="date" value="${esc(m.mandatsdatum||'')}"></div>
   </div>
   <div class="sec-head">💶 Beitrag / Abrechnung <span style="font-weight:400;text-transform:none;font-size:12px;color:var(--muted)">(Sätze in den Einstellungen)</span></div>
   <div style="display:flex;gap:10px;flex-wrap:wrap">
     <div class="field" style="flex:1;min-width:130px"><label>Gartenfläche (m²)</label><input id="m-flaeche" type="number" step="0.01" min="0" value="${m.flaeche!=null&&m.flaeche!==''?esc(m.flaeche):''}" placeholder="z. B. 350" oninput="GV.beitragPrev()"></div>
     <div class="field" style="flex:1;min-width:130px"><label>Wasserverbrauch (m³)</label><input id="m-wasser" type="number" step="0.01" min="0" value="${m.wasserverbrauch!=null&&m.wasserverbrauch!==''?esc(m.wasserverbrauch):''}" placeholder="0" oninput="GV.beitragPrev()"></div>
   </div>
   <label class="ck"><input type="checkbox" id="m-gemein" ${m.gemeinschaftGeleistet?'checked':''} onchange="GV.beitragPrev()"> Gemeinschaftsarbeit geleistet (Betrag entfällt)</label>
   <div style="display:flex;gap:10px;flex-wrap:wrap">
     <div class="field" style="flex:1;min-width:150px"><label>Pforte nicht geöffnet (Anzahl Termine)</label><input id="m-pforte" type="number" step="1" min="0" value="${m.pforteCount?esc(m.pforteCount):''}" placeholder="0" oninput="GV.beitragPrev()"></div>
     <div class="field" style="flex:1;min-width:150px"><label>Ersetzte Wasseruhren (Frost)</label><input id="m-frost" type="number" step="1" min="0" value="${m.frostCount?esc(m.frostCount):''}" placeholder="0" oninput="GV.beitragPrev()"></div>
   </div>
   <div class="sec-head" style="margin-top:6px;display:flex;justify-content:space-between;align-items:center">Posten berechnen <button type="button" class="btn" style="padding:3px 9px;font-size:11px;font-weight:600" onclick="GV.setFamilie()">👪 Familienmitglied</button></div>
   <div class="muted" style="margin:-4px 0 6px;font-size:12px">Standard: alles berechnet. Bei Familienmitgliedern (Alibi-Parzelle) Garten-/Wasser-Posten abwählen – „👪 Familienmitglied" macht das mit einem Klick.</div>
   <div class="pick">${BEITRAG_POSTEN.map(([k,l])=>`<label><input type="checkbox" class="m-post" value="${k}" ${postAktiv(m,k)?'checked':''} onchange="GV.beitragPrev()"> ${esc(l)}</label>`).join('')}</div>
   <div id="m-beitrag-prev" class="beitrag-box" style="margin-top:10px">${beitragPrevHtml(m)}</div>

   <div class="field"><label>Notiz</label><textarea id="m-note" rows="2">${esc(m.note||'')}</textarea></div>
   ${vBlock}
   <div class="actions-row">
   ${m.id?`<button class="btn danger" style="margin-right:auto" onclick="GV.askDelMember('${m.id}')">🗑 Löschen</button>`:''}
   ${(m.id && !isFormer(m))?`<button class="btn danger" onclick="GV.doArchive('${m.id}','ausgetreten')">🚪 Austritt</button><button class="btn danger" onclick="GV.doArchive('${m.id}','verstorben')">🕯️ Verstorben</button>`:''}
   <button class="btn" onclick="GV.close()">Abbrechen</button>
   <button class="btn primary" onclick="GV.saveMemberForm('${m.id||''}')">${m.id?'Speichern':'Anlegen'}</button></div>`;
}
function newMember(){ openModal(memberForm({}), true); }
function editMember(id){ const m=_cache.mitglieder[id]; if(m) openModal(memberForm(m), true); }
// Klick auf ein Mitglied → alle Infos (read-only), unten „Bearbeiten"
function openMember(id){ const m=_cache.mitglieder[id]; if(m) openModal(memberDetailHtml(m), true); }
function memberDetailHtml(m){
  const det=(label,inner)=>inner?`<div class="dt"><div class="dt-l">${label}</div><div class="dt-v">${inner}</div></div>`:'';
  const parz=(m.parzellen||[]).length?(m.parzellen||[]).map(p=>`<span class="chip${!p.bis?' cur':''}">🌳 ${esc(p.nr)} ${parzRange(p)}</span>`).join(' '):'';
  const aem=(m.aemter||[]).length?(m.aemter||[]).map(a=>`<span class="chip${!a.bis?' cur':''}">🏅 ${esc(a.amt)} ${parzRange(a)}</span>`).join(' '):'';
  const sepa = (m.sepaAktiv||m.iban) ? `${esc(m.kontoinhaber||m.name||'')}${m.iban?'<br>IBAN: '+esc(m.iban):''}${m.bic?'<br>BIC: '+esc(m.bic):''}${m.mandatsref?'<br>Mandat: '+esc(m.mandatsref)+(m.mandatsdatum?' vom '+fmtDateShort(m.mandatsdatum):''):''}${m.iban?`<br><button class="btn" style="margin-top:8px" onclick="GV.copySepa('${m.id}')">⧉ Bankdaten kopieren</button>`:''}` : '';
  return `<h3 style="margin-bottom:4px">${esc(m.name||'(ohne Name)')}</h3>
   ${isFormer(m)?`<div style="background:#fdecea;border:1px solid #f0bcb6;border-radius:8px;padding:6px 10px;margin-bottom:12px;color:#c0392b;font-size:13px">${statusLabel(m)}</div>`:'<div style="margin-bottom:14px"></div>'}
   ${det('Mitgliednummer', m.mitgliednr?esc(m.mitgliednr):'')}
   ${det('Status', esc(STATUS_LABEL[mStatus(m)]||'Aktiv'))}
   ${det('Eintrittsdatum', m.eintrittsdatum?fmtDateShort(m.eintrittsdatum):'')}
   ${det('E-Mail', m.email?`<a href="${mailHref(m.email)}">${esc(m.email)}</a>`:'')}
   ${det('Telefon', m.tel?`<a href="${telHref(m.tel)}">${esc(m.tel)}</a>`:'')}
   ${det('Adresse', m.adresse?`<span style="white-space:pre-line">${esc(m.adresse)}</span>`:'')}
   ${det('Notiz', m.note?esc(m.note):'')}
   ${det('🌳 Gartenparzellen (Verlauf)', parz)}
   ${det('🏅 Ämter (Verlauf)', aem)}
   ${det('🏦 SEPA-Lastschrift', sepa)}
   ${isAktiv(m)?`<div class="dt"><div class="dt-l">💶 Beitrag ${esc(sepaCfg().beitragsjahr)}</div><div class="dt-v"><div class="beitrag-box">${beitragTableHtml(m)}</div><button class="btn" style="margin-top:8px" onclick="GV.beitragPdf('${m.id}')">🧾 Rechnung / Abrechnung drucken</button></div></div>`:''}
   ${isAktiv(m)?`<div class="dt"><div class="dt-l">⚖️ Gartenordnung</div><div class="dt-v">${
     offeneVerstoesse(m).length
       ? `<div class="vlist">${offeneVerstoesse(m).map(v=>vRow(m,v)).join('')}</div>`
       : '<span class="muted">Keine offenen Verstöße.</span>'
     }<button class="btn" style="margin-top:8px" onclick="GV.newVerstoss('${m.id}')">＋ Verstoß erfassen</button></div></div>`:''}
   <div class="actions-row" style="margin-top:18px">
     <button class="btn" onclick="GV.close()">Schließen</button>
     <button class="btn primary" onclick="GV.editMember('${m.id}')">✎ Bearbeiten</button>
   </div>`;
}
function saveMemberForm(id){
  const name=val('m-name'); if(!name){ toast('Bitte einen Namen eingeben.','err'); return; }
  const email=val('m-email');
  const ex=id?_cache.mitglieder[id]:null;
  const eintritt=val('m-eintritt');
  const rec={ id:id||newId(), name, mitgliednr:val('m-nr'), eintrittsdatum:eintritt,
    email, tel:val('m-tel'), adresse:val('m-adresse'), note:val('m-note'),
    parzellen:readParz(eintritt), aemter:readAemter(),
    status: ($('m-status')&&$('m-status').value)||'aktiv',
    sepaAktiv:!!($('m-sepa')&&$('m-sepa').checked),
    kontoinhaber:val('m-inhaber'), iban:val('m-iban'), bic:val('m-bic'),
    mandatsref:val('m-mref'), mandatsdatum:val('m-mdat'),
    flaeche:(val('m-flaeche')!==''? num(val('m-flaeche')) : ''),
    wasserverbrauch:(val('m-wasser')!==''? num(val('m-wasser')) : ''),
    gemeinschaftGeleistet:!!($('m-gemein')&&$('m-gemein').checked),
    pforteCount:(val('m-pforte')!==''? num(val('m-pforte')) : ''),
    frostCount:(val('m-frost')!==''? num(val('m-frost')) : ''),
    postenAus: formPostenAus()||(ex&&Array.isArray(ex.postenAus)?ex.postenAus:[]),
    createdAt:(ex&&ex.createdAt)||Date.now() };
  // Bestehende Beitrags-/Mahn-/Verstoß-Daten erhalten (werden anderswo gepflegt)
  if(ex){ if(ex.bezahltJahr!=null) rec.bezahltJahr=ex.bezahltJahr; if(ex.mahnStufe!=null) rec.mahnStufe=ex.mahnStufe; if(ex.mahnDatum) rec.mahnDatum=ex.mahnDatum; if(Array.isArray(ex.verstoesse)) rec.verstoesse=ex.verstoesse; if(ex.austrittsdatum&&isFormer(rec)) rec.austrittsdatum=ex.austrittsdatum; }
  // Parzellengröße je Parzellennummer merken (für automatische Übernahme beim Besitzerwechsel)
  const _fl=num(rec.flaeche,0);
  if(_fl>0){ const reg=Object.assign({}, (_cache.meta&&_cache.meta.parzGroesse)||{});
    (rec.parzellen||[]).forEach(p=>{ if(!p.bis && p.nr) reg[String(p.nr).trim()]=_fl; });
    saveMeta({parzGroesse:reg}); }
  // Verteiler-Mitgliedschaft (vor close lesen)
  const want=new Set(Array.from(document.querySelectorAll('.m-vt:checked')).map(x=>x.value));
  const allBoxes=Array.from(document.querySelectorAll('.m-vt')).map(x=>x.value);
  saveMember(rec);
  if(email && /@/.test(email)){
    allBoxes.forEach(vid=>{
      const v=_cache.verteiler[vid]; if(!v) return;
      const cur=normEmails(v.emails); const has=cur.some(e=>e.toLowerCase()===email.toLowerCase());
      if(want.has(vid) && !has){ saveListe(Object.assign({}, v, {emails:normEmails([...cur, email])})); }
      else if(!want.has(vid) && has){ saveListe(Object.assign({}, v, {emails:cur.filter(e=>e.toLowerCase()!==email.toLowerCase())})); }
    });
  }
  closeModal(); render(); toast('Mitglied gespeichert ✓','ok');
}
function askDelMember(id){ const m=_cache.mitglieder[id]; if(!m) return; if(!confirm(`Mitglied „${m.name||''}" endgültig löschen?`)) return; delMember(id); closeModal(); render(); toast('Gelöscht.',''); }

// ── Verteiler ──────────────────────────────────────────────────────
function viewVerteiler(){
  let arr=lists();
  if(_q) arr=arr.filter(v=>String(v.name||'').toLowerCase().includes(_q) || normEmails(v.emails).some(e=>e.toLowerCase().includes(_q)));
  const cards=arr.map(v=>{ const n=normEmails(v.emails).length;
    return `<div class="card">
      <h3>✉️ ${esc(v.name||'(ohne Name)')}</h3>
      <div class="sub">${n} Adresse${n===1?'':'n'}</div>
      <div class="actions">
        <button class="btn primary" onclick="GV.verteilerMail('${v.id}')">✉️ Mail (BCC)</button>
        <button class="btn" onclick="GV.verteilerCopy('${v.id}')">⧉ Kopieren</button>
        <button class="btn" onclick="GV.editListe('${v.id}')">Bearbeiten</button>
        <button class="x" title="Löschen" onclick="GV.askDelListe('${v.id}')">✕</button>
      </div>
    </div>`; }).join('') || `<div class="muted">${_q?'Keine Treffer.':'Noch keine Verteiler. Lege einen an und füge Adressen hinzu.'}</div>`;
  const anyMail=members().filter(isAktiv).some(m=>m.email);
  return `<div class="sec">
    <h2><span>✉️ E-Mail-Verteiler (${lists().length})</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap">
        ${anyMail?`<button class="btn" title="Mail an alle aktiven Mitglieder (BCC)" onclick="GV.mailAlle()">✉️ Mail an alle</button>`:''}
        <button class="btn primary" onclick="GV.newListe()">＋ Verteiler</button>
      </span></h2>
    <div class="muted" style="margin-bottom:10px">„Mail (BCC)" öffnet dein Mailprogramm mit allen Adressen im BCC – die Empfänger sehen einander nicht.</div>
    <div class="list">${cards}</div>
  </div>`;
}
function listeForm(v){
  const withMail=members().filter(m=>m.email).sort((a,b)=>String(a.name).localeCompare(String(b.name),'de',{sensitivity:'base'}));
  const opts=['<option value="">– Mitglied hinzufügen –</option>'].concat(withMail.map(m=>`<option value="${esc(m.email)}">${esc(m.name)} (${esc(m.email)})</option>`)).join('');
  return `<h3>${v.id?'✎ Verteiler':'＋ Verteiler'}</h3>
   <div class="field"><label>Name *</label><input id="v-name" value="${esc(v.name||'')}" placeholder="z. B. Alle Mitglieder"></div>
   <div class="field"><label>E-Mail-Adressen <span style="font-weight:400;text-transform:none">(eine pro Zeile)</span></label><textarea id="v-emails" rows="8">${esc(normEmails(v.emails).join('\n'))}</textarea></div>
   <div class="field"><label>Mitglied übernehmen</label><select id="v-pick" onchange="GV.listeAddMember()">${opts}</select></div>
   <div class="actions-row"><button class="btn" onclick="GV.close()">Abbrechen</button>
   <button class="btn primary" onclick="GV.saveListeForm('${v.id||''}')">${v.id?'Speichern':'Anlegen'}</button></div>`;
}
function newListe(){ openModal(listeForm({})); }
function editListe(id){ const v=_cache.verteiler[id]; if(v) openModal(listeForm(v)); }
function listeAddMember(){
  const sel=$('v-pick'); const mail=sel?sel.value:''; if(sel) sel.value='';
  if(!mail) return;
  const ta=$('v-emails'); const before=normEmails([ta?ta.value:'']).length;
  const merged=normEmails([(ta?ta.value:''), mail]);
  if(ta) ta.value=merged.join('\n');
  toast(merged.length>before?'Mitglied übernommen ✓':'Adresse ist bereits in der Liste','ok');
}
function saveListeForm(id){
  const name=val('v-name'); if(!name){ toast('Bitte einen Namen eingeben.','err'); return; }
  const emails=normEmails([val('v-emails')]);
  const ex=id?_cache.verteiler[id]:null;
  saveListe({ id:id||newId(), name, emails, createdAt:(ex&&ex.createdAt)||Date.now() });
  closeModal(); render(); toast('Verteiler gespeichert ✓','ok');
}
function askDelListe(id){ const v=_cache.verteiler[id]; if(!v) return; if(!confirm(`Verteiler „${v.name||''}" löschen?`)) return; delListe(id); render(); toast('Gelöscht.',''); }
function verteilerMail(id){ const v=_cache.verteiler[id]; if(v) openMail(v.emails,'bcc'); }
function verteilerCopy(id){ const v=_cache.verteiler[id]; if(v) copyText(normEmails(v.emails).join('; ')); }

// ══════════════════════════════════════════════════════════════════
//  Gartenordnung: Verstöße erfassen + mahnen (Vorstand, nicht Finanzen)
// ══════════════════════════════════════════════════════════════════
//  Das Mahnwesen gilt nicht nur für Beiträge, sondern auch für Verstöße
//  gegen die Gartenordnung. Jeder Verstoß hat eine eigene Mahnstufe.
//  Gespeichert je Mitglied unter m.verstoesse = [{id,datum,beschreibung,
//  mahnStufe,mahnDatum,erledigt}].
function memberVerstoesse(m){ return Array.isArray(m.verstoesse)?m.verstoesse:[]; }
function offeneVerstoesse(m){ return memberVerstoesse(m).filter(v=>!v.erledigt); }
function viewGartenordnung(){
  const all=members().filter(isAktiv);
  const withOpen=all.filter(m=>offeneVerstoesse(m).length)
    .sort((a,b)=>{ const sa=Math.max(0,...offeneVerstoesse(a).map(v=>v.mahnStufe||0)), sb=Math.max(0,...offeneVerstoesse(b).map(v=>v.mahnStufe||0));
      return sb-sa || String(a.name||'').localeCompare(String(b.name||''),'de'); });
  const erledigtCount=all.reduce((n,m)=>n+memberVerstoesse(m).filter(v=>v.erledigt).length,0);
  const offenCount=all.reduce((n,m)=>n+offeneVerstoesse(m).length,0);
  const cards=withOpen.map(m=>{
    const rows=offeneVerstoesse(m).map(v=>vRow(m,v)).join('');
    return `<div class="card">
      <h3 style="cursor:pointer" onclick="GV.openMember('${m.id}')">${esc(m.name||'(ohne Name)')}</h3>
      <div class="vlist">${rows}</div>
    </div>`;
  }).join('') || `<div class="muted">🌿 Keine offenen Verstöße gegen die Gartenordnung.</div>`;
  return `<div class="sec">
    <h2><span>⚖️ Gartenordnung – Verstöße (${offenCount})</span>
      <button class="btn primary" onclick="GV.newVerstoss()">＋ Verstoß erfassen</button></h2>
    <div class="muted" style="margin-bottom:10px">Hier werden Verstöße gegen die Gartenordnung erfasst und gemahnt: Stufe 1 Hinweis/Aufforderung, Stufe 2 Abmahnung (beide per E-Mail), Stufe 3 Letzte Abmahnung als druckbares PDF. Versanddatum wird automatisch gesetzt.</div>
    <div class="list">${cards}</div>
  </div>`;
}
function vRow(m,v){
  const st=v.mahnStufe||0;
  const stTxt=st===0?'<span class="chip">erfasst</span>':`<span class="chip" style="background:#fdecea;border-color:#f0bcb6;color:#c0392b">${esc(VERSTOSS_TXT[st].gruss)}</span>`;
  const dat=v.mahnDatum?`<span class="muted" style="font-size:12px"> · zuletzt ${fmtDateShort(v.mahnDatum)}</span>`:'';
  const hasMail=String(m.email||'').trim();
  return `<div class="vitem">
    <div class="vhead"><span class="vbesch">${esc(v.beschreibung||'(ohne Beschreibung)')}</span><span class="muted" style="font-size:12px;white-space:nowrap">${v.datum?fmtDateShort(v.datum):''}</span></div>
    <div class="sub" style="margin:2px 0 6px">${stTxt}${dat}</div>
    <div class="actions" style="flex-wrap:wrap">
      <button class="btn" ${hasMail?'':'disabled style="opacity:.5"'} title="${hasMail?'':'Keine E-Mail hinterlegt'}" onclick="GV.verstossMail('${m.id}','${v.id}',1)">✉️ Stufe 1: Hinweis</button>
      <button class="btn" ${hasMail?'':'disabled style="opacity:.5"'} onclick="GV.verstossMail('${m.id}','${v.id}',2)">✉️ Stufe 2: Abmahnung</button>
      <button class="btn" onclick="GV.verstossPdf('${m.id}','${v.id}')">🖨️ Stufe 3: Letzte Abmahnung (PDF)</button>
      <button class="btn primary" onclick="GV.verstossErledigt('${m.id}','${v.id}')">✓ Erledigt</button>
      <button class="x" title="Verstoß löschen" onclick="GV.verstossDel('${m.id}','${v.id}')">✕</button>
    </div>
  </div>`;
}
function newVerstoss(forId){
  const opts=members().filter(isAktiv).sort((a,b)=>String(a.name).localeCompare(String(b.name),'de',{sensitivity:'base'}))
    .map(m=>`<option value="${m.id}" ${forId===m.id?'selected':''}>${esc(m.name)}</option>`).join('');
  const heute=new Date().toISOString().slice(0,10);
  openModal(`<h3>＋ Verstoß gegen die Gartenordnung</h3>
   <div class="field"><label>Mitglied *</label><select id="vs-member">${opts}</select></div>
   <div class="field"><label>Datum</label><input id="vs-datum" type="date" value="${heute}"></div>
   <div class="field"><label>Beschreibung des Verstoßes *</label><textarea id="vs-besch" rows="4" placeholder="z. B. Hecke nicht geschnitten, Wege nicht gepflegt, unerlaubte Bebauung …"></textarea></div>
   <div class="actions-row"><button class="btn" onclick="GV.close()">Abbrechen</button>
   <button class="btn primary" onclick="GV.saveVerstoss()">Erfassen</button></div>`, true);
}
function saveVerstoss(){
  const mid=val('vs-member'); const m=mid?_cache.mitglieder[mid]:null;
  if(!m){ toast('Bitte ein Mitglied wählen.','err'); return; }
  const besch=val('vs-besch'); if(!besch){ toast('Bitte den Verstoß beschreiben.','err'); return; }
  const v={ id:newId(), datum:val('vs-datum')||new Date().toISOString().slice(0,10), beschreibung:besch, mahnStufe:0, mahnDatum:'', erledigt:false };
  const rec=Object.assign({}, m, { verstoesse:[...memberVerstoesse(m), v] });
  saveMember(rec); closeModal(); _view='gartenordnung'; render(); toast('Verstoß erfasst ✓','ok');
}
function _vUpdate(mid,vid,fn){ const m=_cache.mitglieder[mid]; if(!m) return null;
  const list=memberVerstoesse(m).map(v=>v.id===vid?Object.assign({},v):v);
  const v=list.find(x=>x.id===vid); if(!v) return null; fn(v);
  saveMember(Object.assign({}, m, {verstoesse:list})); return v;
}
const VERSTOSS_TXT={
  1:{gruss:'Hinweis', betreff:'Hinweis – Einhaltung der Gartenordnung',
     einl:'bei einer Kontrolle haben wir einen Verstoß gegen die Gartenordnung festgestellt. Wir bitten Sie, den unten genannten Punkt zeitnah zu beheben.'},
  2:{gruss:'Abmahnung', betreff:'Abmahnung – Verstoß gegen die Gartenordnung',
     einl:'trotz unseres Hinweises besteht der nachfolgend genannte Verstoß gegen die Gartenordnung weiterhin. Wir mahnen Sie hiermit ab und fordern Sie auf, den Zustand unverzüglich zu beheben.'},
  3:{gruss:'Letzte Abmahnung', betreff:'Letzte Abmahnung – Verstoß gegen die Gartenordnung',
     einl:'leider wurde der nachfolgend genannte Verstoß gegen die Gartenordnung trotz mehrfacher Aufforderung nicht behoben. Dies ist die letzte Abmahnung. Bei weiterem Ausbleiben einer Abhilfe behält sich der Vorstand vor, das Pachtverhältnis zu kündigen.'}
};
function verstossBody(m,v,stufe){ const c=sepaCfg(); const t=VERSTOSS_TXT[stufe];
  return `Sehr geehrte/r ${m.name||'Gartenfreund/in'},\n\n${t.einl}\n\nFestgestellter Verstoß${v.datum?' (am '+fmtDateShort(v.datum)+')':''}:\n${v.beschreibung||''}\n\nBitte stellen Sie die Einhaltung der Gartenordnung sicher. Bei Rückfragen wenden Sie sich an den Vorstand.\n\nMit freundlichen Grüßen\n${c.vereinName||'Der Vorstand'}`;
}
function verstossMail(mid,vid,stufe){ const m=_cache.mitglieder[mid]; if(!m) return;
  if(!String(m.email||'').trim()){ toast('Keine E-Mail hinterlegt.','err'); return; }
  const v=memberVerstoesse(m).find(x=>x.id===vid); if(!v) return;
  const t=VERSTOSS_TXT[stufe];
  const href=`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(t.betreff)}&body=${encodeURIComponent(verstossBody(m,v,stufe))}`;
  window.location.href=href;
  _vUpdate(mid,vid,x=>{ x.mahnStufe=stufe; x.mahnDatum=new Date().toISOString().slice(0,10); });
  render(); toast(`${t.gruss} an ${m.name} – Versanddatum gesetzt ✓`,'ok');
}
function verstossPdf(mid,vid){ const m=_cache.mitglieder[mid]; if(!m) return; const c=sepaCfg();
  const v=memberVerstoesse(m).find(x=>x.id===vid); if(!v) return;
  const heute=fmtDateShort(new Date().toISOString().slice(0,10));
  const body=verstossBody(m,v,3).replace(/\n/g,'<br>');
  const html=`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Letzte Abmahnung – ${esc(m.name||'')}</title>
   <style>body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.5}
   .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2f9e3f;padding-bottom:8px;margin-bottom:30px}
   .head h1{color:#2f9e3f;font-size:20px;margin:0}.addr{margin:24px 0;white-space:pre-line}
   .stufe{display:inline-block;background:#fdecea;color:#c0392b;border:1px solid #f0bcb6;border-radius:6px;padding:3px 10px;font-weight:700;font-size:13px;margin-bottom:18px}
   @media print{body{margin:0}.noprint{display:none}}</style></head>
   <body>
    <div class="head"><h1>${esc(c.vereinName||'Verein der Gartenfreunde Kronshagen e.V. von 1946')}</h1><div style="text-align:right;font-size:13px;color:#555">${esc(heute)}</div></div>
    <div class="addr">${esc(m.name||'')}${m.adresse?'\n'+esc(m.adresse):''}</div>
    <div class="stufe">⚖️ Letzte Abmahnung – Verstoß gegen die Gartenordnung</div>
    <p>${body}</p>
    <div class="noprint" style="margin-top:30px"><button onclick="window.print()" style="padding:10px 18px;font-size:15px;background:#2f9e3f;color:#fff;border:0;border-radius:8px;cursor:pointer">🖨️ Drucken / als PDF speichern</button></div>
   </body></html>`;
  const w=window.open('','_blank'); if(!w){ toast('Bitte Popups erlauben.','err'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  _vUpdate(mid,vid,x=>{ x.mahnStufe=3; x.mahnDatum=new Date().toISOString().slice(0,10); });
  render(); toast(`Letzte Abmahnung für ${m.name} erstellt – Versanddatum gesetzt ✓`,'ok');
}
function verstossErledigt(mid,vid){ _vUpdate(mid,vid,x=>{ x.erledigt=true; x.erledigtAm=new Date().toISOString().slice(0,10); }); render(); toast('Verstoß als erledigt markiert ✓','ok'); }
function verstossDel(mid,vid){ const m=_cache.mitglieder[mid]; if(!m) return;
  if(!confirm('Diesen Verstoß wirklich löschen?')) return;
  saveMember(Object.assign({}, m, {verstoesse:memberVerstoesse(m).filter(v=>v.id!==vid)})); render(); toast('Verstoß gelöscht.',''); }

// ══════════════════════════════════════════════════════════════════
//  Beiträge: Einstellungen · SEPA-XML-Export (pain.008) · Mahnwesen
// ══════════════════════════════════════════════════════════════════
function num(v,def){ if(v==null||v==='') return def==null?0:def; const n=parseFloat(String(v).replace(',','.')); return isNaN(n)?(def==null?0:def):n; }
// Alle Beitrags-Posten sind frei konfigurierbar (ändern sich jährlich). Die
// hier hinterlegten Werte sind nur die Erst-Vorbelegung (Stand 2025).
const POSTEN_DEF={ pachtProM2:0.144, jahresbeitrag:60, gemeinschaft:45, wasserverlust:11.39,
  pauschaleWasser:10, versicherung:2, wasserzaehler:5, wasserpreis:0, pforteGebuehr:10, frostGebuehr:35 };
function sepaCfg(){ const c=(_cache.meta&&_cache.meta.sepaCfg)||{}; const P=c.posten||{}; const po={};
  Object.keys(POSTEN_DEF).forEach(k=>{ po[k]=(P[k]!=null&&P[k]!=='')?num(P[k],POSTEN_DEF[k]):POSTEN_DEF[k]; });
  return {
    glaeubigerId:c.glaeubigerId||'', vereinName:String(c.vereinName||'').replace('1948','1946'), iban:c.iban||'', bic:c.bic||'',
    faelligkeit:c.faelligkeit||'', verwendung:c.verwendung||'Mitgliedsbeitrag',
    beitragsjahr:(c.beitragsjahr!=null&&c.beitragsjahr!=='')?c.beitragsjahr:new Date().getFullYear(),
    // Absender für den Briefkopf der Rechnung/Abrechnung (frei änderbar)
    absenderName:(c.absenderName!=null?c.absenderName:'Verein der Gartenfreunde e.V. von 1946 Kronshagen'),
    absenderZusatz:(c.absenderZusatz!=null?c.absenderZusatz:'z.Hd. Moritz Kriese'),
    absenderStrasse:(c.absenderStrasse!=null?c.absenderStrasse:'Hansastraße 62'),
    absenderOrt:(c.absenderOrt!=null?c.absenderOrt:'24118 Kiel'),
    posten:po
  };
}
function curYear(){ return new Date().getFullYear(); }
function rateDE(n){ return Number(n).toFixed(3).replace(/0+$/,'').replace(/[.,]$/,'').replace('.',',')+' €'; }
// Beitrags-Zusammenstellung eines Mitglieds aus den einzelnen Posten.
// Liefert {gruppe:'pflicht'|'sonder'|'extra', label, detail, amount}.
// Auswählbare Posten (Reihenfolge = Anzeige). Standard: alle berechnet;
// abgewählte Schlüssel liegen in m.postenAus (z. B. bei Familienmitgliedern).
const BEITRAG_POSTEN=[
  ['pacht','Pacht'],['jahresbeitrag','Jahresbeitrag'],['gemeinschaft','Gemeinschaftsarbeit'],
  ['wasserverlust','Wasserverlust'],['pauschaleWasser','Pauschale Wasserversorgung'],
  ['versicherung','Versicherungsgebühr'],['wasserzaehler','Wasserzählergebühr'],
  ['wasserverbrauch','Wasserverbrauch'],['pforte','Pforte nicht geöffnet'],['frost','Frostschaden Wasseruhr']
];
// Posten, die ein „Familienmitglied" typischerweise NICHT zahlt (Garten/Wasser)
const FAMILIE_AUS=['pacht','wasserverlust','pauschaleWasser','wasserzaehler','wasserverbrauch','pforte','frost'];
function postAktiv(m,key){ const aus=Array.isArray(m.postenAus)?m.postenAus:[]; return !aus.includes(key); }
function beitragPosten(m){
  const P=sepaCfg().posten; const out=[];
  const fl=num(m.flaeche,0);
  if(postAktiv(m,'pacht') && fl>0) out.push({gruppe:'pflicht', key:'pacht', label:'Pacht', detail:`${String(fl).replace('.',',')} m² × ${rateDE(P.pachtProM2)}`, amount:fl*P.pachtProM2});
  if(postAktiv(m,'jahresbeitrag')) out.push({gruppe:'pflicht', key:'jahresbeitrag', label:'Jahresbeitrag', detail:'', amount:P.jahresbeitrag});
  if(postAktiv(m,'gemeinschaft') && !m.gemeinschaftGeleistet) out.push({gruppe:'pflicht', key:'gemeinschaft', label:'Gemeinschaftsarbeit', detail:'', amount:P.gemeinschaft});
  if(postAktiv(m,'wasserverlust')) out.push({gruppe:'sonder', key:'wasserverlust', label:'Wasserverlust', detail:'', amount:P.wasserverlust});
  if(postAktiv(m,'pauschaleWasser')) out.push({gruppe:'sonder', key:'pauschaleWasser', label:'Pauschale Erneuerung der Wasserversorgung', detail:'', amount:P.pauschaleWasser});
  if(postAktiv(m,'versicherung')) out.push({gruppe:'sonder', key:'versicherung', label:'Versicherungsgebühr', detail:'', amount:P.versicherung});
  if(postAktiv(m,'wasserzaehler')) out.push({gruppe:'sonder', key:'wasserzaehler', label:'Wasserzählergebühr', detail:'', amount:P.wasserzaehler});
  const wv=num(m.wasserverbrauch,0);
  if(postAktiv(m,'wasserverbrauch') && wv>0 && P.wasserpreis>0) out.push({gruppe:'extra', key:'wasserverbrauch', label:'Wasserverbrauch', detail:`${String(wv).replace('.',',')} m³ × ${rateDE(P.wasserpreis)}`, amount:wv*P.wasserpreis});
  const pf=num(m.pforteCount,0);
  if(postAktiv(m,'pforte') && pf>0) out.push({gruppe:'extra', key:'pforte', label:'Pforte nicht geöffnet', detail:`${pf} × ${moneyDE(P.pforteGebuehr)}`, amount:pf*P.pforteGebuehr});
  const fr=num(m.frostCount,0);
  if(postAktiv(m,'frost') && fr>0) out.push({gruppe:'extra', key:'frost', label:'Ersetzte Wasseruhr (Frostschaden)', detail:`${fr} × ${moneyDE(P.frostGebuehr)}`, amount:fr*P.frostGebuehr});
  return out;
}
function memberBeitrag(m){ return Math.round(beitragPosten(m).reduce((s,p)=>s+(p.amount||0),0)*100)/100; }
function beitragTableHtml(m){
  const items=beitragPosten(m);
  const rows=items.map(p=>`<div class="bt-row"><span>${esc(p.label)}${p.detail?` <span class="muted" style="font-size:11px">${esc(p.detail)}</span>`:''}</span><span class="bt-amt">${moneyDE(p.amount)}</span></div>`).join('');
  return `${rows}<div class="bt-row bt-sum"><span>Gesamtbeitrag</span><span class="bt-amt">${moneyDE(memberBeitrag(m))}</span></div>`;
}
function beitragPrevHtml(m){ return `<div class="bt-title">Beitrag ${esc(sepaCfg().beitragsjahr)}</div>${beitragTableHtml(m)}`; }
// Werte aus dem geöffneten Mitglieds-Formular (für Live-Vorschau)
function formPostenAus(){
  const boxes=Array.from(document.querySelectorAll('.m-post'));
  if(!boxes.length) return null;  // Abschnitt nicht gerendert → nicht überschreiben
  return boxes.filter(cb=>!cb.checked).map(cb=>cb.value);
}
function formBeitragVals(){ return {
  flaeche:val('m-flaeche'), wasserverbrauch:val('m-wasser'),
  gemeinschaftGeleistet:!!($('m-gemein')&&$('m-gemein').checked),
  pforteCount:val('m-pforte'), frostCount:val('m-frost'),
  postenAus: formPostenAus()||[]
}; }
function beitragPrev(){ const box=$('m-beitrag-prev'); if(box) box.innerHTML=beitragPrevHtml(formBeitragVals()); }
function faelligDate(){ const c=sepaCfg(); if(c.faelligkeit) return c.faelligkeit; return curYear()+'-12-31'; }
// Überfällig: aktives Mitglied, für das laufende Jahr nicht als bezahlt markiert, Fälligkeit überschritten
function isOverdue(m){ if(!isAktiv(m)) return false; if(m.bezahltJahr===curYear()) return false; const f=faelligDate(); const today=new Date().toISOString().slice(0,10); return today>=f; }
function money(n){ return (Math.round(Number(n)*100)/100).toFixed(2); }
function moneyDE(n){ return money(n).replace('.',',')+' €'; }

function viewBeitraege(){
  const c=sepaCfg();
  const all=members();
  const sepaMembers=all.filter(m=>isAktiv(m)&&m.sepaAktiv&&String(m.iban||'').trim());
  const sepaSum=sepaMembers.reduce((s,m)=>s+memberBeitrag(m),0);
  const overdue=all.filter(isOverdue).sort((a,b)=>(b.mahnStufe||0)-(a.mahnStufe||0)||String(a.name||'').localeCompare(String(b.name||''),'de'));
  const cfgOk = c.glaeubigerId && c.vereinName && c.iban;
  // — Zugriff: Rechnungsführer —
  const rf=rechnungsfuehrer();
  const rfBox=`<div class="sec">
    <h2><span>🔒 Rechnungsführer</span></h2>
    <div class="dt"><div class="dt-l">Rechnungsführer</div><div class="dt-v">${rf?esc(rf):'<span class="muted">– noch nicht festgelegt –</span>'}</div></div>
    ${canManageRf()
      ? `<div class="muted" style="margin:8px 0">Trage die Login-E-Mail des Rechnungsführers ein. Nur er kann die <b>Stammeinstellungen</b> (Gläubiger-ID, Bankdaten, Beitragssätze) ändern und die <b>SEPA-Lastschrift-Datei</b> erzeugen. Rechnungen, Mahnwesen und SEPA-Eingaben am Mitglied stehen allen offen. Der Wechsel kann später nur vom aktuellen Rechnungsführer vorgenommen werden.</div>
         <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
           <div class="field" style="flex:2;min-width:220px"><label>E-Mail des Rechnungsführers</label><input id="cfg-rf" type="email" value="${esc(rf)}" placeholder="kassenwart@beispiel.de"></div>
           <button class="btn primary" onclick="GV.saveRechnungsfuehrer()">Festlegen</button>
           ${rf?`<button class="btn" onclick="GV.clearRechnungsfuehrer()">Freigeben (alle)</button>`:''}
         </div>`
      : `<div class="muted">Nur der aktuelle Rechnungsführer kann den Zugriff ändern.</div>`}
  </div>`;
  // — Einstellungen —
  const P=c.posten;
  const posF=(id,label,v,step)=>`<div class="field" style="flex:1;min-width:150px"><label>${label}</label><input id="${id}" type="number" step="${step||'0.01'}" min="0" value="${esc(v)}"></div>`;
  const settings=`<div class="sec">
    <h2><span>⚙️ Einstellungen Beitrag &amp; SEPA</span></h2>
    <div class="muted" style="margin-bottom:10px">Alle Posten sind frei änderbar (sie ändern sich jährlich). Sie gelten für das angegebene Beitragsjahr und werden für die Beitrags-Berechnung, den SEPA-Export und das Mahnwesen verwendet.</div>

    <div class="sec-head">🏦 SEPA / Gläubiger</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="field" style="flex:2;min-width:200px"><label>Gläubiger-ID *</label><input id="cfg-glid" value="${esc(c.glaeubigerId)}" placeholder="DE98ZZZ09999999999"></div>
      <div class="field" style="flex:1;min-width:120px"><label>Beitragsjahr</label><input id="cfg-jahr" type="number" step="1" value="${esc(c.beitragsjahr)}"></div>
    </div>
    <div class="field"><label>Vereinsname (Gläubiger) *</label><input id="cfg-name" value="${esc(c.vereinName)}" placeholder="Verein der Gartenfreunde Kronshagen e.V. von 1946"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="field" style="flex:2;min-width:200px"><label>Vereins-IBAN *</label><input id="cfg-iban" value="${esc(c.iban)}" placeholder="DE.."></div>
      <div class="field" style="flex:1;min-width:110px"><label>Vereins-BIC</label><input id="cfg-bic" value="${esc(c.bic)}"></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="field" style="flex:1;min-width:150px"><label>Fälligkeit / Einzugsdatum</label><input id="cfg-faellig" type="date" value="${esc(c.faelligkeit)}"></div>
      <div class="field" style="flex:2;min-width:180px"><label>Verwendungszweck</label><input id="cfg-zweck" value="${esc(c.verwendung)}" placeholder="Mitgliedsbeitrag"></div>
    </div>

    <div class="sec-head" style="margin-top:14px">✉️ Absender (Briefkopf der Rechnung)</div>
    <div class="field"><label>Absender – Name</label><input id="cfg-abs-name" value="${esc(c.absenderName)}"></div>
    <div class="field"><label>Zusatz (z. B. z.Hd.)</label><input id="cfg-abs-zusatz" value="${esc(c.absenderZusatz)}"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="field" style="flex:2;min-width:160px"><label>Straße</label><input id="cfg-abs-str" value="${esc(c.absenderStrasse)}"></div>
      <div class="field" style="flex:1;min-width:140px"><label>PLZ / Ort</label><input id="cfg-abs-ort" value="${esc(c.absenderOrt)}"></div>
    </div>

    <div class="sec-head" style="margin-top:14px">💶 Beitrags-Posten (${esc(c.beitragsjahr)})</div>
    <div class="muted" style="margin-bottom:6px">Pflichtbeiträge</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${posF('cfg-pacht','Pacht pro m² €',P.pachtProM2,'0.001')}
      ${posF('cfg-jahr-betrag','Jahresbeitrag €',P.jahresbeitrag)}
      ${posF('cfg-gemein','Gemeinschaftsarbeit €',P.gemeinschaft)}
    </div>
    <div class="muted" style="margin:8px 0 6px">Sonderzahlung (pro Mitglied)</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${posF('cfg-wverlust','Wasserverlust €',P.wasserverlust)}
      ${posF('cfg-wpausch','Pauschale Wasserversorgung €',P.pauschaleWasser)}
      ${posF('cfg-versich','Versicherungsgebühr €',P.versicherung)}
      ${posF('cfg-wzaehler','Wasserzählergebühr €',P.wasserzaehler)}
    </div>
    <div class="muted" style="margin:8px 0 6px">Variable Gebühren (nach Verbrauch / Anzahl)</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${posF('cfg-wpreis','Wasserpreis pro m³ €',P.wasserpreis)}
      ${posF('cfg-pforte','Pforte nicht geöffnet € / Termin',P.pforteGebuehr)}
      ${posF('cfg-frost','Frostschaden Wasseruhr € / Stück',P.frostGebuehr)}
    </div>

    <div class="actions-row"><button class="btn primary" onclick="GV.saveSepaCfg()">Einstellungen speichern</button></div>
  </div>`;
  // — SEPA-Export —
  const sepaSec=`<div class="sec" style="margin-top:16px">
    <h2><span>🏦 SEPA-Lastschrift-Export</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" ${(!sepaMembers.length)?'disabled style="opacity:.5;cursor:not-allowed"':''} onclick="GV.exportLastschriftenXlsx()">📊 Übersicht als Excel</button>
        <button class="btn primary" ${(!cfgOk||!sepaMembers.length)?'disabled style="opacity:.5;cursor:not-allowed"':''} onclick="GV.exportSepa()">⬇️ SEPA-XML (für Bank)</button>
      </span>
    </h2>
    ${!cfgOk?`<div class="muted" style="color:#c0392b">Bitte zuerst Gläubiger-ID, Vereinsname und Vereins-IBAN in den Einstellungen ausfüllen.</div>`:''}
    <div class="muted" style="margin-bottom:8px">Exportiert werden alle aktiven Mitglieder mit erteiltem Lastschriftmandat und hinterlegter IBAN. Die <b>SEPA-XML</b> lädst du im Online-Banking hoch (öffnet sich nicht in Excel). Die <b>Excel-Übersicht</b> ist zum Anschauen/Prüfen.</div>
    <div class="dt"><div class="dt-l">Lastschriften</div><div class="dt-v">${sepaMembers.length} Mitglied${sepaMembers.length===1?'':'er'} · Summe ${moneyDE(sepaSum)}</div></div>
    ${sepaMembers.length?`<div class="links" style="margin-top:8px">${sepaMembers.map(m=>`<span class="chip" title="${esc(m.iban)}">${esc(m.name)} – ${moneyDE(memberBeitrag(m))}</span>`).join('')}</div>`:'<div class="muted">Keine Mitglieder mit gültigem Mandat &amp; IBAN.</div>'}
  </div>`;
  // — Mahnwesen —
  const mahnRows=overdue.map(m=>{ const st=m.mahnStufe||0;
    const stTxt=st===0?'<span class="chip">offen</span>':`<span class="chip" style="background:#fdecea;border-color:#f0bcb6;color:#c0392b">Mahnstufe ${st}</span>`;
    const dat=m.mahnDatum?`<span class="muted" style="font-size:12px"> · zuletzt ${fmtDateShort(m.mahnDatum)}</span>`:'';
    const hasMail=String(m.email||'').trim();
    return `<div class="card">
      <h3>${esc(m.name||'(ohne Name)')} <span style="font-weight:600;color:var(--muted);font-size:13px">– ${moneyDE(memberBeitrag(m))}</span></h3>
      <div class="sub">${stTxt}${dat}</div>
      <div class="actions" style="margin-top:8px;flex-wrap:wrap">
        <button class="btn" ${hasMail?'':'disabled style="opacity:.5"'} title="${hasMail?'':'Keine E-Mail hinterlegt'}" onclick="GV.mahnMail('${m.id}',1)">✉️ Stufe 1: Erinnerung</button>
        <button class="btn" ${hasMail?'':'disabled style="opacity:.5"'} onclick="GV.mahnMail('${m.id}',2)">✉️ Stufe 2: 1. Mahnung</button>
        <button class="btn" onclick="GV.mahnPdf('${m.id}')">🖨️ Stufe 3: Letzte Mahnung (PDF)</button>
        <button class="btn primary" onclick="GV.markBezahlt('${m.id}')">✓ Bezahlt</button>
        ${st?`<button class="x" title="Mahnstufe zurücksetzen" onclick="GV.resetMahn('${m.id}')">↺</button>`:''}
      </div>
    </div>`;
  }).join('') || `<div class="muted">🎉 Keine überfälligen Beiträge. Alle aktiven Mitglieder sind für ${curYear()} bezahlt.</div>`;
  const mahnSec=`<div class="sec" style="margin-top:16px">
    <h2><span>⏰ Mahnwesen (${overdue.length})</span></h2>
    <div class="muted" style="margin-bottom:10px">Überfällig = aktives Mitglied ohne Zahlungseingang ${curYear()} nach Fälligkeit (${fmtDateShort(faelligDate())}). „Bezahlt" markiert den Beitrag ${curYear()} als beglichen und entfernt das Mitglied aus der Liste.</div>
    <div class="list">${mahnRows}</div>
  </div>`;
  // — Rechnungen / Beiträge (für alle) —
  const aktive=all.filter(isAktiv).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'}));
  const totalSoll=aktive.reduce((s,m)=>s+memberBeitrag(m),0);
  const rRows=aktive.map(m=>{ const paid=m.bezahltJahr===curYear();
    return `<div class="card">
      <h3 style="cursor:pointer" onclick="GV.openMember('${m.id}')">${esc(m.name||'(ohne Name)')} <span style="font-weight:600;color:var(--muted);font-size:13px">– ${moneyDE(memberBeitrag(m))}</span></h3>
      <div class="sub">${paid?`<span class="chip cur">✓ bezahlt ${curYear()}</span>`:'<span class="chip">offen</span>'}</div>
      <div class="actions" style="margin-top:8px;flex-wrap:wrap">
        <button class="btn primary" onclick="GV.beitragPdf('${m.id}')">🧾 Rechnung erstellen</button>
        ${paid?'':`<button class="btn" onclick="GV.markBezahlt('${m.id}')">✓ Bezahlt</button>`}
      </div>
    </div>`;
  }).join('') || '<div class="muted">Keine aktiven Mitglieder.</div>';
  const rechnungSec=`<div class="sec" style="margin-top:16px">
    <h2><span>🧾 Rechnungen / Beiträge ${esc(c.beitragsjahr)} (${aktive.length})</span></h2>
    <div class="muted" style="margin-bottom:10px">Beitrags-Soll gesamt: <b>${moneyDE(totalSoll)}</b>. „Rechnung erstellen" öffnet die druckbare Beitragsabrechnung mit allen Posten – für jedes Mitglied einzeln.</div>
    <div class="list">${rRows}</div>
  </div>`;
  // Stammeinstellungen + Lastschrift-Erzeugung nur für den Rechnungsführer;
  // Rechnungen, Mahnwesen und SEPA-Eingaben am Mitglied sind für alle offen.
  const finSecs = canSeeFinance() ? (settings + sepaSec)
    : `<div class="sec" style="margin-top:16px"><div class="muted">Stammeinstellungen (Gläubiger-ID, Bankdaten, Beitragssätze) und die Erzeugung der SEPA-Lastschrift-Datei sind dem Rechnungsführer vorbehalten.</div></div>`;
  return rfBox + finSecs + rechnungSec + mahnSec;
}
function saveRechnungsfuehrer(){
  if(!canManageRf()){ toast('Nur der aktuelle Rechnungsführer darf das ändern.','err'); return; }
  const email=val('cfg-rf').toLowerCase().trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Bitte eine gültige E-Mail eingeben.','err'); return; }
  saveMeta({rechnungsfuehrer:email});
  render();
  toast(email===myEmail()?'Du bist jetzt der Rechnungsführer ✓':'Rechnungsführer festgelegt ✓','ok');
}
function clearRechnungsfuehrer(){
  if(!canManageRf()){ toast('Nur der aktuelle Rechnungsführer darf das ändern.','err'); return; }
  if(!confirm('Zugriff auf die Finanzdaten für ALLE freigeben (kein fester Rechnungsführer mehr)?')) return;
  saveMeta({rechnungsfuehrer:''});
  render(); toast('Finanzdaten-Zugriff freigegeben.','');
}
function saveSepaCfg(){
  const cfg={ glaeubigerId:val('cfg-glid').trim(), vereinName:val('cfg-name').trim(),
    iban:val('cfg-iban').replace(/\s+/g,''), bic:val('cfg-bic').replace(/\s+/g,'').toUpperCase(),
    faelligkeit:val('cfg-faellig'), verwendung:val('cfg-zweck').trim()||'Mitgliedsbeitrag',
    beitragsjahr:(val('cfg-jahr')!==''?parseInt(val('cfg-jahr'),10):curYear()),
    absenderName:val('cfg-abs-name'), absenderZusatz:val('cfg-abs-zusatz'),
    absenderStrasse:val('cfg-abs-str'), absenderOrt:val('cfg-abs-ort'),
    posten:{
      pachtProM2:num(val('cfg-pacht'),POSTEN_DEF.pachtProM2),
      jahresbeitrag:num(val('cfg-jahr-betrag'),POSTEN_DEF.jahresbeitrag),
      gemeinschaft:num(val('cfg-gemein'),POSTEN_DEF.gemeinschaft),
      wasserverlust:num(val('cfg-wverlust'),POSTEN_DEF.wasserverlust),
      pauschaleWasser:num(val('cfg-wpausch'),POSTEN_DEF.pauschaleWasser),
      versicherung:num(val('cfg-versich'),POSTEN_DEF.versicherung),
      wasserzaehler:num(val('cfg-wzaehler'),POSTEN_DEF.wasserzaehler),
      wasserpreis:num(val('cfg-wpreis'),POSTEN_DEF.wasserpreis),
      pforteGebuehr:num(val('cfg-pforte'),POSTEN_DEF.pforteGebuehr),
      frostGebuehr:num(val('cfg-frost'),POSTEN_DEF.frostGebuehr)
    } };
  saveMeta({sepaCfg:cfg}); render(); toast('Einstellungen gespeichert ✓','ok');
}
// — SEPA pain.008.001.02 —
function xmlEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function sepaName(s){ return xmlEsc(String(s||'').replace(/[^A-Za-z0-9 ÄÖÜäöüß\.,\-\/]/g,' ').trim().slice(0,70)); }
function exportSepa(){
  const c=sepaCfg();
  if(!c.glaeubigerId||!c.vereinName||!c.iban){ toast('Bitte Einstellungen vollständig ausfüllen.','err'); return; }
  const list=members().filter(m=>isAktiv(m)&&m.sepaAktiv&&String(m.iban||'').trim());
  if(!list.length){ toast('Keine Mitglieder mit Mandat & IBAN.','err'); return; }
  const now=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const creDtTm=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const colltnDt=faelligDate();
  const msgId=('VDG-'+now.getTime()).slice(0,35);
  const sum=list.reduce((s,m)=>s+memberBeitrag(m),0);
  const ctrl=money(sum);
  const zweck=c.verwendung+' '+c.beitragsjahr;
  const tx=list.map((m,i)=>{
    const amt=money(memberBeitrag(m));
    const e2e=('VDG-'+c.beitragsjahr+'-'+(i+1)).slice(0,35);
    const mref=String(m.mandatsref||m.id||('M'+(i+1))).slice(0,35);
    const mdat=m.mandatsdatum||m.eintrittsdatum||c.faelligkeit||creDtTm.slice(0,10);
    const bic=String(m.bic||'').replace(/\s+/g,'').toUpperCase();
    const dbtrAgt = bic
      ? `<DbtrAgt><FinInstnId><BIC>${xmlEsc(bic)}</BIC></FinInstnId></DbtrAgt>`
      : `<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>`;
    return `      <DrctDbtTxInf>
        <PmtId><EndToEndId>${xmlEsc(e2e)}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${amt}</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>${xmlEsc(mref)}</MndtId><DtOfSgntr>${xmlEsc(mdat)}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        ${dbtrAgt}
        <Dbtr><Nm>${sepaName(m.kontoinhaber||m.name)}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${xmlEsc(String(m.iban).replace(/\s+/g,'').toUpperCase())}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${sepaName(zweck)}</Ustrd></RmtInf>
      </DrctDbtTxInf>`;
  }).join('\n');
  const cdtrBic = c.bic ? `<CdtrAgt><FinInstnId><BIC>${xmlEsc(c.bic)}</BIC></FinInstnId></CdtrAgt>` : `<CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>`;
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${xmlEsc(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${list.length}</NbOfTxs>
      <CtrlSum>${ctrl}</CtrlSum>
      <InitgPty><Nm>${sepaName(c.vereinName)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xmlEsc(msgId)}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${list.length}</NbOfTxs>
      <CtrlSum>${ctrl}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>
      <ReqdColltnDt>${xmlEsc(colltnDt)}</ReqdColltnDt>
      <Cdtr><Nm>${sepaName(c.vereinName)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${xmlEsc(String(c.iban).replace(/\s+/g,'').toUpperCase())}</IBAN></Id></CdtrAcct>
      ${cdtrBic}
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${xmlEsc(c.glaeubigerId)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
${tx}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>`;
  const blob=new Blob([xml],{type:'application/xml'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=`SEPA-Lastschrift-${curYear()}.xml`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast(`SEPA-XML mit ${list.length} Lastschriften erzeugt ✓`,'ok');
}
// — Mahnwesen —
const MAHN_TXT={
  1:{betreff:'Zahlungserinnerung Mitgliedsbeitrag',gruss:'Zahlungserinnerung',einl:'wir möchten Sie freundlich daran erinnern, dass der Mitgliedsbeitrag für das laufende Jahr noch offen ist.'},
  2:{betreff:'1. Mahnung – Mitgliedsbeitrag',gruss:'1. Mahnung',einl:'trotz unserer Erinnerung konnten wir bisher keinen Zahlungseingang für den Mitgliedsbeitrag feststellen. Wir bitten Sie, den offenen Betrag zeitnah zu begleichen.'},
  3:{betreff:'Letzte Mahnung – Mitgliedsbeitrag',gruss:'Letzte Mahnung',einl:'leider ist der Mitgliedsbeitrag trotz mehrfacher Aufforderung weiterhin offen. Dies ist die letzte Mahnung, bevor weitere Schritte eingeleitet werden.'}
};
function mahnBody(m,stufe){ const c=sepaCfg(); const t=MAHN_TXT[stufe];
  const betrag=moneyDE(memberBeitrag(m));
  return `Sehr geehrte/r ${m.name||'Mitglied'},\n\n${t.einl}\n\nOffener Betrag: ${betrag} (${c.verwendung} ${curYear()})\nFällig seit: ${fmtDateShort(faelligDate())}\n\nBitte überweisen Sie den Betrag auf folgendes Konto:\n${c.vereinName}\nIBAN: ${c.iban}${c.bic?'\nBIC: '+c.bic:''}\nVerwendungszweck: ${c.verwendung} ${curYear()} – ${m.name||''}\n\nSollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben als gegenstandslos.\n\nMit freundlichen Grüßen\n${c.vereinName}`;
}
function setMahn(id,stufe){ const m=_cache.mitglieder[id]; if(!m) return; const rec=Object.assign({},m,{mahnStufe:stufe, mahnDatum:new Date().toISOString().slice(0,10)}); saveMember(rec); }
function mahnMail(id,stufe){ const m=_cache.mitglieder[id]; if(!m) return;
  if(!String(m.email||'').trim()){ toast('Keine E-Mail hinterlegt.','err'); return; }
  const t=MAHN_TXT[stufe];
  const href=`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(t.betreff)}&body=${encodeURIComponent(mahnBody(m,stufe))}`;
  window.location.href=href;
  setMahn(id,stufe); render(); toast(`${t.gruss} an ${m.name} – Versanddatum gesetzt ✓`,'ok');
}
function mahnPdf(id){ const m=_cache.mitglieder[id]; if(!m) return; const c=sepaCfg();
  const betrag=moneyDE(memberBeitrag(m));
  const heute=fmtDateShort(new Date().toISOString().slice(0,10));
  const body=mahnBody(m,3).replace(/\n/g,'<br>');
  const html=`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Letzte Mahnung – ${esc(m.name||'')}</title>
   <style>body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.5}
   .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2f9e3f;padding-bottom:8px;margin-bottom:30px}
   .head h1{color:#2f9e3f;font-size:20px;margin:0}.addr{margin:24px 0;white-space:pre-line}
   .stufe{display:inline-block;background:#fdecea;color:#c0392b;border:1px solid #f0bcb6;border-radius:6px;padding:3px 10px;font-weight:700;font-size:13px;margin-bottom:18px}
   .betrag{font-size:18px;font-weight:700;margin:18px 0}
   @media print{body{margin:0}.noprint{display:none}}</style></head>
   <body>
    <div class="head"><h1>${esc(c.vereinName||'Verein der Gartenfreunde')}</h1><div style="text-align:right;font-size:13px;color:#555">${esc(heute)}</div></div>
    <div class="addr">${esc(m.name||'')}${m.adresse?'\n'+esc(m.adresse):''}</div>
    <div class="stufe">⏰ Letzte Mahnung – Mahnstufe 3</div>
    <h2 style="font-size:16px">Mitgliedsbeitrag ${curYear()}</h2>
    <p>${body}</p>
    <div class="betrag">Offener Betrag: ${esc(betrag)}</div>
    <div class="noprint" style="margin-top:30px"><button onclick="window.print()" style="padding:10px 18px;font-size:15px;background:#2f9e3f;color:#fff;border:0;border-radius:8px;cursor:pointer">🖨️ Drucken / als PDF speichern</button></div>
   </body></html>`;
  const w=window.open('','_blank'); if(!w){ toast('Bitte Popups erlauben.','err'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  setMahn(id,3); render(); toast(`Letzte Mahnung für ${m.name} erstellt – Versanddatum gesetzt ✓`,'ok');
}
function markBezahlt(id){ const m=_cache.mitglieder[id]; if(!m) return;
  const rec=Object.assign({},m,{bezahltJahr:curYear(), mahnStufe:0}); delete rec.mahnDatum;
  saveMember(rec); render(); toast(`${m.name}: Beitrag ${curYear()} als bezahlt markiert ✓`,'ok');
}
function resetMahn(id){ const m=_cache.mitglieder[id]; if(!m) return;
  const rec=Object.assign({},m,{mahnStufe:0}); delete rec.mahnDatum;
  saveMember(rec); render(); toast('Mahnstufe zurückgesetzt.',''); }

// — Beitragsabrechnung (druckbare Zusammenstellung der Posten) —
function beitragPdf(id){ const m=_cache.mitglieder[id]; if(!m) return; const c=sepaCfg();
  const items=beitragPosten(m);
  const grp=g=>items.filter(p=>p.gruppe===g);
  const sumOf=arr=>arr.reduce((s,p)=>s+(p.amount||0),0);
  const rowHtml=p=>`<tr><td>${esc(p.label)}${p.detail?` <span class="det">${esc(p.detail)}</span>`:''}</td><td class="amt">${esc(moneyDE(p.amount))}</td></tr>`;
  const pflicht=grp('pflicht'), sonder=grp('sonder'), extra=grp('extra');
  const heute=fmtDateShort(new Date().toISOString().slice(0,10));
  const ortName=String(c.absenderOrt||'').replace(/^\d+\s*/,'')||'';
  const absLine=String(c.absenderName||'Verein der Gartenfreunde e.V. von 1946 Kronshagen').trim();
  const absUnten=[c.absenderZusatz,c.absenderStrasse,c.absenderOrt].map(x=>esc(String(x||'').trim())).filter(Boolean).join('<br>');
  const html=`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Rechnung Mitgliedsbeitrag ${esc(c.beitragsjahr)} – ${esc(m.name||'')}</title>
   <style>body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.5}
   .bk{text-align:right;margin-bottom:30px}
   .bk .vn{color:#2f9e3f;font-weight:700;font-size:15px}
   .bk .va{font-size:12px;color:#444;line-height:1.45}
   .abs-klein{font-size:10px;color:#666;border-bottom:.5px solid #999;padding-bottom:2px;margin-bottom:3px}
   .abs-zhd{font-size:12px;color:#333;line-height:1.45;margin-bottom:24px}
   .empf{font-size:14px;line-height:1.55;white-space:pre-line;margin-bottom:24px}
   .datum{text-align:right;font-size:13px;margin-bottom:20px}
   .betreff{font-weight:700;font-size:15px;margin-bottom:14px}
   p{margin:10px 0}
   h2{font-size:15px;margin:22px 0 6px}
   table{width:100%;border-collapse:collapse}td{padding:4px 0;border-bottom:1px solid #eee;vertical-align:top}
   td.amt{text-align:right;white-space:nowrap;width:120px}.det{color:#777;font-size:12px}
   tr.sub td{font-weight:700;border-top:1px solid #ccc;border-bottom:none}
   tr.total td{font-weight:700;font-size:17px;color:#2f9e3f;border-top:2px solid #2f9e3f;border-bottom:none;padding-top:8px}
   .note{margin-top:22px;font-size:12px;color:#555;border-top:1px solid #eee;padding-top:10px}
   @media print{body{margin:0}.noprint{display:none}}</style></head>
   <body>
    <div class="bk"><div class="vn">${esc(c.absenderName||'Verein der Gartenfreunde e.V. von 1946 Kronshagen')}</div>
      <div class="va">${[c.absenderZusatz,c.absenderStrasse,c.absenderOrt].map(x=>esc(String(x||'').trim())).filter(Boolean).join('<br>')}</div></div>
    <div class="abs-klein">${esc(absLine)}</div>
    ${absUnten?`<div class="abs-zhd">${absUnten}</div>`:''}
    <div class="empf">${esc(m.name||'')}${m.adresse?'\n'+esc(m.adresse):''}</div>
    <div class="datum">${esc(ortName?ortName+', den ':'')}${esc(heute)}</div>
    <div class="betreff">Rechnung Mitgliedsbeitrag ${esc(c.beitragsjahr)}</div>
    <p>Sehr geehrte/r ${esc(m.name||'Gartenfreund/in')},</p>
    <p>wie vereinbart erhalten Sie Ihre Rechnung für den Jahresbeitrag ${esc(c.beitragsjahr)}. Bitte prüfen Sie die Rechnung – sollten Sie Anmerkungen oder Fragen haben, melden Sie sich bitte.</p>
    <h2>Aufstellung Jahresbeitrag ${esc(c.beitragsjahr)}</h2>
    <table>${pflicht.map(rowHtml).join('')}</table>
    <h2>Sonderzahlung</h2>
    <table>${sonder.map(rowHtml).join('')}<tr class="sub"><td>Summe der Sonderzahlung</td><td class="amt">${esc(moneyDE(sumOf(sonder)))}</td></tr></table>
    ${extra.length?`<h2>Weitere Gebühren</h2><table>${extra.map(rowHtml).join('')}</table>`:''}
    <table style="margin-top:14px"><tr class="total"><td>Gesamtbeitrag ${esc(c.beitragsjahr)}</td><td class="amt">${esc(moneyDE(memberBeitrag(m)))}</td></tr></table>
    ${(m.sepaAktiv&&m.iban)?`<div class="note">Der Betrag wird per SEPA-Lastschrift von Ihrem Konto (IBAN ${esc(m.iban)}) eingezogen${c.faelligkeit?' zum '+fmtDateShort(c.faelligkeit):''}.</div>`:`<div class="note">Bitte überweisen Sie den Gesamtbetrag${c.faelligkeit?' bis zum '+fmtDateShort(c.faelligkeit):''} auf das Vereinskonto${c.iban?' (IBAN '+esc(c.iban)+')':''}. Verwendungszweck: ${esc(c.verwendung)} ${esc(c.beitragsjahr)} – ${esc(m.name||'')}.</div>`}
    <div class="note">Hinweis: Gartenfreunde, die ihre Gartenpforten zum Aus-/Einbau der Wasserzähler nicht geöffnet hatten, zahlen je angekündigtem Termin ${esc(moneyDE(c.posten.pforteGebuehr))} für die Extraleistung des Wasserwarts. Für jede infolge eines Frostschadens ersetzte Wasseruhr werden ${esc(moneyDE(c.posten.frostGebuehr))} berechnet. Hinzu kommt der tatsächliche Wasserverbrauch.</div>
    <p style="margin-top:26px">Viele liebe Grüße<br>${esc(c.absenderName||'')}</p>
    <div class="noprint" style="margin-top:26px"><button onclick="window.print()" style="padding:10px 18px;font-size:15px;background:#2f9e3f;color:#fff;border:0;border-radius:8px;cursor:pointer">🖨️ Drucken / als PDF speichern</button></div>
   </body></html>`;
  const w=window.open('','_blank'); if(!w){ toast('Bitte Popups erlauben.','err'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// ══════════════════════════════════════════════════════════════════
//  Mitglieder & Bankdaten: Excel-Import / -Export
// ══════════════════════════════════════════════════════════════════
let _xlsxP=null;
function loadXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(_xlsxP) return _xlsxP;
  _xlsxP=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=()=>res(window.XLSX);
    s.onerror=()=>{ _xlsxP=null; rej(new Error('Excel-Bibliothek konnte nicht geladen werden (Internet nötig).')); };
    document.head.appendChild(s);
  });
  return _xlsxP;
}
function xlBool(v){ return ['ja','wahr','true','1','x','yes','y'].includes(String(v==null?'':v).toLowerCase().trim()); }
function xlDate(v){
  if(v==null||v==='') return '';
  if(typeof v==='number'){ const d=new Date(Math.round((v-25569)*86400*1000)); if(!isNaN(d)) return d.toISOString().slice(0,10); }
  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
  m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); if(m) return m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0');
  return s;
}
function normIban(v){ return String(v==null?'':v).replace(/\s+/g,'').toUpperCase(); }
const MEMBER_COLS=['mitgliednr','id','name','status','email','tel','adresse','eintrittsdatum',
  'kontoinhaber','iban','bic','mandatsref','mandatsdatum','sepaAktiv',
  'flaeche','wasserverbrauch','gemeinschaftGeleistet','pforteCount','frostCount',
  'note','parzellen','aemter','bezahltJahr','mahnStufe','mahnDatum'];
// Mitgliednummer aus einer importierten Zeile lesen (diverse Spaltennamen der Bank-CSV)
function rowMitgliednr(row){
  for(const k of Object.keys(row)){ if(/mitglied.?(s)?.?(nr|nummer)|^mgnr$|^mitgl\.?\s*nr\.?$/i.test(k)){ const v=String(row[k]||'').trim(); if(v) return v; } }
  if(row.mitgliednr!=null && String(row.mitgliednr).trim()) return String(row.mitgliednr).trim();
  return '';
}
// Erste nicht-leere Zelle, deren Spaltenüberschrift zum Muster passt (tolerant ggü. Bank-CSV-Namen)
function rowGet(row, re){ for(const k of Object.keys(row)){ if(re.test(k)){ const v=String(row[k]==null?'':row[k]).trim(); if(v!=='') return v; } } return ''; }
function memberToRow(m){
  const row={};
  MEMBER_COLS.forEach(k=>{
    let v;
    if(k==='sepaAktiv'||k==='gemeinschaftGeleistet') v=m[k]?'ja':'nein';
    else if(k==='parzellen'||k==='aemter') v=Array.isArray(m[k])&&m[k].length?JSON.stringify(m[k]):'';
    else v=(m[k]!=null?m[k]:'');
    row[k]=v;
  });
  row['Beitrag €']=moneyDE(memberBeitrag(m));   // Info-Spalte (beim Import ignoriert)
  return row;
}
function impExp(){
  openModal(`<h3>⇅ Mitglieder · Import / Export (Excel)</h3>
   <div class="sec-head">⬇️ Export</div>
   <div class="muted" style="margin-bottom:8px">Alle Mitglieder als Excel-Datei (eine Zeile je Mitglied, inkl. Bankdaten &amp; berechnetem Beitrag).</div>
   <button class="btn primary" onclick="GV.exportMitglieder()">⬇️ Mitglieder exportieren</button>

   <div class="sec-head" style="margin-top:18px">⬆️ Mitglieder importieren</div>
   <div class="muted" style="margin-bottom:8px">Excel/CSV mit denselben Spalten. Zeilen werden anhand <b>Mitgliednummer</b> (sonst id, sonst Name) aktualisiert bzw. neu angelegt. Leere Zellen lassen bestehende Werte unverändert.</div>
   <label class="btn" style="cursor:pointer">📄 Datei wählen…<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="GV.importMitglieder(this)"></label>

   <div class="sec-head" style="margin-top:18px">🏦 Bankdaten importieren</div>
   <div class="muted" style="margin-bottom:8px">Passt direkt zur Bank-CSV mit den Spalten <b>Mitglieds Nr · Vorname · Nachname · Strasse · BIC Nr · IBAN Nr</b> (Reihenfolge egal, Spaltennamen werden erkannt). Zuordnung bevorzugt über die <b>Mitgliednummer</b>, sonst Vorname + Nachname. Gesetzt werden IBAN, BIC und die <b>Adresse (überschreibt die bestehende!)</b>; mit IBAN wird das SEPA-Mandat aktiviert. Nicht zugeordnete Zeilen werden gemeldet.</div>
   <label class="btn" style="cursor:pointer">🏦 Bankdaten-Datei wählen…<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="GV.importBankdaten(this)"></label>

   <div id="ie-status" class="muted" style="margin-top:14px"></div>
   <div class="actions-row"><button class="btn" onclick="GV.close()">Schließen</button></div>`, true);
}
function ieStatus(t){ const el=$('ie-status'); if(el) el.innerHTML=t||''; }
async function exportMitglieder(){
  ieStatus('Excel wird erstellt …');
  try{
    const XLSX=await loadXLSX();
    const rows=members().map(memberToRow);
    const ws=XLSX.utils.json_to_sheet(rows,{header:MEMBER_COLS.concat(['Beitrag €'])});
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Mitglieder');
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    XLSX.writeFile(wb, `VdG-Mitglieder-${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}.xlsx`);
    ieStatus(`Export erstellt: ${rows.length} Mitglieder.`);
  }catch(e){ console.error(e); ieStatus('<span style="color:#c0392b">'+esc((e&&e.message)||e)+'</span>'); }
}
function findMemberByNameOrId(row){
  const nr=rowMitgliednr(row);
  if(nr){ const m=members().find(x=>String(x.mitgliednr||'').trim()===nr); if(m) return m; }
  const id=String(row.id||'').trim();
  if(id && _cache.mitglieder[id]) return _cache.mitglieder[id];
  const nm=String(row.name||'').toLowerCase().trim();
  if(nm) return members().find(m=>String(m.name||'').toLowerCase().trim()===nm)||null;
  return null;
}
async function importMitglieder(input){
  const file=input&&input.files&&input.files[0]; if(!file) return;
  if(!confirm('Mitglieder-Import starten? Vorhandene werden per id/Name aktualisiert, neue angelegt.')){ input.value=''; return; }
  ieStatus('Datei wird gelesen …');
  try{
    const XLSX=await loadXLSX();
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    let created=0, updated=0, skipped=0;
    rows.forEach(row=>{
      const _nr=rowMitgliednr(row);
      if(!String(row.name||'').trim() && !String(row.id||'').trim() && !_nr){ skipped++; return; }
      const ex=findMemberByNameOrId(row);
      const rec=Object.assign({}, ex||{});
      if(!rec.id) rec.id=newId();
      if(!rec.createdAt) rec.createdAt=Date.now();
      const setIf=(k,v)=>{ if(v!=null && String(v).trim()!=='') rec[k]=v; };
      setIf('mitgliednr', _nr);
      setIf('name', row.name);
      setIf('status', String(row.status||'').toLowerCase().trim());
      setIf('email', row.email); setIf('tel', row.tel); setIf('adresse', row.adresse);
      if(row.eintrittsdatum!=='') rec.eintrittsdatum=xlDate(row.eintrittsdatum);
      setIf('kontoinhaber', row.kontoinhaber);
      if(row.iban!=='') rec.iban=normIban(row.iban);
      if(row.bic!=='') rec.bic=String(row.bic).replace(/\s+/g,'').toUpperCase();
      setIf('mandatsref', row.mandatsref);
      if(row.mandatsdatum!=='') rec.mandatsdatum=xlDate(row.mandatsdatum);
      if(row.sepaAktiv!=='') rec.sepaAktiv=xlBool(row.sepaAktiv);
      if(row.flaeche!=='') rec.flaeche=num(row.flaeche);
      if(row.wasserverbrauch!=='') rec.wasserverbrauch=num(row.wasserverbrauch);
      if(row.gemeinschaftGeleistet!=='') rec.gemeinschaftGeleistet=xlBool(row.gemeinschaftGeleistet);
      if(row.pforteCount!=='') rec.pforteCount=num(row.pforteCount);
      if(row.frostCount!=='') rec.frostCount=num(row.frostCount);
      setIf('note', row.note);
      if(row.bezahltJahr!=='') rec.bezahltJahr=parseInt(row.bezahltJahr,10)||rec.bezahltJahr;
      if(row.mahnStufe!=='') rec.mahnStufe=parseInt(row.mahnStufe,10)||0;
      if(row.mahnDatum!=='') rec.mahnDatum=xlDate(row.mahnDatum);
      ['parzellen','aemter'].forEach(k=>{ if(String(row[k]||'').trim()){ try{ const a=JSON.parse(row[k]); if(Array.isArray(a)) rec[k]=a; }catch(e){} } });
      saveMember(rec);
      if(ex) updated++; else created++;
    });
    input.value=''; render();
    ieStatus(`Import fertig: ${created} neu, ${updated} aktualisiert${skipped?`, ${skipped} übersprungen`:''}.`);
    toast(`Import: ${created+updated} Mitglieder ✓`,'ok');
  }catch(e){ console.error(e); ieStatus('<span style="color:#c0392b">'+esc((e&&e.message)||e)+'</span>'); }
}
async function importBankdaten(input){
  const file=input&&input.files&&input.files[0]; if(!file) return;
  if(!confirm('Bankdaten-Import starten? Bei passenden Mitgliedern werden IBAN/BIC gesetzt und die Adresse (Strasse) überschrieben.')){ input.value=''; return; }
  ieStatus('Datei wird gelesen …');
  try{
    const XLSX=await loadXLSX();
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
    let set=0; const unmatched=[];
    rows.forEach(row=>{
      // Spalten tolerant lesen (Bank-CSV: Mitglieds Nr, Vorname, Nachname, Strasse, BIC Nr, IBAN Nr)
      const iban=rowGet(row,/iban/i);
      const bic=rowGet(row,/bic/i);
      const strasse=rowGet(row,/stra[sß]e|adresse/i);
      const vorname=rowGet(row,/vorname/i);
      const nachname=rowGet(row,/nachname/i);
      const kontoinhaber=rowGet(row,/kontoinhaber/i);
      const mandatsref=rowGet(row,/mandatsref|mandat.?ref/i);
      const mandatsdatum=rowGet(row,/mandat.?(datum|vom)/i);
      const fullName=[vorname,nachname].filter(Boolean).join(' ').trim();
      // Zuordnung: bevorzugt Mitgliednummer, sonst Vorname+Nachname
      let m=findMemberByNameOrId(row);
      if(!m && fullName){ const fn=fullName.toLowerCase(); m=members().find(x=>String(x.name||'').toLowerCase().trim()===fn); }
      if(!m){ const who=fullName||rowMitgliednr(row)||''; if(who) unmatched.push(who); return; }
      const rec=Object.assign({}, m);
      let any=false;
      if(iban){ rec.iban=normIban(iban); rec.sepaAktiv=true; any=true; }
      if(bic){ rec.bic=bic.replace(/\s+/g,'').toUpperCase(); any=true; }
      if(strasse){ rec.adresse=strasse; any=true; }                 // bestehende Adresse überschreiben
      if(kontoinhaber){ rec.kontoinhaber=kontoinhaber; any=true; }
      if(mandatsref){ rec.mandatsref=mandatsref; any=true; }
      if(mandatsdatum){ rec.mandatsdatum=xlDate(mandatsdatum); any=true; }
      if(any){ saveMember(rec); set++; }
    });
    input.value=''; render();
    ieStatus(`Bankdaten gesetzt für ${set} Mitglied(er).`+(unmatched.length?` <br><span style="color:#c0392b">Nicht zugeordnet (${unmatched.length}): ${esc(unmatched.slice(0,20).join(', '))}${unmatched.length>20?' …':''}</span>`:''));
    toast(`Bankdaten: ${set} gesetzt ✓`,'ok');
  }catch(e){ console.error(e); ieStatus('<span style="color:#c0392b">'+esc((e&&e.message)||e)+'</span>'); }
}

// Lastschriften als Excel-Übersicht (zum Anschauen/Prüfen – NICHT die Bankdatei)
async function exportLastschriftenXlsx(){
  const c=sepaCfg();
  const list=members().filter(m=>isAktiv(m)&&m.sepaAktiv&&String(m.iban||'').trim());
  if(!list.length){ toast('Keine Mitglieder mit Mandat & IBAN.','err'); return; }
  try{
    const XLSX=await loadXLSX();
    const zweck=c.verwendung+' '+c.beitragsjahr;
    const rows=list.map(m=>({
      Name:m.name||'', Kontoinhaber:m.kontoinhaber||m.name||'', IBAN:m.iban||'', BIC:m.bic||'',
      'Betrag €':Number(memberBeitrag(m).toFixed(2)),
      Mandatsreferenz:m.mandatsref||'', 'Mandat vom':m.mandatsdatum||'', Verwendungszweck:zweck
    }));
    rows.push({ Name:'', Kontoinhaber:'', IBAN:'', BIC:'',
      'Betrag €':Number(list.reduce((s,m)=>s+memberBeitrag(m),0).toFixed(2)),
      Mandatsreferenz:'SUMME', 'Mandat vom':'', Verwendungszweck:'' });
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Lastschriften');
    XLSX.writeFile(wb, `VdG-Lastschriften-${c.beitragsjahr}.xlsx`);
    toast('Excel-Übersicht erstellt ✓','ok');
  }catch(e){ console.error(e); toast('Export fehlgeschlagen: '+((e&&e.message)||e),'err'); }
}

// ── Export für inline onclick ──────────────────────────────────────
window.GV = {
  logout, show, onSearch, statusFilter, close:closeModal,
  forgotPw, changePw:changePwModal, savePw, addUser:addUserModal, saveUser,
  newMember, editMember, openMember, saveMemberForm, askDelMember, mailAlle, doArchive,
  copySepa, copySepaForm, amtPrev, manageAemter,
  saveSepaCfg, exportSepa, exportLastschriftenXlsx, mahnMail, mahnPdf, markBezahlt, resetMahn, beitragPrev, beitragPdf,
  saveRechnungsfuehrer, clearRechnungsfuehrer,
  newVerstoss, saveVerstoss, verstossMail, verstossPdf, verstossErledigt, verstossDel,
  impExp, exportMitglieder, importMitglieder, importBankdaten,
  setFamilie:()=>{ document.querySelectorAll('.m-post').forEach(cb=>{ if(FAMILIE_AUS.includes(cb.value)) cb.checked=false; }); beitragPrev(); },
  parzPrefill:(inp)=>{ const g=parzGroesse(inp.value); const f=$('m-flaeche'); if(g!=null && f && (f.value===''||num(f.value,0)===0)){ f.value=g; beitragPrev(); } },
  addParz:()=>$('m-parz').insertAdjacentHTML('beforeend', parzRowHtml({})),
  delParz:(btn)=>{ const r=btn.closest('.parz-row'); if(r) r.remove(); },
  addAmt:()=>$('m-amt').insertAdjacentHTML('beforeend', amtRowHtml({})),
  delAmt:(btn)=>{ const r=btn.closest('.amt-item'); if(r) r.remove(); },
  newListe, editListe, saveListeForm, askDelListe, listeAddMember, verteilerMail, verteilerCopy
};

// Modal-Hintergrund schließt bei Klick daneben
document.addEventListener('click', e=>{ if(e.target===$('modal-bg')) closeModal(); });
init();
})();
