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
function _json(obj, code){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setResponseCode(code||200);
}
function _escapeHtml(s){return String(s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));}
function _code(n=8){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<n;i++) s+=a[(Math.random()*a.length)|0];return s;}
function _qrUrl(t){return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(t);}
function _fmtDate(iso,tz){try{const d=new Date(iso);return Utilities.formatDate(d, tz||Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');}catch(_){return iso||'';}}
function _parseFsl(fsl){try{const b64=String(fsl||'').replace(/-/g,'+').replace(/_/g,'/');const raw=Utilities.base64Decode(b64);return JSON.parse(Utilities.newBlob(raw).getDataAsString());}catch(_){return {};}}
function hostFromUrl_(u){try{return new URL(u).host;}catch(_){return'';}}
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

    if(String(p.ui||'')==='1' || (!p.token && !p.share && !p.ping)){
      return _renderApp();
    }

    if(String(p.ping||'')==='1'){ _getSpreadsheet(); return _json({ok:true,pong:true}); }

    if(String(p.share||'')==='1'){ return _shareLanding(e); }

    if(p.token){
      const lic=_checkLicense((p.license_key||'').trim(), hostFromUrl_((p.base||'').trim()));
      if(!lic.ok) return _json({ok:false,error:lic.err}, lic.code);
      return _status(e);
    }
    return _json({ok:false,error:'bad_request'},400);

  }catch(err){
    _debugLog('doGet exception: '+(err&&err.stack||err));
    return _json({ok:false,error:'exception: '+(err&&err.message||String(err))},500);
  }
}

function _renderApp(){
  const tpl=HtmlService.createTemplateFromFile('app');
  tpl.execUrl=ScriptApp.getService().getUrl();
  return tpl.evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle('FlashOffer');
}

/* ====== STATUS (GET) ====== */
function _status(e){
  const token=(e.parameter.token||'').trim(); if(!token) return _json({ok:false,error:'bad_request'},400);
  const sh=_sheet(SHEET_OFFERS,['token','title','desc','startISO','dur_min','tz','qty_total','qty_claimed','createdAt','lang','item_name','item_url','item_image','vendor','seller_email']);
  const data=sh.getDataRange().getValues();
  const row=data.find((r,i)=>i>0&&r[0]===token);
  if(!row) return _json({ok:true,exists:false,claimed:false,remaining:null},200);
  const qtyTotal=Number(row[6]||0), qtyClaim=Number(row[7]||0);
  const remaining=Math.max(0, qtyTotal-qtyClaim), claimed=remaining===0;
  return _json({ok:true,exists:true,claimed,remaining,qty_total:qtyTotal,qty_claimed:qtyClaim},200);
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
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setResponseCode(204);
}

/* ====== CLAIM (POST) ====== */
function doPost(e){
  try{
    let b={}; try{ b=JSON.parse(e.postData.contents||'{}'); }catch(_){}
    const token=(b.token||'').trim(), email=(b.email||'').trim(), license_key=(b.license_key||'').trim();
    if(!token||!email||!license_key) return _json({ok:false,error:'bad_request'},400);

    const lic=_checkLicense(license_key, hostFromUrl_((b.base||'').trim()));
    if(!lic.ok) return _json({ok:false,error:lic.err}, lic.code);

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
      if(Math.max(0,qtyTotal-qtyClaim)<=0) return _json({ok:false,error:'conflict',remaining:0},409);

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
      return _json({ok:true,remaining:left},200);

    }finally{ try{lock.releaseLock();}catch(_){}} 
  }catch(err){
    _debugLog('doPost exception: '+(err&&err.stack||err));
    return _json({ok:false,error:'exception: '+(err&&err.message||String(err))},500);
  }
}

/* ====== Manual helpers ====== */
function initFlashOfferSheets(){ _getSpreadsheet(); Logger.log('Sheets initialized'); }
function showStorage(){ const id=PropertiesService.getScriptProperties().getProperty(PROP_ID_KEY); Logger.log('STORAGE SHEET ID = '+id); }
function resetStorage(){ PropertiesService.getScriptProperties().deleteProperty(PROP_ID_KEY); Logger.log('STORAGE RESET'); }
