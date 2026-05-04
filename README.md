# GPB WhatsApp Web Booking

Локальный инструмент для бронирования номеров через WhatsApp Web.

Структура:

- `frontend` - Chrome Extension поверх WhatsApp Web.
- `backend` - локальный API, база SQLite, интеграция с OpenAI.

## Быстрый запуск расширения

```bash
npm run install:all
npm run build
```

Потом откройте `chrome://extensions`, включите Developer mode и выберите `frontend/dist` через Load unpacked.

Каталог номеров сохраняется локально внутри расширения и дополнительно может сохраняться через backend в MongoDB. Backend нужен для OpenAI, бронирования, общей базы и будущего удаленного управления.

Публикация в Chrome Web Store пока не планируется. Расширение будет устанавливаться вручную через `chrome://extensions` в режиме разработчика.
