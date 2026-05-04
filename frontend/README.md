# GPB WhatsApp Booking Extension

Болванка Chrome Extension для локальной панели бронирования поверх WhatsApp Web.

## Разработка

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
```

После сборки откройте `chrome://extensions`, включите Developer mode и выберите `frontend/dist` через Load unpacked.

## Что уже есть

- Manifest V3.
- Content script для `https://web.whatsapp.com/*`.
- Правая resizable-панель бронирования.
- Проверка локального backend по `http://127.0.0.1:8765/api/health`.
