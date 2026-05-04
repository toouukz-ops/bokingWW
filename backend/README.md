# GPB WhatsApp Booking Backend

Локальный API для Chrome Extension.

## Разработка

```bash
npm install
cp .env.example .env
npm run dev
```

API по умолчанию:

```txt
http://127.0.0.1:8765
```

## Endpoint'ы

- `GET /api/health` - проверка, что backend работает.
- `POST /api/booking/draft` - черновой разбор входящего сообщения.

