export const CONFIG = {
  API_BASE: 'https://<your-pages-domain>/api',
  GAS_EXEC_FALLBACK: 'https://script.google.com/macros/s/XXX/exec'
};

const STORAGE_KEY = 'flashoffer:last';
const HASH_PREFIX = 'fsl=';
const DEFAULT_LANG = 'en';
const LANG_CACHE = new Map();

const pad = (n) => String(n).padStart(2, '0');
const b64u = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const ub64 = (value) => {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

const toLocalInputValue = (value) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const resolveBase = (input) => {
  if (
    !input ||
    /<.*>/.test(input) ||
    input.includes('your-pages-domain') ||
    input.includes('XXX')
  ) {
    return null;
  }
  try {
    return new URL(input, window.location.href);
  } catch (_err) {
    return null;
  }
};

const resolveEndpoint = (baseUrl, endpoint) => {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl.toString());
    const prefix = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    url.pathname = prefix + endpoint.replace(/^\//, '');
    url.search = '';
    url.hash = '';
    return url;
  } catch (_err) {
    return null;
  }
};

const makeICS = ({ title, desc, startISO, dur }) => {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + dur * 60000);
  const stamp = (date) =>
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(
      date.getUTCHours()
    )}${pad(date.getUTCMinutes())}00Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FlashOffer//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@flashoffer`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${(title || 'Offer').replace(/\n/g, ' ')}`,
    ...(desc ? [`DESCRIPTION:${desc.replace(/\n/g, ' ')}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
};

const fmtRange = (startISO, durMin, tz, lang) => {
  try {
    const start = new Date(startISO);
    const end = new Date(start.getTime() + durMin * 60000);
    const locale = (lang || DEFAULT_LANG) + '-' + (lang || DEFAULT_LANG).toUpperCase();
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${formatter.format(start)} → ${formatter.format(end)} (${tz})`;
  } catch (_err) {
    return `${startISO} (${tz})`;
  }
};

const safeJSON = (value, fallback = null) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (_err) {
    return fallback;
  }
};

const formatTemplate = (template, params = {}) =>
  typeof template === 'string'
    ? template.replace(/\{(\w+)\}/g, (_m, key) => (key in params ? params[key] : ''))
    : template;

const loadLanguage = async (lang) => {
  if (LANG_CACHE.has(lang)) return LANG_CACHE.get(lang);
  const response = await fetch(`./i18n/${lang}.json`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`cannot load ${lang}`);
  }
  const data = await response.json();
  LANG_CACHE.set(lang, data);
  return data;
};

const getTranslator = async (lang) => {
  const fallback = await loadLanguage(DEFAULT_LANG);
  let pack = fallback;
  if (lang && lang !== DEFAULT_LANG) {
    try {
      const extra = await loadLanguage(lang);
      pack = { ...fallback, ...extra };
    } catch (_err) {
      pack = fallback;
    }
  }
  const translate = (key, params) => {
    const template = pack[key] ?? fallback[key] ?? key;
    return formatTemplate(template, params);
  };
  translate.pack = pack;
  return translate;
};

export const encodeConfig = (config) => HASH_PREFIX + b64u(JSON.stringify(config));

export const decodeHash = (hashValue) => {
  if (!hashValue) return null;
  const clean = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue;
  if (!clean.startsWith(HASH_PREFIX)) return null;
  const payload = clean.slice(HASH_PREFIX.length);
  try {
    return JSON.parse(ub64(payload));
  } catch (_err) {
    return null;
  }
};

export const parseOfferFromHash = (hashValue = window.location.hash) =>
  decodeHash(hashValue);

const buildShareLink = (cfg, hash) => {
  const lock = cfg.lockurl?.trim();
  if (!lock) return null;
  try {
    const base = new URL(lock, window.location.href);
    base.search = '';
    base.hash = '';
    const params = new URLSearchParams({
      share: '1',
      fsl: hash.slice(HASH_PREFIX.length),
      base: window.location.href.split('#')[0]
    });
    if (cfg.license_key) params.append('license_key', cfg.license_key);
    base.search = params.toString();
    return base.toString();
  } catch (_err) {
    return null;
  }
};

export const initSetupPage = () => {
  const $ = (id) => document.getElementById(id);
  const saved = safeJSON(localStorage.getItem(STORAGE_KEY)) || {};

  const assignValue = (id, value) => {
    const el = $(id);
    if (!el) return;
    if (value === undefined || value === null || value === '') return;
    el.value = value;
  };

  const defaults = {
    title: 'Special Offer',
    desc: '',
    item_name: '',
    item_url: '',
    item_image: '',
    vendor: '',
    start: toLocalInputValue(saved.start || Date.now() + 15 * 60000),
    dur: saved.dur || 30,
    tz: saved.tz || 'Europe/Warsaw',
    qty: saved.qty || 1,
    lang: saved.lang || DEFAULT_LANG,
    seller_email: saved.seller_email || '',
    lockurl: saved.lockurl || '',
    license_key: saved.license_key || ''
  };

  assignValue('title', saved.title ?? defaults.title);
  assignValue('desc', saved.desc ?? defaults.desc);
  assignValue('item_name', saved.item_name ?? defaults.item_name);
  assignValue('item_url', saved.item_url ?? defaults.item_url);
  assignValue('item_image', saved.item_image ?? defaults.item_image);
  assignValue('vendor', saved.vendor ?? defaults.vendor);
  assignValue('start', defaults.start);
  assignValue('dur', saved.dur ?? defaults.dur);
  assignValue('tz', defaults.tz);
  assignValue('qty', saved.qty ?? defaults.qty);
  assignValue('lang', defaults.lang);
  assignValue('seller_email', defaults.seller_email);
  assignValue('lockurl', defaults.lockurl);
  assignValue('license_key', defaults.license_key);

  const readConfig = () => {
    const startInput = $('start').value;
    const start = startInput ? new Date(startInput) : new Date();
    return {
      title: $('title').value.trim(),
      desc: $('desc').value.trim(),
      item_name: $('item_name').value.trim(),
      item_url: $('item_url').value.trim(),
      item_image: $('item_image').value.trim(),
      vendor: $('vendor').value.trim(),
      start: start.toISOString(),
      dur: Math.max(5, parseInt($('dur').value || '30', 10)),
      tz: $('tz').value,
      qty: Math.max(1, parseInt($('qty').value || '1', 10)),
      lang: $('lang').value || DEFAULT_LANG,
      seller_email: $('seller_email').value.trim(),
      lockurl: $('lockurl').value.trim(),
      license_key: $('license_key').value.trim(),
      token: randomToken()
    };
  };

  const linkOutput = $('link');
  const socialOutput = $('link_social');
  const outBox = $('out');

  const buildDirectLink = (hashValue) => {
    const target = new URL('offer.html', window.location.href);
    target.hash = hashValue;
    return target.toString();
  };

  $('gen').addEventListener('click', () => {
    const cfg = readConfig();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    const hashValue = encodeConfig(cfg);
    const direct = buildDirectLink(hashValue);
    linkOutput.value = direct;
    const share = buildShareLink(cfg, hashValue);
    socialOutput.value = share || direct;
    outBox.classList.remove('hid');
  });

  $('preview').addEventListener('click', () => {
    const cfg = readConfig();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    const hashValue = encodeConfig(cfg);
    const direct = buildDirectLink(hashValue);
    window.open(direct, '_blank', 'noopener');
  });

  $('copy').addEventListener('click', async () => {
    const value = linkOutput.value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (_err) {
      linkOutput.select();
    }
  });

  $('open').addEventListener('click', () => {
    const value = linkOutput.value;
    if (value) window.location.href = value;
  });

  const copySocial = $('copy_social');
  if (copySocial) {
    copySocial.addEventListener('click', async () => {
      const value = socialOutput.value;
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
      } catch (_err) {
        socialOutput.select();
      }
    });
  }
};

export const initOfferPage = async () => {
  const cfg = parseOfferFromHash();
  const $ = (id) => document.getElementById(id);
  const viewer = $('viewer');
  const errorBox = $('error');

  if (!cfg) {
    if (viewer) viewer.classList.add('hid');
    if (errorBox) {
      errorBox.textContent = 'Missing or invalid offer payload.';
      errorBox.classList.remove('hid');
    }
    return;
  }

  document.documentElement.lang = cfg.lang || DEFAULT_LANG;
  document.title = `FlashOffer · ${cfg.title || 'Offer'}`;

  const translate = await getTranslator(cfg.lang || DEFAULT_LANG);

  const status = $('status');
  const statusSpan = status?.querySelector('span');
  const stock = $('stock');
  const timer = $('timer');
  const claimBox = $('claimBox');
  const emailInput = $('email');
  const claimButton = $('claim');
  const icsButton = $('ics');
  const lblEmail = $('lbl_email');
  const itemCard = $('itemCard');
  const itemImg = $('itemImg');
  const itemName = $('itemName');
  const itemVendor = $('itemVendor');
  const itemHost = $('itemHost');
  const openItem = $('openItem');
  const titleNode = $('v_title');
  const descNode = $('v_desc');
  const rangeNode = $('range');

  if (lblEmail) lblEmail.textContent = translate('emailLabel');
  if (claimButton) claimButton.textContent = translate('reserve');
  if (icsButton) icsButton.textContent = translate('addToCal');
  if (openItem) openItem.textContent = translate('open');

  let reserved = false;
  let remaining = null;
  let tickId = null;
  let pollId = null;

  const showReserved = () => {
    reserved = true;
    claimBox?.classList.add('hid');
    if (status) status.className = 'pill bad';
    if (statusSpan) statusSpan.textContent = translate('reserved');
    if (timer) timer.textContent = translate('reserved').toUpperCase();
    if (tickId) clearInterval(tickId);
    if (pollId) clearInterval(pollId);
  };

  const showSoldOut = () => {
    reserved = true;
    claimBox?.classList.add('hid');
    if (status) status.className = 'pill bad';
    if (statusSpan) statusSpan.textContent = translate('soldOut');
    if (timer) timer.textContent = translate('soldOut').toUpperCase();
    if (tickId) clearInterval(tickId);
    if (pollId) clearInterval(pollId);
  };

  const setStock = (value) => {
    const normalized = Number.isFinite(Number(value)) ? Number(value) : 0;
    remaining = normalized;
    if (stock) stock.textContent = translate('remaining', { n: normalized });
    if (normalized <= 0) showSoldOut();
  };

  const hostFrom = (url) => {
    try {
      return new URL(url).host;
    } catch (_err) {
      return '';
    }
  };

  const renderItemCard = () => {
    const hasData = cfg.item_url || cfg.item_name || cfg.item_image || cfg.vendor;
    if (!hasData) {
      itemCard?.classList.add('hid');
      return;
    }
    itemCard?.classList.remove('hid');
    if (itemName) itemName.textContent = cfg.item_name || cfg.title || 'Offer';
    if (itemVendor) {
      itemVendor.textContent = cfg.vendor || '';
      itemVendor.style.display = cfg.vendor ? 'block' : 'none';
    }
    const host = cfg.item_url ? hostFrom(cfg.item_url) : '';
    if (itemHost) {
      itemHost.textContent = host;
      itemHost.style.display = host ? 'block' : 'none';
    }
    if (itemImg) {
      if (cfg.item_image) {
        itemImg.src = cfg.item_image;
        itemImg.style.display = 'block';
      } else {
        itemImg.removeAttribute('src');
        itemImg.style.display = 'none';
      }
    }
    if (openItem) {
      if (cfg.item_url) {
        openItem.style.display = 'block';
        openItem.onclick = () => window.open(cfg.item_url, '_blank', 'noopener');
      } else {
        openItem.style.display = 'none';
      }
    }
  };

  const start = new Date(cfg.start).getTime();
  const end = start + cfg.dur * 60000;

  const formatLeft = (ms) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  };

  const tick = () => {
    if (reserved) return;
    const now = Date.now();
    if (now < start) {
      if (status) status.className = 'pill warn';
      if (statusSpan) statusSpan.textContent = translate('notStarted');
      if (timer) timer.textContent = formatLeft(start - now);
      claimBox?.classList.add('hid');
    } else if (now <= end) {
      if (status) status.className = 'pill ok';
      if (statusSpan) statusSpan.textContent = translate('active');
      if (timer) timer.textContent = `-${formatLeft(end - now)}`;
      claimBox?.classList.remove('hid');
    } else {
      if (status) status.className = 'pill bad';
      if (statusSpan) statusSpan.textContent = translate('ended');
      if (timer) timer.textContent = '00:00:00';
      claimBox?.classList.add('hid');
    }
  };

  const baseHref = window.location.href.split('#')[0];

  const apiBase = resolveBase(CONFIG.API_BASE);
  const gasFallback = resolveBase(CONFIG.GAS_EXEC_FALLBACK);

  const fetchStatus = async () => {
    if (!cfg.lockurl && !apiBase && !gasFallback) {
      setStock(Number(cfg.qty || 1));
      return;
    }
    const params = new URLSearchParams({ token: cfg.token, base: baseHref });
    if (cfg.license_key) params.append('license_key', cfg.license_key);
    const targets = [];

    const apiStatusUrl = resolveEndpoint(apiBase, 'status');
    if (apiStatusUrl) {
      apiStatusUrl.search = params.toString();
      targets.push(apiStatusUrl);
    }

    if (cfg.lockurl) {
      try {
        const direct = new URL(cfg.lockurl, window.location.href);
        direct.search = params.toString();
        direct.hash = '';
        targets.push(direct);
      } catch (_err) {
        /* ignore */
      }
    }

    if (gasFallback && (!cfg.lockurl || cfg.lockurl === CONFIG.GAS_EXEC_FALLBACK)) {
      const fallbackUrl = new URL(gasFallback.toString());
      fallbackUrl.search = params.toString();
      fallbackUrl.hash = '';
      targets.push(fallbackUrl);
    }

    for (const target of targets) {
      try {
        const response = await fetch(target.toString(), { method: 'GET' });
        if (!response.ok) continue;
        const json = await response.json();
        if (json.exists) {
          setStock(Number(json.remaining ?? cfg.qty ?? 1));
          if (json.claimed) showSoldOut();
        } else {
          setStock(Number(cfg.qty || 1));
        }
        return;
      } catch (_err) {
        continue;
      }
    }
    setStock(Number(cfg.qty || 1));
  };

  const sendClaim = async () => {
    const now = Date.now();
    if (now < start || now > end) {
      claimButton.disabled = false;
      return;
    }

    const payload = {
      token: cfg.token,
      email: emailInput.value.trim(),
      title: cfg.title,
      desc: cfg.desc,
      startISO: cfg.start,
      dur: cfg.dur,
      tz: cfg.tz,
      qty: cfg.qty,
      lang: cfg.lang,
      item_name: cfg.item_name,
      item_url: cfg.item_url,
      item_image: cfg.item_image,
      vendor: cfg.vendor,
      seller_email: cfg.seller_email,
      license_key: cfg.license_key,
      base: baseHref
    };

    const targets = [];

    const apiClaimUrl = resolveEndpoint(apiBase, 'claim');
    if (apiClaimUrl) {
      targets.push({ url: apiClaimUrl.toString(), method: 'POST' });
    }

    if (cfg.lockurl) {
      try {
        const direct = new URL(cfg.lockurl, window.location.href);
        targets.push({ url: direct.toString(), method: 'POST' });
      } catch (_err) {
        /* ignore */
      }
    }

    if (gasFallback && (!cfg.lockurl || cfg.lockurl === CONFIG.GAS_EXEC_FALLBACK)) {
      targets.push({ url: gasFallback.toString(), method: 'POST' });
    }

    for (const target of targets) {
      try {
        const response = await fetch(target.url, {
          method: target.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (response.status === 409) {
          await fetchStatus();
          return;
        }
        if (!response.ok) continue;
        const json = await response.json();
        if (json.ok) {
          const next = Number(json.remaining ?? Math.max(0, (remaining ?? cfg.qty ?? 1) - 1));
          setStock(next);
          if (next <= 0) showSoldOut();
          else showReserved();
          return;
        }
      } catch (_err) {
        continue;
      }
    }

    // offline fallback
    const left = Math.max(0, (remaining ?? Number(cfg.qty || 1)) - 1);
    setStock(left);
    if (left <= 0) {
      showSoldOut();
    } else {
      showReserved();
    }
  };

  const required = [];
  if (!cfg.lockurl && !resolveBase(CONFIG.API_BASE) && !resolveBase(CONFIG.GAS_EXEC_FALLBACK)) {
    // allow offline mode without lock url
  } else {
    if (!cfg.lockurl && !resolveBase(CONFIG.API_BASE)) required.push('Lock URL');
    if (!cfg.license_key) required.push('License key');
  }

  if (required.length) {
    claimBox?.classList.add('hid');
    if (status) status.className = 'pill bad';
    if (statusSpan) statusSpan.textContent = translate('unavailable', { items: required.join(' + ') });
    if (timer) timer.textContent = '—';
    return;
  }

  renderItemCard();
  if (titleNode) titleNode.textContent = cfg.title || 'Offer';
  if (descNode) {
    descNode.textContent = cfg.desc || '';
    descNode.style.display = cfg.desc ? 'block' : 'none';
  }
  if (rangeNode) rangeNode.textContent = fmtRange(cfg.start, cfg.dur, cfg.tz || 'Europe/Warsaw', cfg.lang || DEFAULT_LANG);

  tick();
  tickId = setInterval(tick, 1000);
  await fetchStatus();
  pollId = setInterval(fetchStatus, 5000);

  claimButton?.addEventListener('click', async () => {
    if (!emailInput) return;
    const email = emailInput.value.trim();
    if (!email) {
      alert(translate('enterEmail'));
      return;
    }
    claimButton.disabled = true;
    try {
      await sendClaim();
    } finally {
      claimButton.disabled = false;
    }
  });

  icsButton?.addEventListener('click', () => {
    const href = makeICS({
      title: cfg.title,
      desc: cfg.desc,
      startISO: cfg.start,
      dur: cfg.dur
    });
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'flashoffer.ics';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
};
