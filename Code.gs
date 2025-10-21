/***** FLASHOFFER · APPS SCRIPT BACKEND (ONE-FILE) *****
 * Вставь этот файл в Apps Script проект, замени SPREADSHEET_ID.
 * Deploy → Web app: Execute as: Me, Who has access: Anyone.
 ******************************************************/

/* ====== SETTINGS ====== */
const SPREADSHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE'; // <-- ВСТАВЬ ID ТАБЛИЦЫ
const SHEET_OFFERS   = 'offers';
const SHEET_CLAIMS   = 'claims';
const SENDER_NAME    = 'FlashOffer'; // подпись в письмах
/* ====================== */

/* ========== UTILS ========== */
function _sheet(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (headers && sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}
function _json(obj, code) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
    .setResponseCode(code || 200);
}
function _maskPhone(p) { return String(p||'').replace(/\D/g,'').replace(/.(?=....)/g,'•'); }
function _code(n=8) { const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<n;i++) s+=a[(Math.random()*a.length)|0]; return s; }
function _qrUrl(text) { return 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(text); }
function _escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function _fmtDate(iso, tz){
  try{ const d=new Date(iso); return Utilities.formatDate(d, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }
  catch(_){ return iso || ''; }
}
function _parseFslToCfg(fsl){ // base64url JSON → object
  try {
    const b64 = String(fsl||'').replace(/-/g,'+').replace(/_/g,'/');
    const raw = Utilities.base64Decode(b64);
    return JSON.parse(Utilities.newBlob(raw).getDataAsString());
  } catch(_) { return {}; }
}
/* ========================== */

/* ========== ROUTER ========== */
function doGet(e){
  const p = e.parameter || {};
  if (String(p.share||'') === '1') return _shareLanding(e);   // соц-превью + редирект
  if (p.token)                         return _status(e);      // статус оффера
  return _json({ ok:false, error:'bad_request' }, 400);
}
/* ============================ */

/* ========== STATUS (API для index.html) ========== */
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
/* ================================================= */

/* ========== SHARE LANDING (OG превью + redirect) ========== */
/* URL: .../exec?share=1&fsl=<base64url-json>&base=<https://host/index.html> */
function _shareLanding(e){
  var fsl  = (e.parameter.fsl  || '').trim();
  var base = (e.parameter.base || '').trim();
  if (!fsl || !base) {
    return HtmlService.createHtmlOutput('<meta http-equiv="refresh" content="0;url=/" />');
  }
  var cfg = _parseFslToCfg(fsl);

  // Попробуем подтянуть текущий остаток из таблицы (если оффер уже инициализировался)
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
  var descA = [];
  if (cfg.desc) descA.push(cfg.desc);
  if (cfg.start) descA.push('Start: ' + cfg.start + (cfg.tz?(' ('+cfg.tz+')'):''));
  if (cfg.qty) descA.push('Qty: ' + cfg.qty);
  var desc = descA.join(' · ') + remainText;
  var img  = cfg.item_image || '';
  var target = base + '#fsl=' + fsl;

  var html =
    '<!doctype html><html><head>' +
    '<meta charset="utf-8">' +
    // OpenGraph
    '<meta property="og:title" content="'+_escapeHtml(title)+'">' +
    '<meta property="og:description" content="'+_escapeHtml(desc)+'">' +
    (img ? '<meta property="og:image" content="'+_escapeHtml(img)+'">' : '') +
    '<meta property="og:type" content="website">' +
    '<meta property="og:url" content="'+_escapeHtml(target)+'">' +
    // Twitter Card
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="'+_escapeHtml(title)+'">' +
    '<meta name="twitter:description" content="'+_escapeHtml(desc)+'">' +
    (img ? '<meta name="twitter:image" content="'+_escapeHtml(img)+'">' : '') +
    // redirect
    '<meta http-equiv="refresh" content="0;url='+_escapeHtml(target)+'">' +
    '<title>'+_escapeHtml(title)+'</title></head><body>' +
    '<a href="'+_escapeHtml(target)+'">Open offer</a>' +
    '</body></html>';

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/* ========================================================== */

/* ========== POST (бронь + письма) ========== */
function doPost(e){
  let b={}; try{ b = JSON.parse(e.postData.contents||'{}'); }catch(_){}
  const token=(b.token||'').trim();
  const phone=(b.phone||'').trim();
  const email=(b.email||'').trim();
  if (!token || !phone || !email) return _json({ ok:false, error:'bad_request' }, 400);

  const lock = LockService.getScriptLock();
  lock.tryLock(5000); // защита от гонок
  try{
    const shO = _sheet(SHEET_OFFERS, [
      'token','title','desc','startISO','dur_min','tz',
      'qty_total','qty_claimed','createdAt','lang',
      'item_name','item_url','item_image','vendor','seller_email'
    ]);
    const shC = _sheet(SHEET_CLAIMS, [
      'token','email','phone','code','claimedAt','lang'
    ]);

    // Найдём (или создадим) строку оффера по token
    const data = shO.getDataRange().getValues();
    let idx = data.findIndex((r,i)=> i>0 && r[0]===token);
    let row;
    if (idx < 0){
      // первая бронь → инициализируем оффер данными из запроса
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
    const remaining = Math.max(0, qtyTotal - qtyClaim);
    if (remaining <= 0) return _json({ ok:false, error:'conflict', remaining: 0 }, 409);

    // Запишем бронь
    const code = _code(8);
    shC.appendRow([ token, email, phone, code, new Date(), (b.lang||row[9]||'pl') ]);
    shO.getRange(idx+1, 8).setValue(qtyClaim + 1); // qty_claimed++

    const left = Math.max(0, qtyTotal - (qtyClaim+1));

    // --- Письмо покупателю ---
    const lang = (b.lang||row[9]||'pl');
    const SUBJ_BUYER = {
      pl: 'Potwierdzenie rezerwacji / FlashOffer',
      en: 'Your reservation confirmation / FlashOffer',
      de: 'Ihre Reservierungsbestätigung / FlashOffer',
      fr: 'Confirmation de réservation / FlashOffer',
      es: 'Confirmación de reserva / FlashOffer'
    }[lang] || 'Reservation confirmation / FlashOffer';

    const startStr = _fmtDate(row[3], row[5]);
    const itemName = b.item_name || row[10] || (b.title||row[1]||'Offer');
    const vendor   = b.vendor     || row[13] || '';
    const url      = b.item_url   || row[11] || '';
    const qrData   = `FLASH:${token}:${code}`;
    const qrImg    = _qrUrl(qrData);

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

    // --- Письмо продавцу (если указан e-mail) ---
    const SUBJ_SELLER = {
      pl: 'Sprzedano: nowe zgłoszenie',
      en: 'Sold: new claim',
      de: 'Verkauft: neue Reservierung',
      fr: 'Vendu : nouvelle réservation',
      es: 'Vendido: nueva reserva'
    }[lang] || 'Sold: new claim';

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

    return _json({ ok:true, remaining: left }, 200);

  } finally {
    try{ lock.releaseLock(); }catch(_){}
  }
}
/* =============================================== */
