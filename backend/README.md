# GPB WhatsApp Booking Backend

Локальный API для Chrome Extension. Backend использует MongoDB, поэтому его можно запускать локально и потом перенести на сервер без смены модели данных.

## Разработка

```bash
npm install
cp .env.example .env
npm run dev
```

Для локального запуска нужна MongoDB:

```txt
mongodb://127.0.0.1:27017
```

Для сервера или MongoDB Atlas меняется только `.env`:

```txt
MONGODB_URI=mongodb+srv://user:password@cluster.example.mongodb.net
MONGODB_DB_NAME=gpb_whatsapp_booking
OPENAI_API_KEY=...
```

API по умолчанию:

```txt
http://127.0.0.1:8765
```

## Endpoint'ы

- `GET /api/health` - проверка, что backend работает.
- `POST /api/booking/draft` - черновой разбор входящего сообщения.
- `GET /api/rooms` - каталог номеров.
- `PUT /api/rooms/:id` - сохранить номер.
- `POST /api/rooms/:id/media` - загрузить фото или видео.
- `DELETE /api/rooms/:id/media` - удалить фото или видео.

Медиафайлы хранятся локально:

```txt
backend/uploads/rooms/<room-id>/
```

В MongoDB сохраняются только пути к файлам.
