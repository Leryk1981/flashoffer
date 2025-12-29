# FlashOffer — Progressive Web App for Limited-Time Deals

## Status & purpose
- Single-page PWA for publishing flash sales or reservation windows without a traditional backend.
- Static frontend (HTML/CSS/JS) paired with Google Apps Script + Google Sheets for persistence, locking, and email notifications.
- Installable with offline caching via `service-worker.js` and `manifest.webmanifest`.
- Multi-language viewer (PL, EN, DE, FR, ES) loaded from JSON bundles in `/i18n`.
- Generates customer-facing links plus optional social preview links.
- Designed for small teams to host on GitHub Pages with minimal operational overhead.

## Requirements
- Node.js **18+** (CI uses Node 20).
- Modern browser for PWA testing.
- Google account to deploy the Apps Script backend + target Spreadsheet ID.

## Quickstart (local run)
1. Install tooling (no dependencies are fetched, but this aligns with CI):
   ```bash
   npm ci
   ```
2. Start the static dev server:
   ```bash
   npm run dev
   ```
3. Open the UI:
   - Offer generator: http://localhost:4173/index.html
   - Customer viewer: http://localhost:4173/offer.html
4. Stop the server with `Ctrl+C`.

## Configuration
- Frontend configuration lives in `app.js` (`CONFIG.API_BASE` for your proxy/API base, `CONFIG.GAS_EXEC_FALLBACK` for the direct Apps Script URL).
- Language packs are stored in `i18n/*.json`.
- PWA assets: `manifest.webmanifest`, `icons/`, and `service-worker.js` (precache list and navigation fallback).
- Backend logic lives in `Code.gs`; set `SPREADSHEET_ID` and deploy it as a Web App (`/exec`).

## Quality gates (local & CI)
Run the same commands locally that CI executes:
```bash
npm ci
npm run validate --if-present
npm run lint --if-present
npm test --if-present
npm run build --if-present
```
_Currently only the install step runs substantive work; validation/lint/test/build hooks are placeholders until tooling is added._

## Deployment notes
- Pushing to `main` triggers GitHub Pages via `.github/workflows/pages.yml` and publishes the static site.
- Update `CONFIG` values before deploying so the viewer points at your proxy or Apps Script endpoint.
- If you change the base path, ensure `manifest.webmanifest` and service worker scope still match your hosted URL.

## Repository layout
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
| `.github/workflows/ci.yml` | CI workflow running the same gates listed above. |
| `docs/inventory/INVENTORY_FLASHOFFER_REPO_v1.md` | Repository inventory report. |
| `scripts/dev-server.mjs` | Minimal static dev server for local previews. |
