FlashOffer — Universal Discount & Reservation App (No-Backend)

FlashOffer is a small, self-contained web app that lets anyone publish limited-time offers or booking slots — without any backend or database.
It runs entirely in the browser and uses Google Apps Script + Google Sheets as a lightweight backend for storage, locking, and email notifications.

✨ Features

🕒 Timed offers with live countdown and timezone support

📦 Quantity tracking (e.g., 5 items left)

🌍 Multi-language UI — Polish, English, German, French, Spanish

📧 Two-sided email notifications

Customer receives confirmation + code + QR

Seller receives notification + buyer contact + remaining quantity

📱 Responsive & mobile-friendly layout

🔒 No login, no backend — everything works via Google Sheets + Apps Script

🔗 Auto-generated social link with OpenGraph preview for Facebook / Instagram / X / Telegram

🧩 Architecture
Component	Purpose
index.html	Front-end PWA-style web page (runs locally or hosted anywhere)
Code.gs	Google Apps Script backend (REST endpoint + email logic)
Google Sheets	Lightweight storage for offers (offers) and claims (claims)
Apps Script Web App URL	Used as “Lock URL” in the front-end
🚀 Setup Guide
1️⃣ Prepare Google Sheet

Create a new Google Sheet.

Copy its Spreadsheet ID from the URL (the part between /d/ and /edit).

You don’t need to create any columns — the script will do this automatically.

2️⃣ Create the Google Apps Script backend

Go to https://script.google.com/
, click New project.

Replace the contents of Code.gs with the provided full version from this repo.

Set your SPREADSHEET_ID at the top of the file.

Click Deploy → New deployment → Web app

Execute as: Me

Who has access: Anyone

Click Deploy, copy the Web App URL (it ends with /exec).
This will be your Lock URL.

3️⃣ Host the front-end

Upload index.html and README.md to a GitHub repository.

Enable GitHub Pages for this repo (Settings → Pages → Source → main branch → /root).

Your app will be available at
https://<your-github-username>.github.io/<repo-name>/index.html

4️⃣ Generate your first offer

Open your hosted index.html in a browser.

Fill out:

Offer title and description

Product name, image, URL, quantity

Start time, duration, timezone

Seller email (for notifications)

Lock URL (your Apps Script /exec URL)

Click Generate link.

Copy either:

Direct link — the hash link for QR codes or websites

Social link — for Facebook, Instagram, Telegram (includes OpenGraph preview)

Share it anywhere!

💌 Email Workflow
Event	Recipient	Content
New reservation / purchase	Customer	Confirmation with code + QR
	Seller	Buyer contact, code, remaining quantity

Emails are sent via MailApp.sendEmail() from the account that owns the Apps Script project.
Typical daily limits: ~100/day for free Gmail, ~1500/day for Workspace accounts.

🗂 Data stored in Google Sheets
offers sheet
Column	Description
token	unique offer ID
title	offer title
desc	description
startISO	start date/time
dur_min	duration (minutes)
tz	timezone
qty_total / qty_claimed	total vs. claimed count
lang	interface language
item_name / item_url / item_image / vendor	product info
seller_email	notification target
claims sheet
Column	Description
token	offer ID
email	customer email
code	confirmation code
claimedAt	timestamp
lang	language for this claim
🧠 How social previews work

When you generate an offer, two links are created:

Direct link → index.html#fsl=... (opens instantly)

Social link → https://script.google.com/macros/s/.../exec?share=1&fsl=...&base=...

Social networks fetch this one to read the OpenGraph meta (title, image, description).

Real users are automatically redirected to the index.html version.

So you can safely use the Social link everywhere — it both previews nicely and opens the app.

🧰 Tech stack

Front-end: pure HTML + JS (no framework)

Backend: Google Apps Script (serverless)

Storage: Google Sheets

Emails: Gmail API via MailApp

Hosting: GitHub Pages or any static host

QR generation: api.qrserver.com

⚠️ Limits
Resource	Free Gmail	Workspace
Emails/day	~100	~1500
Script run-time/day	90 minutes	6 hours+
Rows in Sheet	10 million cells	same
Typical safe traffic	up to ~5k reservations/day	higher
🧑‍💻 License

Apache-2.0 © 2025 — created by Leryk
