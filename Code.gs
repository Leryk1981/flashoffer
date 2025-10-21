/***** FLASHOFFER · APPS SCRIPT BACKEND with LICENSES *****/
const SPREADSHEET_ID = '1efQToytzyGFcEW93eVsADuIs72YpGoaf0jsSF3HFP4A';

const SHEET_OFFERS   = 'offers';
const SHEET_CLAIMS   = 'claims';
const SHEET_LICENSES = 'licenses';
const SENDER_NAME    = 'FlashOffer';

/* ---------- utils ---------- */
function _sheet(name, headers){
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers && sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}
function _json(obj, code){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON).setResponseCode(code || 200);
}
function _maskPhone(p){ return String(p||'').replace(/\D/g,'').replace(/.(?=....)/g,'•'); }
function _code(n=8){ const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<n;i++) s+=a[(Math.random()*a.length)|0]; return s; }
function _qrUrl(text){ return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(text); }
function _escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function _fmtDate(iso, tz){ try{ const d=new Date(iso); return Utilities.formatDate(d, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }catch(_){ return iso || ''; } }
function _parseFslToCfg(fsl){ try{ const b64=fsl.replace(/-/g,'+').replace(/_/g,'/'); const raw=Utilities.base64Decode(b64); return JSON.parse(Utilities.newBlob(raw).getDataAsString()); }catch(_){ return {}; } }

/* ---------- LICENSES ---------- */
function _licensesSheet(){
  return _sheet(SHEET_LICENSES, ['license_key','owner_email','allowed_domains','quota_total','quota_used','active','createdAt']);
}
function _findLicenseRow(key){
  const sh=_licensesSheet(); const data=sh.getDataRange().getValues();
  const idx=data.findIndex((r,i)=>i>0 && String(r[0])===String(key));
  return { sh, idx, row: idx>0 ? data[idx] : null };
}
function _checkLicense(license_key, originHost){
  if (!license_key) return { ok:false, code:401, err:'no_license' };
  const { sh, idx, row } = _findLicenseRow(license_key);
  if (idx < 0) return { ok:false, code:403, err:'license_not_found' };
  const active = String(row[5]).toUpperCase() !== 'FALSE';
  if (!active) return { ok:false, code:403, err:'license_inactive' };

  // allowlist по доменам (опционально)
  const allow = String(row[2]||'').trim();
  if (allow){
    const list = allow.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    const okDomain = originHost ? list.includes(originHost.toLowerCase()) : true;
    if (!okDomain) return { ok:false, code:403, err:'domain_not_allowed' };
  }
  // квота (опционально)
  const total = Number(row[3]||0) || 0, used = Number(row[4]||0) || 0;
  if (total>0 && used>=total) return { ok:false, code:403, err:'quota_exceeded' };
  return { ok:true, sh, idx, row, total, used };
}
function _incLicenseQuota(lic){ if (!lic || lic.idx<0) return;
  try{ lic.sh.getRange(lic.idx+1, 5).setValue((Number(lic.row[4]||0))+1); }catch(_){}
}
// Утилита для быстрого добавления ключа (выполнить вручную из IDE):
function addLicense(license_key, owner_email, allowed_domains, quota_total, active){
  const sh=_licensesSheet();
  sh.appendRow([ license_key, owner_email||'', allowed_domains||'', quota_total||'', 0, (active!==false), new Date() ]);
}

/* ---------- router ---------- */
function doGet(e){
  const p = e.parameter || {};
  if (String(p.share||'')==='1') return _shareLanding(e); // OG + redirect (не требует лицензии для данного ответа)
  if (p.token){
    // Для статуса требуем лицензию (в URL ?license_key=...)
    const license_key = (p.license_key||'').trim();
    const base = (p.base||'').trim(); // для извлечения домена (необязательно)
    const host = base ? hostFromUrl_(base) : '';
    const lic = _checkLicense(license_key, host);
    if (!lic.ok) return _json({ ok:false, error:lic.err }, lic.code);
    return _status(e); // ok
  }
  return _json({ ok:false, error:'bad_request' }, 400);
}
function hostFromUrl_(url){ try{ return new URL(url).host; }catch(_){ return ''; } }

/* ---------- status API ---------- */
function _status(e){
  const token = (e.parameter.token || '').trim();
  if (!token) return _json({ ok:false, error:'bad_request' }, 400);

  const sh = _sheet(SHEET_OFFERS, [
    'token','title','desc','startISO','dur_min','tz',
    'qty_total','qty_claimed','createdAt','lang',
    'item_name','item_url','item_image','vendor','seller_email'
  ]);
  const data = sh.getDataRange().getValues();
  const row = data.find((r,i)=> i>0 && r[0]===token);
  if (!row) return _json({ ok:true, exists:false, claimed:false, remaining:null });

  const qtyTotal = Number(row[6]||0);
  const qtyClaim = Number(row[7]||0);
  const remaining = Math.max(0, qtyTotal - qtyClaim);
  const claimed = remaining === 0;

  return _json({ ok:true, exists:true, claimed, remaining, qty_total: qtyTotal, qty_claimed: qtyClaim });
}

/* ---------- share landing (OG + redirect) ---------- */
// URL: .../exec?share=1&fsl=<...>&base=<https://host/index.html>&license_key=<KEY>
function _shareLanding(e){
  var fsl  = (e.parameter.fsl  || '').trim();
  var base = (e.parameter.base || '').trim();
  var license_key = (e.parameter.license_key || '').trim();
  if (!fsl || !base) return HtmlService.createHtmlOutput('<meta http-equiv="refresh" content="0;url=/" />');

  // проверим лицензию и host (если задан)
  var host = hostFromUrl_(base);
  var lic = _checkLicense(license_key, host);
  if (!lic.ok){
    // отдаём мини-страницу “License required”, чтобы соцсети всё равно показали что-то внятное
    var html = '<!doctype html><meta charset="utf-8"><title>Offer unavailable</title><meta name="robots" content="noindex"><body>Offer unavailable (license)</body>';
    return HtmlService.createHtmlOutput(html);
  }

  var cfg = _parseFslToCfg(fsl);
  // остаток (если оффер уже инициализирован)
  var remainText = '';
  try{
    const sh = _sheet(SHEET_OFFERS);
    const data = sh.getDataRange().getValues();
    const row = data.find((r,i)=> i>0 && r[0]===cfg.token);
    if (row){
      const qtyTotal = Number(row[6]||0), qtyClaim = Number(row[7]||0);
      const rem = Math.max(0, qtyTotal - qtyClaim);
      remainText = ' · Available: ' + rem + ' / ' + (qtyTotal || cfg.qty || 1);
    }
  }catch(_){}

  var title = (cfg.item_name || cfg.title || 'Offer') + (cfg.vendor ? (' · ' + cfg.vendor) : '');
  var descA = []; if (cfg.desc) descA.push(cfg.desc); if (cfg.start) descA.push('Start: ' + cfg.start + (cfg.tz?(' ('+cfg.tz+')'):''));
  if (cfg.qty) descA.push('Qty: ' + cfg.qty);
  var desc = descA.join(' · ') + remainText;
  var img  = cfg.item_image || '';
  var target = base + '#fsl=' + fsl;

  var html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta property="og:title" content="'+_escapeHtml(title)+'">' +
    '<meta property="og:description" content="'+_escapeHtml(desc)+'">' +
    (img ? '<meta property="og:image" content="'+_escapeHtml(img)+'">' : '') +
    '<meta property="og:type" content="website">' +
    '<meta property="og:url" content="'+_escapeHtml(target)+'">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="'+_escapeHtml(title)+'">' +
    '<meta name="twitter:description" content="'+_escapeHtml(desc)+'">' +
    (img ? '<meta name="twitter:image" content="'+_escapeHtml(img)+'">' : '') +
    '<meta http-equiv="refresh" content="0;url='+_escapeHtml(target)+'">' +
    '<title>'+_escapeHtml(title)+'</title></head><body>' +
    '<a href="'+_escapeHtml(target)+'">Open offer</a>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- claim (POST) ---------- */
function doPost(e){
  let b={}; try{ b = JSON.parse(e.postData.contents||'{}'); }catch(_){}
  const token=(b.token||'').trim(), phone=(b.phone||'').trim(), email=(b.email||'').trim();
  const license_key=(b.license_key||'').trim();
  if (!token || !phone || !email || !license_key) return _json({ ok:false, error:'bad_request' }, 400);

  // Проверка лицензии (хост взять не из заголовка нельзя, поэтому опционально передаём base из клиента)
  const base=(b.base||'').trim(); const host=base?hostFromUrl_(base):'';
  const lic=_checkLicense(license_key, host);
  if (!lic.ok) return _json({ ok:false, error: lic.err }, lic.code);

  const lock = LockService.getScriptLock(); lock.tryLock(5000);
  try{
    const shO = _sheet(SHEET_OFFERS, [
      'token','title','desc','startISO','dur_min','tz',
      'qty_total','qty_claimed','createdAt','lang',
      'item_name','item_url','item_image','vendor','seller_email'
    ]);
    const shC = _sheet(SHEET_CLAIMS, [
      'token','email','phone','code','claimedAt','lang'
    ]);

    const data = shO.getDataRange().getValues();
    let idx = data.findIndex((r,i)=> i>0 && r[0]===token);
    let row;
    if (idx < 0){
      const qtyTotal = Math.max(1, Number(b.qty || 1));
      shO.appendRow([
        token, b.title||'', b.desc||'', b.startISO||'', Number(b.dur||0), b.tz||'',
        qtyTotal, 0, new Date(), (b.lang||'pl'),
        b.item_name||'', b.item_url||'', b.item_image||'', b.vendor||'', (b.seller_email||'')
      ]);
      idx = shO.getLastRow()-1;
      row = shO.getRange(idx+1, 1, 1, 15).getValues()[0];
    } else {
      row = shO.getRange(idx+1, 1, 1, 15).getValues()[0];
    }

    const qtyTotal = Number(row[6]||0);
    const qtyClaim = Number(row[7]||0);
    if (Math.max(0, qtyTotal - qtyClaim) <= 0) return _json({ ok:false, error:'conflict', remaining: 0 }, 409);

    // запись заявки
    const code = _code(8);
    shC.appendRow([ token, email, phone, code, new Date(), (b.lang||row[9]||'pl') ]);
    shO.getRange(idx+1, 8).setValue(qtyClaim + 1);
    const left = Math.max(0, qtyTotal - (qtyClaim+1));

    // письма
    const lang = (b.lang||row[9]||'pl');
    const SUBJ_BUYER = { pl:'Potwierdzenie rezerwacji / FlashOffer', en:'Your reservation confirmation / FlashOffer', de:'Ihre Reservierungsbestätigung / FlashOffer', fr:'Confirmation de réservation / FlashOffer', es:'Confirmación de reserva / FlashOffer' }[lang] || 'Reservation confirmation / FlashOffer';
    const SUBJ_SELLER= { pl:'Sprzedano: nowe zgłoszenie', en:'Sold: new claim', de:'Verkauft: neue Reservierung', fr:'Vendu : nouvelle réservation', es:'Vendido: nueva reserva' }[lang] || 'Sold: new claim';

    const startStr=_fmtDate(row[3], row[5]);
    const itemName=b.item_name || row[10] || (b.title||row[1]||'Offer');
    const vendor  =b.vendor     || row[13] || '';
    const url     =b.item_url   || row[11] || '';
    const qrData  =`FLASH:${token}:${code}`;
    const qrImg   =_qrUrl(qrData);

    const buyerHtml =
      '<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111">' +
      '<h2 style="margin:0 0 8px">'+_escapeHtml(SUBJ_BUYER)+'</h2>' +
      '<p><b>'+_escapeHtml(itemName)+'</b>'+(vendor?(' · '+_escapeHtml(vendor)):'')+'</p>' +
      '<p>'+_escapeHtml(startStr)+' '+(row[5]?'('+_escapeHtml(row[5])+')':'')+'</p>' +
      (url ? '<p><a href="'+_escapeHtml(url)+'">'+_escapeHtml(url)+'</a></p>' : '') +
      '<p><b>Kod / Code:</b> '+_escapeHtml(code)+'</p>' +
      '<p><img alt="QR" src="'+_escapeHtml(qrImg)+'" width="140" height="140"/></p>' +
      '<p>Phone: '+_escapeHtml(_maskPhone(phone))+'</p>' +
      '</div>';
    MailApp.sendEmail({ to: email, name: SENDER_NAME, subject: SUBJ_BUYER, htmlBody: buyerHtml });

    const seller = (b.seller_email || row[14] || '').trim();
    if (seller){
      const sellerHtml =
        '<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111">' +
        '<h2 style="margin:0 0 8px">'+_escapeHtml(SUBJ_SELLER)+'</h2>' +
        '<p><b>'+_escapeHtml(itemName)+'</b>'+(vendor?(' · '+_escapeHtml(vendor)):'')+'</p>' +
        '<p>'+_escapeHtml(startStr)+' '+(row[5]?'('+_escapeHtml(row[5])+')':'')+'</p>' +
        (url ? '<p><a href="'+_escapeHtml(url)+'">'+_escapeHtml(url)+'</a></p>' : '') +
        '<p><b>Kontakt:</b> '+_escapeHtml(email)+' · '+_escapeHtml(_maskPhone(phone))+'</p>' +
        '<p><b>Kod:</b> '+_escapeHtml(code)+'</p>' +
        '<p><b>Pozostało / Remaining:</b> '+left+' z '+qtyTotal+'</p>' +
        '<p>Token: '+_escapeHtml(token)+'</p>' +
        '</div>';
      MailApp.sendEmail({ to: seller, name: SENDER_NAME, subject: SUBJ_SELLER + ' — ' + itemName, htmlBody: sellerHtml });
    }

    // учет квоты
    _incLicenseQuota(lic);

    return _json({ ok:true, remaining: left }, 200);

  } finally {
    try{ LockService.getScriptLock().releaseLock(); }catch(_){}
  }
}
