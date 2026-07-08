import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { stat } from "node:fs/promises";
import {
  claimActiveDialogData,
  deleteReservationData,
  deleteChatDraftData,
  deleteRoomHoldData,
  getChatDraftById,
  getChatDraftData,
  listChatMessageDialogs,
  listChatMessages,
  listAiReplyLogs,
  getPaymentSettingsData,
  listActiveDialogs,
  listExpenseCategories,
  listExpenseEntries,
  listReservations,
  listRoomHolds,
  releaseActiveDialogData,
  replaceChatDraftData,
  replaceExpenseCategories,
  replaceExpenseEntries,
  replaceReservations,
  saveChatDraftData,
  saveAiReplyLogData,
  saveChatMessagesData,
  savePaymentSettingsData,
  saveReservationData,
  saveRoomHoldData
} from "./appData.js";
import { exportServerBackup, importServerBackup } from "./backup.js";
import { createStubDraft, bookingDraftRequestSchema } from "./booking.js";
import { config } from "./config.js";
import { closeDatabase, connectDatabase } from "./db.js";
import { deleteGuestContact, guestContactSchema, listGuestContacts, saveGuestContact } from "./guestContacts.js";
import { cropPhotoFile, deleteMediaFile, ensureWhatsappVideoFile, getLocalUploadPath, saveRoomMediaFile, uploadsRoot } from "./media.js";
import { getMediaContentType, getStoredMedia, openStoredMediaStream } from "./mediaStore.js";
import { createOpenAiClient } from "./openai.js";
import { addRoomMedia, deleteRoom, getRoom, listRooms, removeRoomMedia, replaceRoomMedia, roomSchema, saveRoom } from "./rooms.js";

await connectDatabase();

const app = Fastify({
  bodyLimit: 250 * 1024 * 1024,
  logger: true
});

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || origin === "https://web.whatsapp.com" || origin.startsWith("chrome-extension://")) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed"), false);
  }
});
await app.register(multipart, {
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 1
  }
});
await mkdir(uploadsRoot, { recursive: true });

app.get("/uploads/*", async (request, reply) => {
  const params = request.params as { "*": string };
  const publicPath = `/uploads/${params["*"] ?? ""}`;
  const localPath = getLocalUploadPath(publicPath);

  if (localPath) {
    try {
      const localStat = await stat(localPath);
      reply.type(getMediaContentType(publicPath));
      reply.header("content-length", String(localStat.size));
      return reply.send(createReadStream(localPath));
    } catch {
      // Fall through to durable Mongo storage.
    }
  }

  const storedMedia = await getStoredMedia(publicPath);
  if (!storedMedia) {
    return reply.status(404).send({ error: "Media not found" });
  }

  reply.type(String(storedMedia.contentType || getMediaContentType(publicPath)));
  if (typeof storedMedia.length === "number") {
    reply.header("content-length", String(storedMedia.length));
  }
  return reply.send(openStoredMediaStream(storedMedia._id));
});

const frontendDebugLogs: Array<{
  body: Record<string, unknown>;
  createdAt: string;
}> = [];
const realtimeClients = new Set<{ clientId: string; send: (event: string, data: unknown) => void }>();

function broadcastRealtime(event: string, data: unknown, sourceClientId = "") {
  for (const client of realtimeClients) {
    if (sourceClientId && client.clientId === sourceClientId) continue;
    client.send(event, data);
  }
}

app.get("/api/health", async () => {
  return {
    ok: true,
    service: "gpb-whatsapp-booking-backend"
  };
});

app.get("/api/debug/logs", async () => {
  return frontendDebugLogs;
});

app.get("/api/events", async (request, reply) => {
  const query = request.query as { clientId?: string };
  const clientId = query.clientId || "";
  reply.hijack();
  reply.raw.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no"
  });
  reply.raw.write("retry: 2000\n\n");

  const client = {
    clientId,
    send: (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };
  realtimeClients.add(client);
  client.send("sync.ready", { serverTime: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    reply.raw.write(`event: sync.ping\n`);
    reply.raw.write(`data: ${JSON.stringify({ serverTime: new Date().toISOString() })}\n\n`);
  }, 25_000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    realtimeClients.delete(client);
  });
});

app.post("/api/debug/logs", async (request) => {
  const body = request.body as Record<string, unknown> | undefined;
  frontendDebugLogs.push({
    body: body ?? {},
    createdAt: new Date().toISOString()
  });
  if (frontendDebugLogs.length > 200) {
    frontendDebugLogs.splice(0, frontendDebugLogs.length - 200);
  }
  request.log.info({
    source: "frontend",
    debug: body ?? {}
  }, "GPB frontend debug");

  return { ok: true };
});

app.get("/api/active-dialogs", async () => {
  return listActiveDialogs();
});

app.put("/api/active-dialogs/:chatKey", async (request, reply) => {
  const { chatKey } = request.params as { chatKey: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return reply.status(400).send({ error: "Invalid active dialog" });
  }
  const decodedChatKey = decodeURIComponent(chatKey);
  const dialog = await claimActiveDialogData(decodedChatKey, body);
  broadcastRealtime("active-dialogs.changed", { action: "upsert", dialog }, String(body.clientId ?? ""));
  return dialog;
});

app.delete("/api/active-dialogs/:chatKey", async (request, reply) => {
  const { chatKey } = request.params as { chatKey: string };
  const query = request.query as { clientId?: string };
  await releaseActiveDialogData(decodeURIComponent(chatKey), query.clientId ?? "");
  broadcastRealtime("active-dialogs.changed", { action: "delete", chatKey: decodeURIComponent(chatKey), clientId: query.clientId ?? "" }, query.clientId ?? "");
  return reply.status(204).send();
});

app.post("/api/booking/draft", async (request, reply) => {
  const result = bookingDraftRequestSchema.safeParse(request.body);

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid request",
      details: result.error.flatten()
    });
  }

  return createStubDraft(result.data.message);
});

type AiReplySuggestionPayload = {
  answers: string[];
  answerTranslations: string[];
  reason: string;
  recommended: number;
};

const AI_REPLY_SYSTEM_PROMPT = `Ты — помощник оператора по продажам гостиницы Green Pine Burabay.

Тебе передаются:

1. Полная история переписки с гостем.
2. Последнее сообщение гостя.
3. Актуальные данные гостиницы, номеров, цен и услуг.
4. Краткий справочник по Боровому: озёра, пляжи, центр, достопримечательности, расстояния и маршруты.

Задача:
Проанализируй переписку и предложи 5 вариантов следующего ответа оператору.

Приоритеты:

1. Язык:
— Если поле replyLanguage равно "kk", все 5 answers ОБЯЗАТЕЛЬНО должны быть на казахском языке.
— Если поле replyLanguage равно "ru", все 5 answers должны быть на русском языке.
— Поле reason всегда пиши на русском языке.
— Если answers не на русском языке, добавь русский перевод каждого варианта в answerTranslations.
— Если последнее сообщение гостя начинается с приветствия, лучший ответ тоже должен начинаться с короткого приветствия на языке гостя.

2. Факты:
— Не придумывай цены, наличие, услуги и расстояния.
— Используй hotelData.rooms и hotelData.availability.
— Учитывай hotelData.objectInfo.rules. Если правило там есть, отвечай уверенно.
— Учитывай hotelData.objectInfo.description и hotelData.objectInfo.examples как рабочую инструкцию владельца.
— Если в hotelData.availability есть requestedPeriod и availableRoomsCount больше 0, обязательно используй это: скажи, что на эти даты есть свободные номера.
— Если в hotelData.availability есть requestedMonth, но requestedPeriod пустой, гость указал только месяц. Не утверждай наличие на конкретные даты; попроси точные даты и мягко предложи проверить номера на этот месяц.
— Если гость указал количество людей, а availableTotalPlaces хватает, мягко веди к подбору/бронированию для этой группы.
— Доступность номеров — поддерживающий факт, но не замена ответа на последнее сообщение гостя.

3. Домики и номера:
— Green Pine Burabay — гостиница с номерами, а не база с отдельными домиками.
— Если гость спрашивает домик, коттедж, үй или отдельный house, честно объясни, что домиков нет.
— Если при этом по датам есть свободные номера, лучший ответ должен совмещать оба смысла: домиков нет, но на эти даты есть номера.
— Не ограничивайся сухим отказом, если можно предложить доступные номера.

4. Продажа:
— Учитывай всю переписку, особенно последнее сообщение.
— Не задавай повторно вопросы, на которые гость уже ответил.
— Учитывай, что гость может менять даты, состав и требования.
— Не обвиняй гостя и не спорь с ним.
— Отвечай только на текущий вопрос или возражение.
— Если последнее сообщение гостя — возражение, сомнение, раздражение или короткая реакция, сначала ответь на это по смыслу.
— При недостатке данных задай один короткий уточняющий вопрос.
— Мягко веди гостя к бронированию.
— Если объект явно не подходит, честно сообщи это.
— Не дави и не запугивай гостя.

Стиль:
— Каждый вариант — не более 8 слов.
— Ответ должен быть простым и понятным для WhatsApp.
— Не используй длинные описания и сложные формулировки.
— Варианты должны отличаться по смыслу, а не только словами.
— Выбери лучший вариант и отметь его как рекомендуемый.

Формат ответа строго JSON:
{
  "recommended": 2,
  "reason": "Кратко объясни оператору причину выбора",
  "answers": [
    "Вариант ответа 1",
    "Вариант ответа 2",
    "Вариант ответа 3",
    "Вариант ответа 4",
    "Вариант ответа 5"
  ],
  "answerTranslations": [
    "Перевод варианта 1 на русский",
    "Перевод варианта 2 на русский",
    "Перевод варианта 3 на русский",
    "Перевод варианта 4 на русский",
    "Перевод варианта 5 на русский"
  ]
}

Поле reason и answerTranslations видит только оператор. Гостю они не отправляются.`;

const AI_REPLY_OUTPUT_CONTRACT = `Техническое требование:
Ответ верни строго JSON-объектом с полями recommended, reason, answers, answerTranslations.
answers всегда ровно 5 коротких вариантов.
reason всегда на русском языке.
Если answers не на русском, answerTranslations содержит русский перевод каждого варианта.
Гостю отправляется только выбранный текст из answers.`;

function toSafeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compactRoomForAi(room: Record<string, unknown>) {
  const sleepingPlaces = Array.isArray(room.sleepingPlaces)
    ? room.sleepingPlaces
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
        .map((item) => `${toSafeString(item.title)} x${toSafeNumber(item.count) || 1}, мест ${toSafeNumber(item.normalCapacity) || toSafeNumber(item.placesCount)}`)
        .filter(Boolean)
    : [];
  return {
    number: toSafeString(room.number),
    title: toSafeString(room.title),
    category: toSafeString(room.group),
    floor: toSafeString(room.floor),
    places: toSafeNumber(room.capacityAdults) + toSafeNumber(room.capacityChildren),
    weekdayPrice: toSafeNumber(room.weekdayPrice) || toSafeNumber(room.basePrice),
    weekendPrice: toSafeNumber(room.weekendPrice) || toSafeNumber(room.basePrice),
    holidayPrice: toSafeNumber(room.holidayPrice) || toSafeNumber(room.weekendPrice) || toSafeNumber(room.basePrice),
    food: toSafeString(room.amenities).split(",").map((item) => item.trim()).filter((item) => /завтрак|питан/i.test(item)).join(", "),
    amenities: toSafeString(room.amenities).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12).join(", "),
    description: toSafeString(room.description).slice(0, 500),
    sleepingPlaces
  };
}

function toDateInput(value: unknown) {
  const text = toSafeString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function addDaysInput(dateInput: string, days: number) {
  const [year, month, day] = dateInput.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function dateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return Boolean(leftStart && leftEnd && rightStart && rightEnd && leftStart < rightEnd && rightStart < leftEnd);
}

function isIgnorableAiMessageText(value: unknown) {
  const text = toSafeString(value).toLowerCase();
  return !text ||
    /^(вы удалили это сообщение|сообщение удалено|deleted message|this message was deleted)$/i.test(text) ||
    /исчезающие сообщения|disappearing messages|сообщения и звонки защищены|messages and calls are end-to-end encrypted/i.test(text);
}

function cleanAiMessageText(value: unknown) {
  let text = toSafeString(value);
  if (!text) return "";
  text = text
    .replace(/^\s*вы\s+(?:фото|видео|изображение|документ|номер|меню|объект|прайс|счет)\s*:\s*/i, "")
    .replace(/^\s*(?:фото|видео|изображение|документ|номер|меню|объект|прайс|счет)\s*:\s*/i, "")
    .trim();
  text = text
    .replace(/^(?:номер|комната)\s+\d{2,4}\s+[^?!?.\n]*?\+\s*/i, "")
    .replace(/^(?:номер|комната)\s+\d{2,4}\s+[^?!?.\n]{0,40}(?=\s+(?:ну|да|нет|можем|можно|а|и|или|тогда)\b)/i, "")
    .trim();
  return text;
}

const AI_MONTHS: Record<string, number> = {
  "январ": 1,
  "қаңтар": 1,
  "феврал": 2,
  "ақпан": 2,
  "март": 3,
  "наурыз": 3,
  "апрел": 4,
  "сәуір": 4,
  "май": 5,
  "мамыр": 5,
  "июн": 6,
  "маусым": 6,
  "июл": 7,
  "шілде": 7,
  "август": 8,
  "августа": 8,
  "тамыз": 8,
  "сентябр": 9,
  "қыркүй": 9,
  "октябр": 10,
  "қазан": 10,
  "ноябр": 11,
  "қараша": 11,
  "декабр": 12,
  "желтоқсан": 12
};

function findLastAiMonthMention(text: string) {
  let result: { month: number; monthName: string; index: number } | null = null;
  for (const [name, month] of Object.entries(AI_MONTHS)) {
    const index = text.lastIndexOf(name);
    if (index >= 0 && (!result || index > result.index)) {
      result = { month, monthName: name, index };
    }
  }
  return result;
}

function findLastAiDateIntent(text: string) {
  const monthPattern = Object.keys(AI_MONTHS).join("|");
  const patterns = [
    new RegExp(`(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s*(?:не|на)?\\s*(${monthPattern})`, "gi"),
    new RegExp(`(${monthPattern})\\s*(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})`, "gi")
  ];
  let matchData: { index: number; startDay: number; endDay: number; month: number } | null = null;
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const firstValue = match[1] || "";
      const monthFirst = !/\d/.test(firstValue);
      const monthText = Object.keys(AI_MONTHS).find((name) => (monthFirst ? firstValue : match[3] || "").toLowerCase().includes(name));
      const month = monthText ? AI_MONTHS[monthText] : 0;
      const startDay = Number.parseInt(monthFirst ? match[2] : match[1], 10);
      const endDay = Number.parseInt(monthFirst ? match[3] : match[2], 10);
      if (!month || !Number.isFinite(startDay) || !Number.isFinite(endDay)) continue;
      if (!matchData || (match.index ?? 0) >= matchData.index) {
        matchData = { index: match.index ?? 0, startDay, endDay, month };
      }
    }
  }
  if (!matchData) return null;
  const year = new Date().getFullYear();
  const checkIn = `${year}-${String(matchData.month).padStart(2, "0")}-${String(matchData.startDay).padStart(2, "0")}`;
  let checkOut = `${year}-${String(matchData.month).padStart(2, "0")}-${String(matchData.endDay).padStart(2, "0")}`;
  if (checkOut <= checkIn) checkOut = addDaysInput(checkIn, Math.max(1, matchData.endDay - matchData.startDay || 1));
  return { checkIn, checkOut };
}

function extractAiBookingIntent(messages: Array<Record<string, unknown>>, body: Record<string, unknown> | undefined) {
  const panelCheckIn = toDateInput(body?.checkIn);
  const panelCheckOut = toDateInput(body?.checkOut);
  const panelGuests = toSafeNumber(body?.guestsTotal);
  const bodyLastGuestMessage = isIgnorableAiMessageText(body?.lastGuestMessage) ? "" : cleanAiMessageText(body?.lastGuestMessage);
  const textParts = messages
    .slice(-12)
    .map((message) => cleanAiMessageText(message.text))
    .filter(Boolean);
  if (bodyLastGuestMessage && !textParts.includes(bodyLastGuestMessage)) {
    textParts.push(bodyLastGuestMessage);
  }
  const text = textParts.join("\n").toLowerCase();
  const explicitDateIntent = findLastAiDateIntent(text);
  const monthMention = findLastAiMonthMention(text);
  const usePanelDates = !explicitDateIntent && !monthMention;
  const checkIn = explicitDateIntent?.checkIn || (usePanelDates ? panelCheckIn : "");
  const checkOut = explicitDateIntent?.checkOut || (usePanelDates ? panelCheckOut : "");
  const guestMatches = [...text.matchAll(/(\d{1,2})\s*(?:адам(?:ға|га)?|адам|чел(?:овек)?|гост(?:я|ей|ь)?)/gi)];
  const guestMatch = guestMatches.length ? guestMatches[guestMatches.length - 1] : null;
  return {
    checkIn,
    checkOut,
    guestsTotal: guestMatch ? Number.parseInt(guestMatch[1], 10) : panelGuests,
    requestedMonth: !explicitDateIntent && monthMention ? monthMention.month : 0
  };
}

function detectGuestReplyLanguage(messages: Array<Record<string, unknown>>) {
  const lastGuestText = toSafeString([...messages].reverse().find((message) => !message.fromMe && toSafeString(message.text))?.text);
  const classifyText = (value: string) => {
    const text = value.toLowerCase();
    const hasLetters = /[a-zа-яёәғқңөұүһі]/i.test(text);
    const hasKazakhLetters = /[әғқңөұүһі]/i.test(text);
    const hasKazakhWords = /\b(салеметсіз|сәлеметсіз|салеметсиз|адамға|адамга|барма|бар ма|күнге|кунге|үй|уй|жоқ|иә|неше|қанша|канша)\b/i.test(text);
    return { hasLetters, isKazakh: hasKazakhLetters || hasKazakhWords };
  };
  const lastLanguage = classifyText(lastGuestText);
  if (lastLanguage.hasLetters) return lastLanguage.isKazakh ? "kk" : "ru";
  const recentGuestText = messages
    .slice(-8)
    .filter((message) => !message.fromMe)
    .map((message) => toSafeString(message.text))
    .join(" ")
    .toLowerCase();
  return classifyText(recentGuestText).isKazakh ? "kk" : "ru";
}

function getReservationItemsForAi(reservation: Record<string, unknown>) {
  const items = Array.isArray(reservation.items)
    ? reservation.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  if (items.length) return items;
  const roomIds = Array.isArray(reservation.roomIds) ? reservation.roomIds.map((roomId) => toSafeString(roomId)).filter(Boolean) : [];
  return roomIds.map((roomId) => ({
    roomId,
    checkIn: toSafeString(reservation.checkIn),
    checkOut: toSafeString(reservation.checkOut)
  }));
}

function buildAvailabilityForAi(
  rooms: Array<Record<string, unknown>>,
  reservations: Array<Record<string, unknown>>,
  intent: { checkIn: string; checkOut: string; guestsTotal: number; requestedMonth?: number }
) {
  if (!intent.checkIn || !intent.checkOut) {
    const activeRooms = rooms
      .filter((room) => toSafeString(room.category) === "guest-room" && Boolean(room.bookable) && toSafeString(room.status) === "active" && !room.hideInBookingPanel)
      .map((room) => compactRoomForAi(room))
      .slice(0, 30);
    return {
      requestedPeriod: null,
      requestedMonth: intent.requestedMonth || null,
      note: intent.requestedMonth
        ? "Гость указал месяц без точных дат. Не используй дату из панели; уточни точные даты и предложи проверить номера на этот месяц."
        : "Даты из переписки не определены. Нужно уточнить даты.",
      availableRooms: activeRooms,
      availableRoomsCount: activeRooms.length,
      availableTotalPlaces: activeRooms.reduce((sum, room) => sum + toSafeNumber(room.places), 0)
    };
  }
  const bookedRoomIds = new Set<string>();
  const overlappingReservations: Array<Record<string, unknown>> = [];
  for (const reservation of reservations) {
    if (toSafeString(reservation.status) === "cancelled") continue;
    const overlappingItems = getReservationItemsForAi(reservation).filter((item) =>
      dateRangesOverlap(toSafeString(item.checkIn), toSafeString(item.checkOut), intent.checkIn, intent.checkOut)
    );
    if (!overlappingItems.length) continue;
    overlappingReservations.push({
      guest: toSafeString(reservation.guestFirstName) || "Гость",
      rooms: overlappingItems.map((item) => toSafeString(item.roomId)).filter(Boolean),
      checkIn: toSafeString(reservation.checkIn),
      checkOut: toSafeString(reservation.checkOut),
      status: toSafeString(reservation.status)
    });
    overlappingItems.forEach((item) => {
      const roomId = toSafeString(item.roomId);
      if (roomId) bookedRoomIds.add(roomId);
    });
  }
  const availableRooms = rooms
    .filter((room) => toSafeString(room.category) === "guest-room" && Boolean(room.bookable) && toSafeString(room.status) === "active" && !room.hideInBookingPanel)
    .filter((room) => !bookedRoomIds.has(toSafeString(room.id)))
    .map((room) => compactRoomForAi(room))
    .slice(0, 30);
  return {
    requestedPeriod: {
      checkIn: intent.checkIn,
      checkOut: intent.checkOut,
      guestsTotal: intent.guestsTotal
    },
    availableRooms,
    availableRoomsCount: availableRooms.length,
    availableTotalPlaces: availableRooms.reduce((sum, room) => sum + toSafeNumber(room.places), 0),
    overlappingReservations
  };
}

function buildBorovoeReferenceForAi() {
  return [
    "Green Pine Burabay находится в Бурабае/Боровом, подходит гостям на машине и для спокойного отдыха.",
    "Не обещай точное расстояние или минуты, если в данных переписки или объекта нет точной цифры.",
    "Если гость просит центр, пляж, озеро или пешую доступность, отвечай честно и мягко уточняй приоритет.",
    "Можно упоминать, что в Боровом важны даты, состав гостей, питание, парковка и близость к нужной локации.",
    "Если гость хочет совсем рядом с озером/центром, не спорь: предложи проверить вариант или честно сказать, что может не подойти."
  ].join("\n");
}

function normalizeAiSuggestionPayload(value: unknown): AiReplySuggestionPayload {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const answers = Array.isArray(payload.answers)
    ? payload.answers.map((answer) => toSafeString(answer)).filter(Boolean).slice(0, 5)
    : [];
  const answerTranslations = Array.isArray(payload.answerTranslations)
    ? payload.answerTranslations.map((answer) => toSafeString(answer)).slice(0, 5)
    : [];
  while (answers.length < 5) {
    answers.push("Уточните, пожалуйста, даты и состав гостей");
  }
  while (answerTranslations.length < 5) {
    answerTranslations.push("");
  }
  const rawRecommended = typeof payload.recommended === "number" ? payload.recommended : Number.parseInt(String(payload.recommended ?? "1"), 10);
  const recommended = Math.max(1, Math.min(5, Number.isFinite(rawRecommended) ? rawRecommended : 1));
  return {
    answers,
    answerTranslations,
    reason: toSafeString(payload.reason) || "Выбран самый уместный короткий ответ.",
    recommended
  };
}

function parseAiJsonResponse(text: string): AiReplySuggestionPayload {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const jsonText = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  return normalizeAiSuggestionPayload(JSON.parse(jsonText));
}

function isLikelyRussianAnswer(text: string) {
  const normalized = text.toLowerCase();
  return /\b(у нас|есть|нет|только|номера|номер|домиков|свободные|можем|предложить|выберите|помогу|бронированием|какой|интересует|к сожалению|вместо)\b/i.test(normalized);
}

function needsKazakhAnswerRepair(payload: AiReplySuggestionPayload) {
  return payload.answers.some((answer) => isLikelyRussianAnswer(answer));
}

async function repairKazakhAiSuggestions(
  client: ReturnType<typeof createOpenAiClient>,
  payload: AiReplySuggestionPayload
): Promise<AiReplySuggestionPayload> {
  if (!client) return payload;
  const repairPrompt = JSON.stringify({
    task: "Translate answers to Kazakh language only. Do not leave Russian in answers. Keep answerTranslations in Russian.",
    rules: [
      "answers: Kazakh language only",
      "answerTranslations: Russian translation only",
      "reason: Russian only",
      "Keep each answer under 8 words",
      "Do not change meaning",
      "Return strict JSON with recommended, reason, answers, answerTranslations"
    ],
    input: payload
  }, null, 2);
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a strict Kazakh translator for WhatsApp sales replies. Russian text is forbidden in answers."
      },
      { role: "user", content: repairPrompt }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  });
  const content = completion.choices[0]?.message?.content ?? "";
  return content.trim() ? parseAiJsonResponse(content) : payload;
}

app.post("/api/ai/reply-suggestions", async (request, reply) => {
  const client = createOpenAiClient();
  if (!client) {
    return reply.status(503).send({ error: "OPENAI_API_KEY is not configured" });
  }

  const body = request.body as Record<string, unknown> | undefined;
  const chatKey = toSafeString(body?.chatKey);
  if (!chatKey) {
    return reply.status(400).send({ error: "chatKey is required" });
  }

  const [messages, rooms, settings, reservations] = await Promise.all([
    listChatMessages(chatKey, 80),
    listRooms(),
    getPaymentSettingsData(),
    listReservations()
  ]);
  const visibleMessages = Array.isArray(body?.visibleMessages)
    ? body.visibleMessages
        .filter((message): message is Record<string, unknown> => Boolean(message && typeof message === "object" && !Array.isArray(message)))
        .map((message) => ({
          fromMe: Boolean(message.fromMe),
          text: cleanAiMessageText(message.text),
          timestamp: toSafeString(message.timestamp),
          type: toSafeString(message.type) || "visible"
        }))
        .filter((message) => !isIgnorableAiMessageText(message.text))
    : [];
  const savedMessagesForAi = messages.filter((message) => !isIgnorableAiMessageText(message.text));
  const baseMessagesForAi = visibleMessages.length ? visibleMessages : savedMessagesForAi;
  const bodyLastGuestMessageForAi = isIgnorableAiMessageText(body?.lastGuestMessage) ? "" : cleanAiMessageText(body?.lastGuestMessage);
  const messagesForAi = bodyLastGuestMessageForAi && !baseMessagesForAi.some((message) => toSafeString(message.text) === bodyLastGuestMessageForAi)
    ? [...baseMessagesForAi, { fromMe: false, text: bodyLastGuestMessageForAi, timestamp: "", type: "lastGuestMessage" }]
    : baseMessagesForAi;
  const intent = extractAiBookingIntent(messagesForAi, body);
  const replyLanguage = detectGuestReplyLanguage(messagesForAi);
  const roomsForAi = rooms as unknown as Array<Record<string, unknown>>;
  const availability = buildAvailabilityForAi(roomsForAi, reservations as Array<Record<string, unknown>>, intent);

  const compactMessages = messagesForAi
    .slice(-40)
    .map((message) => {
      const author = message.fromMe ? "Оператор" : "Гость";
      const text = cleanAiMessageText(message.text);
      return text ? `${message.timestamp ? `[${message.timestamp}] ` : ""}${author}: ${text}`.trim() : "";
    })
    .filter(Boolean);
  const bodyLastGuestMessage = isIgnorableAiMessageText(body?.lastGuestMessage) ? "" : cleanAiMessageText(body?.lastGuestMessage);
  const lastGuestMessage = bodyLastGuestMessage ||
    cleanAiMessageText([...messagesForAi].reverse().find((message) => !message.fromMe && cleanAiMessageText(message.text))?.text) ||
    "";
  const compactRooms = rooms
    .filter((room) => room.bookable && room.status === "active" && !room.hideInBookingPanel)
    .map((room) => compactRoomForAi(room as unknown as Record<string, unknown>))
    .slice(0, 40);
  const settingsRecord = settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
  const customChatBotPrompt = toSafeString(settingsRecord.chatBotPrompt);
  const chatBotSystemPrompt = `${customChatBotPrompt || AI_REPLY_SYSTEM_PROMPT}\n\n${AI_REPLY_OUTPUT_CONTRACT}`;
  const chatBotObjectDescription = toSafeString(settingsRecord.chatBotObjectDescription);
  const chatBotExamples = toSafeString(settingsRecord.chatBotExamples);
  const objectInfo = {
    description: chatBotObjectDescription,
    examples: chatBotExamples,
    paymentLink: toSafeString(settingsRecord.paymentLink),
    packageGiftText: toSafeString(settingsRecord.packageGiftText),
    rules: {
      pets: "С животными нельзя."
    },
    customFoodOptions: Array.isArray(settingsRecord.customFoodOptions) ? settingsRecord.customFoodOptions.slice(0, 20) : [],
    includedCardPages: Array.isArray(settingsRecord.includedCardPages)
      ? settingsRecord.includedCardPages
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
          .map((item) => toSafeString(item.description))
          .filter(Boolean)
          .slice(0, 10)
      : []
  };

  const userPrompt = JSON.stringify({
    chat: {
      chatKey,
      chatTitle: toSafeString(body?.chatTitle),
      phone: toSafeString(body?.phone),
      guestName: toSafeString(body?.guestName)
    },
    lastGuestMessage,
    replyLanguage,
    languageInstruction: replyLanguage === "kk"
      ? "Гость пишет на казахском или казахско-русской смеси. Все answers должны быть на казахском. answerTranslations должны быть русским переводом. Если есть доступные номера, ответ на казахском должен продавать номера, а не просто отказывать по домикам."
      : "Гость пишет на русском. Answers должны быть на русском.",
    messages: compactMessages,
    hotelData: {
      objectInfo,
      rooms: compactRooms,
      availability
    },
    borovoeReference: buildBorovoeReferenceForAi()
  }, null, 2);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: chatBotSystemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.6,
    response_format: { type: "json_object" }
  });

  const content = completion.choices[0]?.message?.content ?? "";
  if (!content.trim()) {
    return reply.status(502).send({ error: "OpenAI returned empty response" });
  }

  try {
    const parsed = parseAiJsonResponse(content);
    const repaired = replyLanguage === "kk" && needsKazakhAnswerRepair(parsed)
      ? await repairKazakhAiSuggestions(client, parsed)
      : null;
    const result = repaired ?? parsed;
    if (replyLanguage === "ru") {
      result.answerTranslations = [];
    }
    saveAiReplyLogData({
      chatKey,
      chatTitle: toSafeString(body?.chatTitle),
      phone: toSafeString(body?.phone),
      guestName: toSafeString(body?.guestName),
      lastGuestMessage,
      replyLanguage,
      repaired: Boolean(repaired),
      intent,
      availability,
      messages: compactMessages,
      result,
      rawModelResponse: content
    }).catch((error) => request.log.error({ error }, "AI reply log save failed"));
    return result;
  } catch (error) {
    request.log.error({ error, content }, "AI suggestions parse failed");
    return reply.status(502).send({ error: "Invalid AI response" });
  }
});

app.get("/api/ai/reply-suggestions/logs", async (request) => {
  const query = request.query as Record<string, string | undefined>;
  const limit = Number.parseInt(query.limit ?? "50", 10);
  return { logs: await listAiReplyLogs(Number.isFinite(limit) ? limit : 50) };
});

app.get("/api/backup/server", async (request) => {
  const query = request.query as Record<string, string | undefined>;
  return exportServerBackup({
    includeGuestContacts: query.guestContacts !== "0",
    includeMedia: query.media !== "0",
    includeRooms: query.rooms !== "0"
  });
});

app.post("/api/backup/server/import", async (request, reply) => {
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return reply.status(400).send({ error: "Invalid backup payload" });
  }

  return importServerBackup(body);
});

app.get("/api/guest-contacts", async () => {
  return listGuestContacts();
});

app.post("/api/guest-contacts", async (request, reply) => {
  const result = guestContactSchema.safeParse(request.body);

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid guest contact",
      details: result.error.flatten()
    });
  }

  return saveGuestContact(result.data);
});

app.delete("/api/guest-contacts/:phone", async (request, reply) => {
  const { phone } = request.params as { phone: string };
  await deleteGuestContact(decodeURIComponent(phone));
  return reply.status(204).send();
});

app.get("/api/reservations", async () => {
  return listReservations();
});

app.put("/api/reservations", async (request) => {
  const body = request.body as { items?: Array<Record<string, unknown>> } | undefined;
  const items = await replaceReservations(Array.isArray(body?.items) ? body.items : []);
  broadcastRealtime("reservations.changed", { action: "replace", items });
  return items;
});

app.put("/api/reservations/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return reply.status(400).send({ error: "Invalid reservation" });
  }

  const reservation = await saveReservationData(id, body);
  broadcastRealtime("reservations.changed", { action: "upsert", reservation });
  return reservation;
});

app.delete("/api/reservations/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  await deleteReservationData(id);
  broadcastRealtime("reservations.changed", { action: "delete", id: decodeURIComponent(id) });
  return reply.status(204).send();
});

app.get("/api/payment-settings", async () => {
  return { settings: await getPaymentSettingsData() };
});

app.put("/api/payment-settings", async (request) => {
  const body = request.body as { settings?: unknown } | undefined;
  return { settings: await savePaymentSettingsData(body?.settings ?? null) };
});

app.get("/api/expense-categories", async () => {
  return listExpenseCategories();
});

app.put("/api/expense-categories", async (request) => {
  const body = request.body as { items?: Array<Record<string, unknown>> } | undefined;
  return replaceExpenseCategories(Array.isArray(body?.items) ? body.items : []);
});

app.get("/api/expense-entries", async () => {
  return listExpenseEntries();
});

app.put("/api/expense-entries", async (request) => {
  const body = request.body as { items?: Array<Record<string, unknown>> } | undefined;
  return replaceExpenseEntries(Array.isArray(body?.items) ? body.items : []);
});

app.get("/api/chat-drafts", async () => {
  return { drafts: await getChatDraftData() };
});

app.get("/api/chat-drafts/:chatId", async (request) => {
  const { chatId } = request.params as { chatId: string };
  return { draft: await getChatDraftById(decodeURIComponent(chatId)) };
});

app.put("/api/chat-drafts", async (request) => {
  const body = request.body as { drafts?: Record<string, unknown> } | undefined;
  const drafts = body?.drafts && typeof body.drafts === "object" && !Array.isArray(body.drafts) ? body.drafts : {};
  const savedDrafts = await replaceChatDraftData(drafts);
  broadcastRealtime("chat-drafts.changed", { action: "replace", drafts: savedDrafts });
  return { drafts: savedDrafts };
});

app.put("/api/chat-drafts/:chatId", async (request, reply) => {
  const { chatId } = request.params as { chatId: string };
  const body = request.body as { draft?: unknown } | undefined;
  if (!body || !body.draft || typeof body.draft !== "object" || Array.isArray(body.draft)) {
    return reply.status(400).send({ error: "Invalid chat draft" });
  }

  const decodedChatId = decodeURIComponent(chatId);
  const draft = await saveChatDraftData(decodedChatId, body.draft);
  broadcastRealtime("chat-drafts.changed", { action: "upsert", chatId: decodedChatId, draft });
  return { draft };
});

app.delete("/api/chat-drafts/:chatId", async (request, reply) => {
  const { chatId } = request.params as { chatId: string };
  const decodedChatId = decodeURIComponent(chatId);
  await deleteChatDraftData(decodedChatId);
  broadcastRealtime("chat-drafts.changed", { action: "delete", chatId: decodedChatId });
  return reply.status(204).send();
});

app.get("/api/chat-messages", async (request) => {
  const query = request.query as { limit?: string };
  const limit = Number.parseInt(query.limit || "20000", 10);
  return { dialogs: await listChatMessageDialogs(Number.isFinite(limit) ? limit : 20_000) };
});

app.get("/api/chat-messages/:chatKey", async (request) => {
  const { chatKey } = request.params as { chatKey: string };
  const query = request.query as { limit?: string };
  const limit = Number.parseInt(query.limit || "500", 10);
  return { messages: await listChatMessages(decodeURIComponent(chatKey), Number.isFinite(limit) ? limit : 500) };
});

app.put("/api/chat-messages/:chatKey", async (request, reply) => {
  const { chatKey } = request.params as { chatKey: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply.status(400).send({ error: "Invalid chat messages payload" });
  }

  return saveChatMessagesData(decodeURIComponent(chatKey), body);
});

app.get("/api/room-holds", async () => {
  return listRoomHolds();
});

app.put("/api/room-holds/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply.status(400).send({ error: "Invalid room hold" });
  }

  const hold = await saveRoomHoldData(id, body);
  broadcastRealtime("room-holds.changed", { action: "upsert", hold }, typeof body.clientId === "string" ? body.clientId : "");
  return hold;
});

app.delete("/api/room-holds/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const query = request.query as { clientId?: string };
  await deleteRoomHoldData(decodeURIComponent(id));
  broadcastRealtime("room-holds.changed", { action: "delete", id: decodeURIComponent(id) }, query.clientId);
  return reply.status(204).send();
});

app.get("/api/rooms", async () => {
  return listRooms();
});

app.get("/api/rooms/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const room = await getRoom(id);

  if (!room) {
    return reply.status(404).send({ error: "Room not found" });
  }

  return room;
});

app.put("/api/rooms/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = roomSchema.safeParse({
    ...(request.body as Record<string, unknown>),
    id
  });

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid room",
      details: result.error.flatten()
    });
  }

  return saveRoom(result.data);
});

app.delete("/api/rooms/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const deleted = await deleteRoom(id);

  if (!deleted) {
    return reply.status(404).send({ error: "Room not found" });
  }

  return { ok: true };
});

app.post("/api/rooms/:id/media", async (request, reply) => {
  const { id } = request.params as { id: string };
  const room = await getRoom(id);
  if (!room) {
    return reply.status(404).send({ error: "Room not found" });
  }

  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: "File is required" });
  }

  try {
    const media = await saveRoomMediaFile(id, file);
    const updatedRoom = await addRoomMedia(id, media.mediaType, media.path);
    return updatedRoom;
  } catch (error) {
    request.log.error(error);
    const details = error instanceof Error ? error.message : "Unknown upload error";
    return reply.status(400).send({ error: "Media upload failed", details });
  }
});

app.delete("/api/rooms/:id/media", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { path?: string } | undefined;
  if (!body?.path) {
    return reply.status(400).send({ error: "Path is required" });
  }

  await deleteMediaFile(body.path);
  const updatedRoom = await removeRoomMedia(id, body.path);
  if (!updatedRoom) {
    return reply.status(404).send({ error: "Room not found" });
  }

  return updatedRoom;
});

app.post("/api/object-gallery/media", async (request, reply) => {
  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: "File is required" });
  }

  try {
    return await saveRoomMediaFile("object-gallery", file);
  } catch (error) {
    request.log.error(error);
    return reply.status(400).send({ error: "Object gallery upload failed" });
  }
});

app.delete("/api/object-gallery/media", async (request, reply) => {
  const body = request.body as { path?: string } | undefined;
  if (!body?.path) {
    return reply.status(400).send({ error: "Path is required" });
  }

  await deleteMediaFile(body.path);
  return reply.status(204).send();
});

app.post("/api/media/whatsapp-video", async (request, reply) => {
  const body = request.body as { path?: string } | undefined;
  if (!body?.path) {
    return reply.status(400).send({ error: "Path is required" });
  }

  try {
    const path = await ensureWhatsappVideoFile(body.path);
    return { path };
  } catch (error) {
    request.log.error(error);
    return reply.status(400).send({ error: "Video conversion failed" });
  }
});

app.post("/api/rooms/:id/media/crop", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { aspectRatio?: number; focalX?: number; focalY?: number; path?: string } | undefined;
  if (!body?.path || !body.aspectRatio) {
    return reply.status(400).send({ error: "Path and aspectRatio are required" });
  }

  const room = await getRoom(id);
  if (!room) {
    return reply.status(404).send({ error: "Room not found" });
  }

  try {
    const croppedPath = await cropPhotoFile(id, body.path, {
      aspectRatio: body.aspectRatio,
      focalX: body.focalX ?? 50,
      focalY: body.focalY ?? 50
    });
    const updatedRoom = await replaceRoomMedia(id, body.path, croppedPath);
    return updatedRoom;
  } catch (error) {
    request.log.error(error);
    return reply.status(400).send({ error: "Crop failed" });
  }
});

const close = async () => {
  await app.close();
  await closeDatabase();
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({
  port: config.port,
  host: process.env.HOST ?? "0.0.0.0"
});
