# FlashOffer — PWA для обмежених пропозицій

## Статус і призначення
- Легкий фронтенд без бекенду, який працює з Google Apps Script + Google Sheets для бронювання та листів.
- Офлайн-кеш через `service-worker.js` і `manifest.webmanifest`, підтримка кількох мов у `i18n`.
- Розгортання на GitHub Pages з автоматичним публікуванням.

## Швидкий старт
1. Встановіть Node.js 18+.
2. Виконайте інсталяцію:
   ```bash
   npm ci
   ```
3. Запустіть локальний сервер і відкрийте сторінки:
   ```bash
   npm run dev
   ```
   - Генератор посилань: http://localhost:4173/index.html
   - Перегляд пропозиції: http://localhost:4173/offer.html

## Посилання
- Детальні інструкції англійською: `README.md`.
- Інвентаризація репозиторію: `docs/inventory/INVENTORY_FLASHOFFER_REPO_v1.md`.
