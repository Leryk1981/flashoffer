# FlashOffer Inventory (v1)

## What is this repo?
FlashOffer is a lightweight progressive web app for publishing limited-time offers without a traditional backend, pairing a static frontend (HTML/CSS/JS) with a Google Apps Script + Google Sheets backend for reservation locking and email notifications.

## Readiness score: 2/5
- No package manifest, tooling, or automated gates defined; project runs as static assets only.
- CI is limited to GitHub Pages publishing with no validation or tests.
- Configuration guidance for proxies/Apps Script is manual and lacks local run checks.

## What runs (commands + results)
- Node/package scripts: **none** (no `package.json` present); no install, lint, test, or build commands to execute.

## Documentation map
- `README.md` (root): overview, feature list, deployment via Google Apps Script + GitHub Pages, and basic usage steps.
- `.github/workflows/pages.yml`: describes GitHub Pages deploy workflow (no test/lint).
- No additional docs/README files elsewhere.

## Top documentation gaps
1. No documented local development or testing workflow for the frontend (only production deploy steps).
2. Configuration details for `CONFIG.API_BASE`/proxy and environment expectations are brief and not organized in a dedicated section.
3. No documentation of expected quality gates/CI commands or engineering conventions.

## Next 3 steps
1. Introduce a Node/tooling baseline (package.json) with lint/format/build scripts and document the required Node version.
2. Add CI to run the chosen gates (lint/tests/build) before publishing to Pages.
3. Expand README to include clear local quickstart, configuration matrix (proxy vs Apps Script), and troubleshooting guidance.
