/***** FLASHOFFER — ONE-FILE WEB APP (NO CORS, SELF-STORAGE) *****/

// листы
const SHEET_OFFERS='offers', SHEET_CLAIMS='claims', SHEET_LICENSES='licenses', SHEET_LOGS='logs';
const PROP_ID_KEY='SPREADSHEET_ID', SENDER_NAME='FlashOffer';

/* ====== STORAGE (auto-create spreadsheet) ====== */
function _getSpreadsheet(){
  const p=PropertiesService.getScriptProperties();
  let id=p.getProperty(PROP_ID_KEY);
  if(id){
    try{return SpreadsheetApp.openById(id);}catch(e){/* fallthrough */}
  }
  const ss=SpreadsheetApp.create('FlashOffer Data');
  p.setProperty(PROP_ID_KEY, ss.getId());
  _sheet(SHEET_OFFERS,['token','title','desc','startISO','dur_min','tz','qty_total','qty_claimed','createdAt','lang','item_name','item_url','item_image','vendor','seller_email'], ss);
  _claimsSheet(ss);
  _sheet(SHEET_LICENSES,['license_key','owner_email','allowed_domains','quota_total','quota_used','active','createdAt'], ss);
  _sheet(SHEET_LOGS,['ts','msg'], ss);
  return ss;
}
function _sheet(name, headers, ssOpt){
  const ss=ssOpt||_getSpreadsheet();
  const sh=ss.getSheetByName(name)||ss.insertSheet(name);
  if(headers && sh.getLastRow()===0) sh.appendRow(headers);
  return sh;
}

function _claimsHeaders(){ return ['token','email','code','claimedAt','lang']; }
function _claimsSheet(ssOpt){
  const sh=_sheet(SHEET_CLAIMS,_claimsHeaders(), ssOpt);
  try{
    const lastCol=sh.getLastColumn();
    if(lastCol>0){
      const headers=sh.getRange(1,1,1,lastCol).getValues()[0];
      const phoneIdx=headers.indexOf('phone');
      if(phoneIdx>=0) sh.deleteColumn(phoneIdx+1);
    }
    const headers=_claimsHeaders();
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }catch(_){}
  return sh;
}

/* ====== UTILS ====== */
function _corsHeaders(out, origin){
  const allow = origin || '*';
  const headers={
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if(typeof out.setHeaders==='function'){
    out.setHeaders(headers);
  }else if(typeof out.setHeader==='function'){
    Object.keys(headers).forEach(k=>out.setHeader(k, headers[k]));
  }
  return out;
}
function _json(obj, code, origin){
  const out = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setResponseCode(code||200);
  return _corsHeaders(out, origin);
}
function _escapeHtml(s){return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));}
function _code(n=8){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<n;i++) s+=a[(Math.random()*a.length)|0];return s;}
function _qrUrl(t){return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(t);}
function _fmtDate(iso,tz){try{const d=new Date(iso);return Utilities.formatDate(d, tz||Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');}catch(_){return iso||'';}}
function _parseFsl(fsl){try{const b64=String(fsl||'').replace(/-/g,'+').replace(/_/g,'/');const raw=Utilities.base64Decode(b64);return JSON.parse(Utilities.newBlob(raw).getDataAsString());}catch(_){return {};}}
function hostFromUrl_(u){try{return new URL(u).host;}catch(_){return'';}}
function originFromUrl_(u){try{return new URL(u).origin;}catch(_){return'*';}}
function _debugLog(m){try{_sheet(SHEET_LOGS,['ts','msg']).appendRow([new Date(), String(m)]);}catch(_){}}

/* ====== LICENSES ====== */
function _licensesSheet(){return _sheet(SHEET_LICENSES,['license_key','owner_email','allowed_domains','quota_total','quota_used','active','createdAt']);}
function _findLicenseRow(key){const sh=_licensesSheet();const data=sh.getDataRange().getValues();const idx=data.findIndex((r,i)=>i>0&&String(r[0])===String(key));return {sh,idx,row:idx>0?data[idx]:null};}
function _checkLicense(license_key, originHost){
  if(!license_key) return {ok:false,code:401,err:'no_license'};
  const {sh,idx,row}= _findLicenseRow(license_key);
  if(idx<0) return {ok:false,code:403,err:'license_not_found'};
  const active=String(row[5]).toUpperCase()!=='FALSE'; if(!active) return {ok:false,code:403,err:'license_inactive'};
  const allow=String(row[2]||'').trim();
  if(allow){ const list=allow.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(originHost && !list.includes(String(originHost).toLowerCase())) return {ok:false,code:403,err:'domain_not_allowed'};
  }
  const total=Number(row[3]||0)||0, used=Number(row[4]||0)||0;
  if(total>0 && used>=total) return {ok:false,code:403,err:'quota_exceeded'};
  return {ok:true,sh,idx,row,total,used};
}
function _incLicenseQuota(lic){if(!lic||lic.idx<0) return; try{lic.sh.getRange(lic.idx+1,5).setValue((Number(lic.row[4]||0))+1);}catch(_){}}
function addLicense(license_key, owner_email, allowed_domains, quota_total, active){
  const sh=_licensesSheet();
  if(sh.getLastRow()===0) sh.appendRow(['license_key','owner_email','allowed_domains','quota_total','quota_used','active','createdAt']);
  sh.appendRow([license_key, owner_email||'', allowed_domains||'', quota_total||0, 0, (active!==false), new Date()]);
  Logger.log('ADDED LICENSE: '+license_key);
}
function createLicense(owner_email, allowed_domains, quota_total){
  const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let key='FO-'+(new Date().getFullYear())+'-'; for(let i=0;i<8;i++) key+=a[(Math.random()*a.length)|0];
  addLicense(key, owner_email||'', allowed_domains||'', quota_total||0, true);
  Logger.log('NEW LICENSE: '+key); return key;
}

/* ====== ROUTER ====== */
function doGet(e){
  try{
    const p=(e&&e.parameter)?e.parameter:{};
    const origin=originFromUrl_((p.base||'').trim());

    // UI: открываем встроенную страницу (без CORS)
    if(String(p.ui||'')==='1'){
      return HtmlService.createHtmlOutput(_UI_HTML())
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .setTitle('FlashOffer');
    }

    if(String(p.ping||'')==='1'){ _getSpreadsheet(); return _json({ok:true,pong:true}); }

    if(String(p.share||'')==='1'){ return _shareLanding(e); }

    if(p.token){
      const lic=_checkLicense((p.license_key||'').trim(), hostFromUrl_((p.base||'').trim()));
      if(!lic.ok) return _json({ok:false,error:lic.err}, lic.code, origin);
      return _status(e, origin);
    }
    return _json({ok:false,error:'bad_request'},400, origin);

  }catch(err){
    _debugLog('doGet exception: '+(err&&err.stack||err));
    return _json({ok:false,error:'exception: '+(err&&err.message||String(err))},500);
  }
}

/* ====== STATUS (GET) ====== */
function _status(e, origin){
  const token=(e.parameter.token||'').trim(); if(!token) return _json({ok:false,error:'bad_request'},400,origin);
  const sh=_sheet(SHEET_OFFERS,['token','title','desc','startISO','dur_min','tz','qty_total','qty_claimed','createdAt','lang','item_name','item_url','item_image','vendor','seller_email']);
  const data=sh.getDataRange().getValues();
  const row=data.find((r,i)=>i>0&&r[0]===token);
  if(!row) return _json({ok:true,exists:false,claimed:false,remaining:null},200,origin);
  const qtyTotal=Number(row[6]||0), qtyClaim=Number(row[7]||0);
  const remaining=Math.max(0, qtyTotal-qtyClaim), claimed=remaining===0;
  return _json({ok:true,exists:true,claimed,remaining,qty_total:qtyTotal,qty_claimed:qtyClaim},200,origin);
}

/* ====== SHARE (OG + redirect) ====== */
function _shareLanding(e){
  const p=e.parameter||{}; const fsl=(p.fsl||'').trim(), base=(p.base||'').trim(), license_key=(p.license_key||'').trim();
  if(!fsl||!base) return HtmlService.createHtmlOutput('<meta http-equiv="refresh" content="0;url=/" />');
  const lic=_checkLicense(license_key, hostFromUrl_(base)); if(!lic.ok) return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><title>Offer unavailable</title><meta name="robots" content="noindex"><body>Offer unavailable</body>');
  const cfg=_parseFsl(fsl);

  let remainText=''; try{ const sh=_sheet(SHEET_OFFERS); const data=sh.getDataRange().getValues(); const row=data.find((r,i)=>i>0&&r[0]===cfg.token);
    if(row){ const qtyTotal=Number(row[6]||0), qtyClaim=Number(row[7]||0); const rem=Math.max(0, qtyTotal-qtyClaim); remainText=' · Available: '+rem+' / '+(qtyTotal||cfg.qty||1); }
  }catch(_){}
  const title=(cfg.item_name||cfg.title||'Offer')+(cfg.vendor?(' · '+cfg.vendor):'');
  const descA=[]; if(cfg.desc) descA.push(cfg.desc); if(cfg.start) descA.push('Start: '+cfg.start+(cfg.tz?(' ('+cfg.tz+')'):'')); if(cfg.qty) descA.push('Qty: '+cfg.qty);
  const desc=descA.join(' · ')+remainText; const img=cfg.item_image||''; const target=ScriptApp.getService().getUrl()+'?ui=1#fsl='+fsl;

  const html='<!doctype html><html><head><meta charset="utf-8">'+
    '<meta property="og:title" content="'+_escapeHtml(title)+'">'+
    '<meta property="og:description" content="'+_escapeHtml(desc)+'">'+
    (img?'<meta property="og:image" content="'+_escapeHtml(img)+'">':'')+
    '<meta property="og:type" content="website">'+
    '<meta property="og:url" content="'+_escapeHtml(target)+'">'+
    '<meta name="twitter:card" content="summary_large_image">'+
    '<meta name="twitter:title" content="'+_escapeHtml(title)+'">'+
    '<meta name="twitter:description" content="'+_escapeHtml(desc)+'">'+
    (img?'<meta name="twitter:image" content="'+_escapeHtml(img)+'">':'')+
    '<meta http-equiv="refresh" content="0;url='+_escapeHtml(target)+'">'+
    '<title>'+_escapeHtml(title)+'</title></head><body>'+
    '<a href="'+_escapeHtml(target)+'">Open offer</a>'+
    '</body></html>';

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doOptions(e){
  const out = ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT).setResponseCode(204);
  const origin = e && e.parameter ? originFromUrl_((e.parameter.base||'').trim()) : '*';
  return _corsHeaders(out, origin);
}

/* ====== CLAIM (POST) ====== */
function doPost(e){
  try{
    let b={}; try{ b=JSON.parse(e.postData.contents||'{}'); }catch(_){}
    const token=(b.token||'').trim(), email=(b.email||'').trim(), license_key=(b.license_key||'').trim();
    const baseOrigin=originFromUrl_((b.base||'').trim());
    if(!token||!email||!license_key) return _json({ok:false,error:'bad_request'},400,baseOrigin);

    const lic=_checkLicense(license_key, hostFromUrl_((b.base||'').trim()));
    if(!lic.ok) return _json({ok:false,error:lic.err}, lic.code, baseOrigin);

    const lock=LockService.getScriptLock(); lock.tryLock(5000);
    try{
      const shO=_sheet(SHEET_OFFERS,['token','title','desc','startISO','dur_min','tz','qty_total','qty_claimed','createdAt','lang','item_name','item_url','item_image','vendor','seller_email']);
      const shC=_claimsSheet();
      const data=shO.getDataRange().getValues();
      let idx=data.findIndex((r,i)=>i>0&&r[0]===token); let row;
      if(idx<0){
        const qtyTotal=Math.max(1, Number(b.qty||1));
        shO.appendRow([token,b.title||'',b.desc||'',b.startISO||'',Number(b.dur||0),b.tz||'',qtyTotal,0,new Date(),(b.lang||'pl'),b.item_name||'',b.item_url||'',b.item_image||'',b.vendor||'',(b.seller_email||'')]);
        idx=shO.getLastRow()-1; row=shO.getRange(idx+1,1,1,15).getValues()[0];
      }else{ row=shO.getRange(idx+1,1,1,15).getValues()[0]; }
      const qtyTotal=Number(row[6]||0), qtyClaim=Number(row[7]||0);
      if(Math.max(0,qtyTotal-qtyClaim)<=0) return _json({ok:false,error:'conflict',remaining:0},409,baseOrigin);

      const code=_code(8);
      shC.appendRow([token,email,code,new Date(),(b.lang||row[9]||'pl')]);
      shO.getRange(idx+1,8).setValue(qtyClaim+1);
      const left=Math.max(0, qtyTotal-(qtyClaim+1));

      const lang=(b.lang||row[9]||'pl');
      const SUBJ_BUYER={pl:'Potwierdzenie rezerwacji / FlashOffer',en:'Your reservation confirmation / FlashOffer',de:'Ihre Reservierungsbestätigung / FlashOffer',fr:'Confirmation de réservation / FlashOffer',es:'Confirmación de reserva / FlashOffer'}[lang]||'Reservation confirmation / FlashOffer';
      const SUBJ_SELLER={pl:'Sprzedano: nowe zgłoszenie',en:'Sold: new claim',de:'Verkauft: neue Reservierung',fr:'Vendu : nouvelle réservation',es:'Vendido: nueva reserva'}[lang]||'Sold: new claim';

      const startStr=_fmtDate(row[3],row[5]);
      const itemName=b.item_name||row[10]||(b.title||row[1]||'Offer');
      const vendor=b.vendor||row[13]||'', url=b.item_url||row[11]||'';
      const qrData=`FLASH:${token}:${code}`, qrImg=_qrUrl(qrData);

      const buyerHtml='<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111">'+
        '<h2 style="margin:0 0 8px">'+_escapeHtml(SUBJ_BUYER)+'</h2>'+
        '<p><b>'+_escapeHtml(itemName)+'</b>'+(vendor?(' · '+_escapeHtml(vendor)):'')+'</p>'+
        '<p>'+_escapeHtml(startStr)+' '+(row[5]?'('+_escapeHtml(row[5])+')':'')+'</p>'+
        (url?'<p><a href="'+_escapeHtml(url)+'">'+_escapeHtml(url)+'</a></p>':'')+
        '<p><b>Kod / Code:</b> '+_escapeHtml(code)+'</p>'+
        '<p><img alt="QR" src="'+_escapeHtml(qrImg)+'" width="140" height="140"/></p>'+
        '</div>';
      MailApp.sendEmail({to:email,name:SENDER_NAME,subject:SUBJ_BUYER,htmlBody:buyerHtml});

      const seller=(b.seller_email||row[14]||'').trim();
      if(seller){
        const sellerHtml='<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111">'+
          '<h2 style="margin:0 0 8px">'+_escapeHtml(SUBJ_SELLER)+'</h2>'+
          '<p><b>'+_escapeHtml(itemName)+'</b>'+(vendor?(' · '+_escapeHtml(vendor)):'')+'</p>'+
          '<p>'+_escapeHtml(startStr)+(row[5] ? ' ('+_escapeHtml(row[5])+')' : '')+'</p>'+
          (url?'<p><a href="'+_escapeHtml(url)+'">'+_escapeHtml(url)+'</a></p>':'')+
          '<p><b>Kontakt:</b> '+_escapeHtml(email)+'</p>'+
          '<p><b>Kod:</b> '+_escapeHtml(code)+'</p>'+
          '<p><b>Pozostało / Remaining:</b> '+left+' z '+qtyTotal+'</p>'+
          '<p>Token: '+_escapeHtml(token)+'</p>'+'</div>';
        MailApp.sendEmail({to:seller,name:SENDER_NAME,subject:SUBJ_SELLER+' — '+itemName,htmlBody:sellerHtml});
      }

      _incLicenseQuota(lic);
      return _json({ok:true,remaining:left},200,baseOrigin);

    }finally{ try{lock.releaseLock();}catch(_){}} 
  }catch(err){
    _debugLog('doPost exception: '+(err&&err.stack||err));
    return _json({ok:false,error:'exception: '+(err&&err.message||String(err))},500);
  }
}

/* ====== Built-in minimal UI (no CORS) ======
   Открывай:  https://script.google.com/macros/s/…/exec?ui=1#fsl=<...>
*/
function _UI_HTML(){
  const exec = ScriptApp.getService().getUrl();
  return `
<!doctype html><html lang="en"><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>FlashOffer</title>
<style>
  body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:0;background:#0b0d10;color:#eef}
  .wrap{max-width:420px;margin:0 auto;padding:16px}
  .card{background:#151a21;border:1px solid #232a33;border-radius:14px;padding:16px}
  h1{font-size:18px;margin:0 0 8px}
  .mut{color:#9aa3ad;font-size:13px}
  .pill{display:inline-block;padding:6px 10px;border-radius:999px;font-size:12px}
  .good{background:#133a1c;color:#b3e6c1;border:1px solid #1c6a2b}
  .bad{background:#3a1313;color:#f0b1b1;border:1px solid #6a1c1c}
  input,button{width:100%;padding:12px 14px;border-radius:12px;border:1px solid #2b3340;background:#0f1318;color:#eef}
  button{background:#2a62ff;border-color:#3969ff;cursor:pointer}
  button:disabled{opacity:.6;cursor:not-allowed}
  .row{display:flex;gap:8px}
  .row>*{flex:1}
  .timer{font-variant-numeric:tabular-nums;font-size:28px;margin:8px 0 0}
  .stock{font-size:14px;margin-top:6px;color:#c9d3de}
  .sp{height:8px}
</style>
<div class="wrap">
  <div class="card" id="box">
    <h1 id="t">Offer</h1>
    <div class="mut" id="d"></div>
    <div class="pill good" id="status"><span>Available</span></div>
    <div class="timer" id="timer">--:--:--</div>
    <div class="stock" id="stock"></div>
    <div class="sp"></div>
    <div id="claimBox">
    <input id="email" placeholder="you@example.com"/>
    <div class="sp"></div>
    <button id="claim">Reserve</button>
    </div>
  </div>
</div>
<script>
const $=id=>document.getElementById(id);
function dec(b64){b64=b64.replace(/-/g,'+').replace(/_/g,'/');try{return JSON.parse(atob(b64));}catch(e){return{}}}
const hash=location.hash.replace(/^#fsl=/,''); const cfg=dec(hash);
let left = cfg.qty||null;

$('t').textContent = (cfg.item_name||cfg.title||'Offer') + (cfg.vendor?(' · '+cfg.vendor):'');
$('d').textContent = (cfg.desc||'').slice(0,180);

const exec='${exec}';
const base = exec+'?ui=1';

async function fetchStatus(){
  if(!cfg.lockurl || !cfg.license_key){ $('status').className='pill bad'; $('status').firstElementChild.textContent='Unavailable (lock/license)'; $('claim').disabled=true; return; }
  const url = exec + '?token=' + encodeURIComponent(cfg.token)
    + '&license_key=' + encodeURIComponent(cfg.license_key)
    + '&base=' + encodeURIComponent(base);
  const res = await fetch(url); const js = await res.json();
  if(!js.ok){ $('status').className='pill bad'; $('status').firstElementChild.textContent=js.error||'Error'; $('claim').disabled=true; return; }
  if(js.exists){ left = js.remaining; $('stock').textContent = 'Remaining: ' + left; }
  $('status').className = js.claimed?'pill bad':'pill good';
  $('status').firstElementChild.textContent = js.claimed ? 'Sold out' : 'Available';
  $('claim').disabled = !!js.claimed;
}
fetchStatus();

$('claim').onclick=async()=>{
  const email=$('email').value.trim();
  const body = {
    token: cfg.token, email,
    title: cfg.title, desc: cfg.desc,
    startISO: cfg.start, dur: cfg.dur, tz: cfg.tz,
    qty: cfg.qty, lang: cfg.lang,
    item_name: cfg.item_name, item_url: cfg.item_url,
    item_image: cfg.item_image, vendor: cfg.vendor,
    seller_email: cfg.seller_email,
    license_key: cfg.license_key, base
  };
  try{
    const res=await fetch(exec,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const js=await res.json();
    if(!res.ok||!js.ok){ alert('Error: '+(js.error||res.statusText)); return; }
    alert('Reserved! Remaining: '+js.remaining);
    left = js.remaining; $('stock').textContent='Remaining: '+left; fetchStatus();
  }catch(e){ alert('Network error: '+e.message); }
};

function tick(){
  if(!cfg.start || !cfg.dur){ $('timer').textContent='—'; return; }
  const start=new Date(cfg.start).getTime(), now=Date.now(), end=start+Number(cfg.dur||0)*60000;
  let t;
  if(now<start){ t=start-now; }
  else if(now<=end){ t=0; }
  else { t=now-end; }
  const sign = now<start ? '' : now<=end ? '-' : '+';
  const h=Math.floor(t/3600000), m=Math.floor((t%3600000)/60000), s=Math.floor((t%60000)/1000);
  $('timer').textContent=sign+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  requestAnimationFrame(tick);
}
tick();
</script>
</html>`;
}

/* ====== Manual helpers ====== */
function initFlashOfferSheets(){ _getSpreadsheet(); Logger.log('Sheets initialized'); }
function showStorage(){ const id=PropertiesService.getScriptProperties().getProperty(PROP_ID_KEY); Logger.log('STORAGE SHEET ID = '+id); }
function resetStorage(){ PropertiesService.getScriptProperties().deleteProperty(PROP_ID_KEY); Logger.log('STORAGE RESET'); }
