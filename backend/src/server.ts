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

Правила:
— Учитывай всю переписку, особенно последнее сообщение.
— Не задавай повторно вопросы, на которые гость уже ответил.
— Учитывай, что гость может менять даты, состав и требования.
— Не обвиняй гостя и не спорь с ним.
— Отвечай только на текущий вопрос или возражение.
— Каждый вариант — не более 8 слов.
— Ответ должен быть простым и понятным для WhatsApp.
— Не используй длинные описания и сложные формулировки.
— Не придумывай цены, наличие, услуги и расстояния.
— При недостатке данных задай один короткий уточняющий вопрос.
— Мягко веди гостя к бронированию.
— Если объект явно не подходит, честно сообщи это.
— Не дави и не запугивай гостя.
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
  ]
}

Поле reason видит только оператор. Гостю оно не отправляется.`;

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
  while (answers.length < 5) {
    answers.push("Уточните, пожалуйста, даты и состав гостей");
  }
  const rawRecommended = typeof payload.recommended === "number" ? payload.recommended : Number.parseInt(String(payload.recommended ?? "1"), 10);
  const recommended = Math.max(1, Math.min(5, Number.isFinite(rawRecommended) ? rawRecommended : 1));
  return {
    answers,
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

  const [messages, rooms, settings] = await Promise.all([
    listChatMessages(chatKey, 80),
    listRooms(),
    getPaymentSettingsData()
  ]);

  const compactMessages = messages
    .slice(-40)
    .map((message) => {
      const author = message.fromMe ? "Оператор" : "Гость";
      return `${message.timestamp ? `[${message.timestamp}] ` : ""}${author}: ${toSafeString(message.text)}`.trim();
    })
    .filter(Boolean);
  const lastGuestMessage = [...messages].reverse().find((message) => !message.fromMe && toSafeString(message.text))?.text || "";
  const compactRooms = rooms
    .filter((room) => room.bookable && room.status === "active" && !room.hideInBookingPanel)
    .map((room) => compactRoomForAi(room as unknown as Record<string, unknown>))
    .slice(0, 40);
  const settingsRecord = settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
  const objectInfo = {
    paymentLink: toSafeString(settingsRecord.paymentLink),
    packageGiftText: toSafeString(settingsRecord.packageGiftText),
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
    messages: compactMessages,
    hotelData: {
      objectInfo,
      rooms: compactRooms
    },
    borovoeReference: buildBorovoeReferenceForAi()
  }, null, 2);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: AI_REPLY_SYSTEM_PROMPT },
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
    return parseAiJsonResponse(content);
  } catch (error) {
    request.log.error({ error, content }, "AI suggestions parse failed");
    return reply.status(502).send({ error: "Invalid AI response" });
  }
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
    return reply.status(400).send({ error: "Media upload failed" });
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
