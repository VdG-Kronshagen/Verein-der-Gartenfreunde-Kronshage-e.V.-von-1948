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
function openModal(html){ $('modal-body').innerHTML=html; $('modal-bg').classList.add('show'); }
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
let _cache={ mitglieder:{}, verteiler:{} };
let _view='mitglieder', _q='';

function members(){ return Object.values(_cache.mitglieder||{}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'})); }
function lists(){ return Object.values(_cache.verteiler||{}).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de',{sensitivity:'base'})); }
function whoLabel(){ return (_user&&(_user.displayName||_user.email))||''; }

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

// ── Datenschicht (realtime, granulare Writes) ──────────────────────
function startData(){
  if(_ref) return;  // nur einmal
  _ref = firebase.database().ref('gv');
  ['mitglieder','verteiler'].forEach(coll=>{
    _ref.child(coll).on('value', snap=>{
      _cache[coll] = snap.val() || {};
      if($('modal-bg').classList.contains('show')) return; // Formular offen → nicht neu zeichnen
      render();
    });
  });
}
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
function render(){
  $('tab-mitglieder').classList.toggle('active', _view==='mitglieder');
  if($('tab-parzellen')) $('tab-parzellen').classList.toggle('active', _view==='parzellen');
  $('tab-verteiler').classList.toggle('active', _view==='verteiler');
  $('view').innerHTML = _view==='verteiler' ? viewVerteiler() : _view==='parzellen' ? viewParzellen() : viewMitglieder();
}

// ── Mitglieder ─────────────────────────────────────────────────────
function matchM(m){ return [m.name,m.funktion,m.email,m.tel,m.adresse,m.note,(m.parzellen||[]).map(p=>p.nr).join(' ')].map(x=>String(x||'').toLowerCase()).join(' ').includes(_q); }
function memberCard(m){ return `<div class="card">
      <h3>${esc(m.name||'(ohne Name)')}</h3>
      ${m.funktion?`<div class="sub">${esc(m.funktion)}</div>`:''}
      <div class="links">
        ${m.email?`<a href="${mailHref(m.email)}">✉️ ${esc(m.email)}</a>`:''}
        ${m.tel?`<a href="${telHref(m.tel)}">📞 ${esc(m.tel)}</a>`:''}
      </div>
      ${m.adresse?`<div class="sub" style="margin-top:6px">📍 ${esc(m.adresse)}</div>`:''}
      ${m.note?`<div class="sub" style="margin-top:6px">${esc(m.note)}</div>`:''}
      ${(currentParz(m)||m.sepaAktiv)?`<div class="links" style="margin-top:8px">${currentParz(m)?`<span class="chip">🌳 Parzelle ${esc(currentParz(m))}</span>`:''}${m.sepaAktiv?`<span class="chip">🏦 SEPA</span>`:''}</div>`:''}
      <div class="actions">
        <button class="btn" onclick="GV.editMember('${m.id}')">Bearbeiten</button>
        <button class="x" title="Löschen" onclick="GV.askDelMember('${m.id}')">✕</button>
      </div>
    </div>`; }
function leftCard(m){ return `<div class="card">
      <h3>${esc(m.name||'(ohne Name)')}</h3>
      <div class="sub">🚪 ausgetreten${m.austrittsdatum?' am '+fmtDateShort(m.austrittsdatum):''}</div>
      ${(m.parzellen&&m.parzellen.length)?`<div class="links" style="margin-top:8px">${m.parzellen.map(p=>`<span class="chip">🌳 ${esc(p.nr)} ${parzRange(p)}</span>`).join('')}</div>`:''}
      <div class="actions">
        <button class="btn" onclick="GV.editMember('${m.id}')">Ansehen</button>
        <button class="x" title="Endgültig löschen (auch Name)" onclick="GV.askDelMember('${m.id}')">✕</button>
      </div>
    </div>`; }
function viewMitglieder(){
  let arr=members(); if(_q) arr=arr.filter(matchM);
  const active=arr.filter(isAktiv), left=arr.filter(m=>!isAktiv(m));
  const anyMail=members().filter(isAktiv).some(m=>m.email);
  const cards=active.map(memberCard).join('') || `<div class="muted">${_q?'Keine aktiven Treffer.':'Noch keine Mitglieder. Lege das erste an.'}</div>`;
  return `<div class="sec">
    <h2><span>👥 Mitglieder (${members().filter(isAktiv).length})</span>
      <span style="display:flex;gap:8px;flex-wrap:wrap">
        ${anyMail?`<button class="btn" title="Mail an alle aktiven (BCC)" onclick="GV.mailAlle()">✉️ Mail an alle</button>`:''}
        <button class="btn primary" onclick="GV.newMember()">＋ Mitglied</button>
      </span></h2>
    <div class="list">${cards}</div>
    ${left.length?`<details style="margin-top:14px"><summary style="cursor:pointer;color:var(--muted);font-size:13px;font-weight:600">🚪 Ausgetretene Mitglieder (${left.length})</summary><div class="list" style="margin-top:10px">${left.map(leftCard).join('')}</div></details>`:''}
  </div>`;
}
function mailAlle(){
  const emails=members().filter(isAktiv).map(m=>m.email).filter(Boolean);
  if(!emails.length){ toast('Keine E-Mail-Adressen hinterlegt.','err'); return; }
  openMail(emails,'bcc');
}
// ── Parzellen-Verlauf (aus allen Mitgliedern, inkl. ausgetretener) ──
function viewParzellen(){
  const map={};
  members().forEach(m=>{ (m.parzellen||[]).forEach(p=>{ if(!p.nr) return; (map[p.nr]=map[p.nr]||[]).push({name:m.name||'?', von:p.von||'', bis:p.bis||''}); }); });
  let nrs=Object.keys(map);
  if(_q) nrs=nrs.filter(nr=>String(nr).toLowerCase().includes(_q) || map[nr].some(h=>String(h.name).toLowerCase().includes(_q)));
  nrs.sort((a,b)=>{ const na=parseInt(a,10), nb=parseInt(b,10); if(!isNaN(na)&&!isNaN(nb)&&na!==nb) return na-nb; return String(a).localeCompare(String(b),'de',{numeric:true}); });
  const cards=nrs.map(nr=>{
    const hist=map[nr].slice().sort((a,b)=>String(a.von||'').localeCompare(String(b.von||'')));
    const cur=hist.filter(h=>!h.bis).map(h=>h.name);
    const rows=hist.map(h=>`<div class="parz-hist${!h.bis?' cur':''}"><span class="nm">${esc(h.name)}</span><span class="rg">${fmtDateShort(h.von)||'?'} – ${h.bis?fmtDateShort(h.bis):'heute'}</span></div>`).join('');
    return `<div class="card">
      <h3>🌳 Parzelle ${esc(nr)}</h3>
      <div class="sub">${cur.length?('Aktuell: '+esc(cur.join(', '))):'aktuell frei'}</div>
      <div style="margin-top:8px">${rows}</div>
    </div>`;
  }).join('') || `<div class="muted">${_q?'Keine Treffer.':'Noch keine Parzellen erfasst – trag sie bei den Mitgliedern ein.'}</div>`;
  return `<div class="sec">
    <h2><span>🌳 Parzellen-Verlauf</span></h2>
    <div class="muted" style="margin-bottom:10px">Wer hatte welche Parzelle wann? Wird automatisch aus den Parzellen-Einträgen der Mitglieder gebildet (inkl. ausgetretener – Name bleibt, Rest gelöscht).</div>
    <div class="list">${cards}</div>
  </div>`;
}
function parzRowHtml(p){ p=p||{};
  return `<div class="parz-row">
    <input class="pz-nr" placeholder="Parzelle Nr." value="${esc(p.nr||'')}" style="flex:1;min-width:70px">
    <input class="pz-von" type="date" value="${esc(p.von||'')}" title="von" style="flex:1">
    <input class="pz-bis" type="date" value="${esc(p.bis||'')}" title="bis (leer = aktuell)" style="flex:1">
    <button type="button" class="x" title="Zeile entfernen" onclick="GV.delParz(this)">✕</button>
  </div>`;
}
function readParz(){
  return Array.from(document.querySelectorAll('.parz-row')).map(r=>({
    nr:(r.querySelector('.pz-nr').value||'').trim(),
    von:r.querySelector('.pz-von').value||'',
    bis:r.querySelector('.pz-bis').value||''
  })).filter(p=>p.nr).sort((a,b)=>String(a.von||'').localeCompare(String(b.von||'')));
}
function currentParz(m){ if(m.status==='ausgetreten') return ''; const ps=Array.isArray(m.parzellen)?m.parzellen:[]; const open=ps.filter(p=>!p.bis); if(open.length) return open[open.length-1].nr; return ''; }
function fmtDateShort(s){ if(!s) return ''; const p=String(s).split('-'); return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(s); }
function parzRange(p){ return `(${fmtDateShort(p.von)||'?'} – ${p.bis?fmtDateShort(p.bis):'heute'})`; }
function isAktiv(m){ return m.status!=='ausgetreten'; }
// Austritt: persönliche Daten löschen, NUR Name + Parzellen-Verlauf behalten,
// offene Parzellen mit dem Austrittsdatum schließen, Adresse aus Verteilern entfernen.
function doAustritt(id){
  const m=_cache.mitglieder[id]; if(!m) return;
  const def=new Date().toISOString().slice(0,10);
  const datum=prompt('Austrittsdatum (JJJJ-MM-TT).\nAchtung: Alle persönlichen Daten (E-Mail, Telefon, Adresse, Bankdaten) werden gelöscht – nur Name und Parzellen-Verlauf bleiben erhalten.', def);
  if(datum===null) return;
  const d=(String(datum).trim())||def;
  const oldMail=String(m.email||'').toLowerCase().trim();
  const parz=(Array.isArray(m.parzellen)?m.parzellen:[]).map(p=>({nr:p.nr, von:p.von||'', bis:p.bis||d}));
  // Vollständig ersetzen → alle anderen Felder (Mail/Tel/Adresse/SEPA …) fallen weg
  saveMember({ id:m.id, name:m.name, status:'ausgetreten', austrittsdatum:d,
    eintrittsdatum:m.eintrittsdatum||'', parzellen:parz, createdAt:m.createdAt||Date.now() });
  // Aus allen Verteilern entfernen
  if(oldMail){ lists().forEach(v=>{ const cur=normEmails(v.emails); if(cur.some(e=>e.toLowerCase()===oldMail)) saveListe(Object.assign({},v,{emails:cur.filter(e=>e.toLowerCase()!==oldMail)})); }); }
  closeModal(); render(); toast('Austritt eingetragen – persönliche Daten gelöscht.','ok');
}
function memberForm(m){
  const ls=lists();
  const myMail=String(m.email||'').toLowerCase().trim();
  const vBlock = ls.length ? `<div class="field"><label>✉️ Zu Verteiler hinzufügen</label>
     <div class="pick">${ls.map(v=>{ const inIt=myMail && normEmails(v.emails).some(e=>e.toLowerCase()===myMail);
        return `<label><input type="checkbox" class="m-vt" value="${esc(v.id)}" ${inIt?'checked':''}> ${esc(v.name||'(ohne Name)')}</label>`; }).join('')}</div>
     <div class="muted" style="margin-top:4px">Wirkt nur mit hinterlegter E-Mail.</div></div>` : '';
  return `<h3>${m.id?'✎ Mitglied':'＋ Mitglied'}</h3>
   ${m.status==='ausgetreten'?`<div style="background:#fdecea;border:1px solid #f0bcb6;border-radius:8px;padding:8px 10px;margin-bottom:12px;color:#c0392b;font-size:13px">🚪 Ausgetreten${m.austrittsdatum?' am '+fmtDateShort(m.austrittsdatum):''} – persönliche Daten wurden gelöscht. Name &amp; Parzellen-Verlauf bleiben erhalten.</div>`:''}
   <div class="field"><label>Name *</label><input id="m-name" value="${esc(m.name||'')}"></div>
   <div class="field"><label>Funktion / Rolle</label><input id="m-funktion" value="${esc(m.funktion||'')}" placeholder="z. B. Vorstand, Kassenwart …"></div>
   <div class="field"><label>Eintrittsdatum</label><input id="m-eintritt" type="date" value="${esc(m.eintrittsdatum||'')}"></div>
   <div class="field"><label>E-Mail</label><input id="m-email" type="email" value="${esc(m.email||'')}"></div>
   <div class="field"><label>Telefon</label><input id="m-tel" value="${esc(m.tel||'')}"></div>
   <div class="field"><label>Adresse</label><input id="m-adresse" value="${esc(m.adresse||'')}"></div>

   <div class="sec-head">🌳 Gartenparzellen (Verlauf)</div>
   <div id="m-parz">${(Array.isArray(m.parzellen)?m.parzellen:[]).map(parzRowHtml).join('')}</div>
   <button type="button" class="btn" onclick="GV.addParz()">＋ Parzelle</button>
   <div class="muted" style="margin-top:4px">„bis" leer lassen = aktuelle Parzelle.</div>

   <div class="sec-head">🏦 SEPA-Lastschrift</div>
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

   <div class="field"><label>Notiz</label><textarea id="m-note" rows="2">${esc(m.note||'')}</textarea></div>
   ${vBlock}
   <div class="actions-row">
   ${(m.id && m.status!=='ausgetreten')?`<button class="btn danger" style="margin-right:auto" onclick="GV.doAustritt('${m.id}')">🚪 Austritt eintragen</button>`:''}
   <button class="btn" onclick="GV.close()">Abbrechen</button>
   <button class="btn primary" onclick="GV.saveMemberForm('${m.id||''}')">${m.id?'Speichern':'Anlegen'}</button></div>`;
}
function newMember(){ openModal(memberForm({})); }
function editMember(id){ const m=_cache.mitglieder[id]; if(m) openModal(memberForm(m)); }
function saveMemberForm(id){
  const name=val('m-name'); if(!name){ toast('Bitte einen Namen eingeben.','err'); return; }
  const email=val('m-email');
  const ex=id?_cache.mitglieder[id]:null;
  const rec={ id:id||newId(), name, funktion:val('m-funktion'), eintrittsdatum:val('m-eintritt'),
    email, tel:val('m-tel'), adresse:val('m-adresse'), note:val('m-note'),
    parzellen:readParz(),
    sepaAktiv:!!($('m-sepa')&&$('m-sepa').checked),
    kontoinhaber:val('m-inhaber'), iban:val('m-iban'), bic:val('m-bic'),
    mandatsref:val('m-mref'), mandatsdatum:val('m-mdat'),
    createdAt:(ex&&ex.createdAt)||Date.now() };
  if(ex&&ex.status==='ausgetreten'){ rec.status='ausgetreten'; rec.austrittsdatum=ex.austrittsdatum||''; }
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
function askDelMember(id){ const m=_cache.mitglieder[id]; if(!m) return; if(!confirm(`Mitglied „${m.name||''}" löschen?`)) return; delMember(id); render(); toast('Gelöscht.',''); }

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
  return `<div class="sec">
    <h2><span>✉️ E-Mail-Verteiler (${lists().length})</span><button class="btn primary" onclick="GV.newListe()">＋ Verteiler</button></h2>
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

// ── Export für inline onclick ──────────────────────────────────────
window.GV = {
  logout, show, onSearch, close:closeModal,
  newMember, editMember, saveMemberForm, askDelMember, mailAlle, doAustritt,
  addParz:()=>$('m-parz').insertAdjacentHTML('beforeend', parzRowHtml({})),
  delParz:(btn)=>{ const r=btn.closest('.parz-row'); if(r) r.remove(); },
  newListe, editListe, saveListeForm, askDelListe, listeAddMember, verteilerMail, verteilerCopy
};

// Modal-Hintergrund schließt bei Klick daneben
document.addEventListener('click', e=>{ if(e.target===$('modal-bg')) closeModal(); });
init();
})();
