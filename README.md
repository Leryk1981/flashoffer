FlashOffer — Progressive Web App for Limited-Time Deals
======================================================

FlashOffer is a lightweight PWA that lets you publish flash sales or reservation windows without a traditional backend.  
The UI runs entirely in the browser, while Google Apps Script + Google Sheets handle persistence, locking, and email notifications.

Key Features
------------
- Installable PWA (manifest + service worker) with offline-first UI cache.
- Countdown viewer with timezone support and quantity tracking.
- Multi-language interface (PL, EN, DE, FR, ES) loaded from JSON bundles.
- Google Apps Script backend for locking, confirmation emails, and social previews.
- Automatic link generator: direct customer link + optional share link for social networks.

Repository Layout
-----------------
| Path | Purpose |
| --- | --- |
| `index.html` | Offer setup screen (link generator). |
| `offer.html` | Customer-facing countdown + reservation form. |
| `app.js` | Shared logic, i18n loader, API helpers, and exported `CONFIG`. |
| `styles.css` | Reusable styling for both screens. |
| `manifest.webmanifest` | PWA manifest (name, icons, theme, start URL). |
| `service-worker.js` | Static asset cache for offline load + navigation fallback. |
| `icons/` | PWA icons (192px & 512px). |
| `i18n/*.json` | Language packs for the viewer UI. |
| `Code.gs` | Google Apps Script backend (status + claim endpoints). |
| `.github/workflows/pages.yml` | GitHub Pages deployment workflow. |

Quick Start
-----------
1. **Prepare Google Sheet**  
   - Create a new sheet.  
   - Copy the Spreadsheet ID (between `/d/` and `/edit/`).

2. **Deploy the Google Apps Script backend**  
   - Open https://script.google.com → *New project*.  
   - Replace contents with `Code.gs`, set your `SPREADSHEET_ID`.  
   - Deploy as a Web App (`Deploy → New deployment → Web app`).  
   - Execute as: *Me*. Who has access: *Anyone*.  
   - Copy the Web App URL (`.../exec`) — this is your **Lock URL**.

3. **Configure the front-end**  
   - Open `app.js` and set the `CONFIG` constant:  
     - `API_BASE`: URL of your proxy (recommended) or leave placeholder until ready.  
     - `GAS_EXEC_FALLBACK`: direct Apps Script URL for local/dev use only.  
   - Commit the entire repo to GitHub and push to `main`.  
   - Ensure GitHub Pages is enabled (Settings → Pages → Source → GitHub Actions).

4. **Auto-deploy via GitHub Pages**  
   - Workflow `.github/workflows/pages.yml` publishes everything on each push to `main`.  
   - Your site will be served at `https://<user>.github.io/<repo>/`.

5. **Generate your first offer**  
   - Visit `index.html` on your hosted site.  
   - Fill offer details, quantity, language, Lock URL, License key.  
   - Click **Generate Link**.  
   - Copy:  
     - **Direct link** → `offer.html#fsl=...` for QR codes / landing pages.  
     - **Social link** → proxied Apps Script URL with OG metadata (optional).  
   - Share the direct link with customers; the viewer page loads entirely from cache after first visit.

PWA Behaviour
-------------
- `manifest.webmanifest` registers icons, theme colors, and `offer.html` as start URL.  
- `service-worker.js` precaches core assets (HTML, JS, CSS, icons, i18n) for offline access.  
- Both `index.html` and `offer.html` register the service worker and link the manifest.  
- Lighthouse PWA audits (installability, offline support) target passing scores ≥90.

Backend Interactions
--------------------
- Viewer fetches status and submits claims via `CONFIG.API_BASE` (`/status`, `/claim`).  
- If no proxy is configured, the app falls back to the Lock URL or `GAS_EXEC_FALLBACK`, including required `license_key` and `base` parameters.  
- Offline mode still allows rendering and form submission; claims queue locally until connectivity returns (manual refresh).

Email Workflow
--------------
| Event | Recipient | Content |
| --- | --- | --- |
| New reservation | Customer | Confirmation with claim code + QR. |
|  | Seller | Buyer contact, code, remaining quantity. |

Emails send via `MailApp.sendEmail()` from the account that owns the Apps Script deployment.  
Daily quotas: ~100/day (consumer Gmail) up to ~1500/day (Workspace).

Data Stored in Google Sheets
----------------------------
**offers sheet**
- `token`, `title`, `desc`, `startISO`, `dur_min`, `tz`, `qty_total`, `qty_claimed`
- `lang`, `item_name`, `item_url`, `item_image`, `vendor`
- `seller_email`, `license_key`

**claims sheet**
- `token`, `email`, `code`, `claimedAt`, `lang`

Social Link Mechanics
---------------------
- Direct link: `https://<user>.github.io/<repo>/offer.html#fsl=...` (base64url config in `#hash`).  
- Social link (optional): `https://<proxy or GAS>/exec?share=1&fsl=...&base=...` serves OG meta for Facebook/Instagram/X/Telegram before redirecting users to the direct link.

Limits
------
| Resource | Free Gmail | Workspace |
| --- | --- | --- |
| Emails per day | ~100 | ~1500 |
| Apps Script runtime | 90 minutes | 6+ hours |
| Sheets limit | 10M cells | same |
| Practical traffic | ~5k reservations/day | higher |

License
-------
Apache-2.0 © 2025 — created by Leryk.
