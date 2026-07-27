import { db } from "./db.js";

const reservations = db.collection<Record<string, unknown> & { id: string }>("reservations");
const settings = db.collection<{ id: string; value: unknown; updatedAt: Date }>("settings");
const expenseCategories = db.collection<Record<string, unknown> & { id: string }>("expenseCategories");
const expenseEntries = db.collection<Record<string, unknown> & { id: string }>("expenseEntries");
const chatDrafts = db.collection<{ chatId: string; draft: unknown; updatedAt: Date }>("chatDrafts");
const chatMessages = db.collection<Record<string, unknown> & { chatKey: string; messageKey: string; updatedAt: Date }>("chatMessages");
const aiReplyLogs = db.collection<Record<string, unknown> & { createdAt: Date }>("aiReplyLogs");
const roomHolds = db.collection<Record<string, unknown> & { id: string; expiresAt: string }>("roomHolds");
const activeDialogs = db.collection<Record<string, unknown> & { chatKey: string; clientId: string; expiresAt: string }>("activeDialogs");
const contactLocks = db.collection<Record<string, unknown> & { phone: string; clientId: string; expiresAt: string }>("contactLocks");
const menuOrders = db.collection<Record<string, unknown> & { id: string }>("menuOrders");

export async function listReservations() {
  return reservations.find().sort({ createdAt: -1 }).toArray();
}

export async function getChatStatusSourcesData() {
  const [draftDocuments, reservationDocuments] = await Promise.all([
    chatDrafts.find({}, {
      projection: {
        _id: 0,
        chatId: 1,
        "draft.agreementEverSent": 1,
        "draft.agreementSent": 1,
        "draft.catalogStatus": 1,
        "draft.catalogStatusAt": 1,
        "draft.chatStartedAt": 1,
        "draft.guestFirstName": 1,
        "draft.lastReservation.guestFirstName": 1,
        "draft.manualStatus": 1,
        "draft.manualStatusAt": 1,
        "draft.phone": 1,
        "draft.updatedAt": 1,
        "draft.waChatId": 1
      }
    }).toArray(),
    reservations.find(
      { isAddOnSale: { $ne: true } },
      {
        projection: {
          _id: 0,
          balancePaidAt: 1,
          checkedInAt: 1,
          checkedOutAt: 1,
          checkOut: 1,
          checkOutTime: 1,
          createdAt: 1,
          extendedAt: 1,
          guestFirstName: 1,
          id: 1,
          isAddOnSale: 1,
          noShowAt: 1,
          phone: 1,
          prepaymentReceivedAt: 1,
          status: 1,
          updatedAt: 1
        }
      }
    ).toArray()
  ]);

  return {
    drafts: Object.fromEntries(draftDocuments.map((document) => [document.chatId, document.draft])),
    reservations: reservationDocuments
  };
}

export async function getChatStatusSourcesForIdentityData(chatIds: string[], phones: string[], waChatIds: string[]) {
  const normalizedChatIds = Array.from(new Set(chatIds.filter(Boolean)));
  const normalizedPhones = Array.from(new Set(phones.filter(Boolean)));
  const normalizedWaChatIds = Array.from(new Set(waChatIds.filter(Boolean)));
  const draftFilters: Array<Record<string, unknown>> = [];
  if (normalizedChatIds.length) draftFilters.push({ chatId: { $in: normalizedChatIds } });
  if (normalizedPhones.length) draftFilters.push({ "draft.phone": { $in: normalizedPhones } });
  if (normalizedWaChatIds.length) draftFilters.push({ "draft.waChatId": { $in: normalizedWaChatIds } });

  const [draftDocuments, reservationDocuments] = await Promise.all([
    draftFilters.length
      ? chatDrafts.find({ $or: draftFilters }).toArray()
      : Promise.resolve([]),
    normalizedPhones.length
      ? reservations.find({ phone: { $in: normalizedPhones }, isAddOnSale: { $ne: true } }).toArray()
      : Promise.resolve([])
  ]);

  return {
    drafts: Object.fromEntries(draftDocuments.map((document) => [document.chatId, document.draft])),
    reservations: reservationDocuments
  };
}

export async function listReservationConflictCandidates(id: string, roomIds: string[]) {
  const normalizedRoomIds = Array.from(new Set(roomIds.filter(Boolean)));
  if (!normalizedRoomIds.length) {
    return reservations.find({ id }).toArray();
  }
  return reservations.find({
    $or: [
      { id },
      { roomIds: { $in: normalizedRoomIds } },
      { "items.roomId": { $in: normalizedRoomIds } }
    ]
  }).toArray();
}

export async function saveReservationData(id: string, reservation: Record<string, unknown>) {
  const { createdAt, ...reservationData } = stripMongoIdFields(reservation) as Record<string, unknown>;
  const document = { ...reservationData, id, updatedAt: new Date() };
  await reservations.updateOne({ id }, { $set: document, $setOnInsert: { createdAt: createdAt ?? new Date().toISOString() } }, { upsert: true });
  return document;
}

function stripMongoIdFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripMongoIdFields);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "_id")
      .map(([key, entryValue]) => [key, stripMongoIdFields(entryValue)]);
    return Object.fromEntries(entries);
  }
  return value;
}

export async function replaceReservations(items: Array<Record<string, unknown>>) {
  await replaceCollection(reservations.collectionName, items);
  return listReservations();
}

export async function deleteReservationData(id: string) {
  await reservations.deleteOne({ id });
}

export async function getPaymentSettingsData() {
  const document = await settings.findOne({ id: "payment" });
  return document?.value ?? null;
}

export async function savePaymentSettingsData(value: unknown) {
  await settings.updateOne(
    { id: "payment" },
    { $set: { id: "payment", value, updatedAt: new Date() } },
    { upsert: true }
  );
  return value;
}

export async function listMenuOrders() {
  return menuOrders.find().sort({ createdAt: -1 }).toArray();
}

export async function saveMenuOrderData(id: string, order: Record<string, unknown>) {
  const now = new Date();
  const { createdAt, ...orderData } = stripMongoIdFields(order) as Record<string, unknown>;
  const document = {
    ...orderData,
    id,
    updatedAt: now.toISOString()
  };
  await menuOrders.updateOne(
    { id },
    {
      $set: document,
      $setOnInsert: { createdAt: typeof createdAt === "string" ? createdAt : now.toISOString() }
    },
    { upsert: true }
  );
  return {
    ...document,
    createdAt: typeof createdAt === "string" ? createdAt : now.toISOString()
  };
}

export async function deleteMenuOrderData(id: string) {
  await menuOrders.deleteOne({ id });
}

export async function listExpenseCategories() {
  return expenseCategories.find().sort({ createdAt: 1 }).toArray();
}

export async function replaceExpenseCategories(items: Array<Record<string, unknown>>) {
  await replaceCollection(expenseCategories.collectionName, items);
  return listExpenseCategories();
}

export async function listExpenseEntries() {
  return expenseEntries.find().sort({ paymentDate: -1, createdAt: -1 }).toArray();
}

export async function replaceExpenseEntries(items: Array<Record<string, unknown>>) {
  await replaceCollection(expenseEntries.collectionName, items);
  return listExpenseEntries();
}

export async function getChatDraftData() {
  const documents = await chatDrafts.find().toArray();
  return Object.fromEntries(documents.map((document) => [document.chatId, document.draft]));
}

export async function getChatDraftById(chatId: string) {
  const document = await chatDrafts.findOne({ chatId });
  return document?.draft ?? null;
}

export async function saveChatDraftData(chatId: string, draft: unknown) {
  await chatDrafts.updateOne(
    { chatId },
    { $set: { chatId, draft, updatedAt: new Date() } },
    { upsert: true }
  );
  return draft;
}

export async function deleteChatDraftData(chatId: string) {
  await chatDrafts.deleteOne({ chatId });
}

export async function listChatMessages(chatKey: string, limit = 500) {
  return chatMessages
    .find({ chatKey })
    .sort({ sortKey: 1, createdAt: 1, updatedAt: 1 })
    .limit(Math.max(1, Math.min(limit, 2000)))
    .toArray();
}

export async function listChatMessageDialogs(limit = 200) {
  const documents = await chatMessages
    .find({})
    .sort({ chatTitle: 1, chatKey: 1, sortKey: 1, createdAt: 1, updatedAt: 1 })
    .limit(Math.max(1, Math.min(limit, 20_000)))
    .toArray();
  const dialogs = new Map<string, Record<string, unknown> & { messages: Array<Record<string, unknown>> }>();
  for (const document of documents) {
    const phone = typeof document.phone === "string" ? normalizeChatMessagePhone(document.phone) : "";
    const chatTitle = normalizeChatMessageTitle(typeof document.chatTitle === "string" ? document.chatTitle : "", phone);
    const existing = dialogs.get(document.chatKey) ?? {
      chatKey: document.chatKey,
      chatTitle,
      phone,
      messages: []
    };
    if (!existing.phone && phone) existing.phone = phone;
    if (phone && existing.chatTitle !== chatTitle) existing.chatTitle = chatTitle;
    existing.messages.push(document);
    dialogs.set(document.chatKey, existing);
  }
  return Array.from(dialogs.values()).sort((left, right) =>
    String(left.chatTitle || left.phone || left.chatKey).localeCompare(String(right.chatTitle || right.phone || right.chatKey), "ru")
  );
}

export async function saveChatMessagesData(chatKey: string, payload: Record<string, unknown>) {
  const now = new Date();
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const phone = typeof payload.phone === "string" ? normalizeChatMessagePhone(payload.phone) : "";
  const chatTitle = normalizeChatMessageTitle(typeof payload.chatTitle === "string" ? payload.chatTitle : "", phone);
  const clientId = typeof payload.clientId === "string" ? payload.clientId : "";
  const operatorName = typeof payload.operatorName === "string" ? payload.operatorName : "";
  if (!phone) return { saved: 0, skipped: messages.length, reason: "phone_required" };
  const documents = messages
    .filter((message): message is Record<string, unknown> => Boolean(message && typeof message === "object" && !Array.isArray(message)))
    .map((message) => {
      const text = typeof message.text === "string" ? message.text.trim() : "";
      const messageKey = typeof message.id === "string" && message.id.trim()
        ? message.id.trim()
        : `${typeof message.timestamp === "string" ? message.timestamp : ""}:${message.fromMe ? "1" : "0"}:${text.slice(0, 160)}`;
      return {
        chatKey,
        chatTitle,
        phone,
        clientId,
        operatorName,
        messageKey,
        author: typeof message.author === "string" ? message.author : "",
        fromMe: Boolean(message.fromMe),
        text,
        timestamp: typeof message.timestamp === "string" ? message.timestamp : "",
        type: typeof message.type === "string" ? message.type : "visible",
        sortKey: typeof message.sortKey === "string" ? message.sortKey : "",
        updatedAt: now
      };
    })
    .filter((message) => message.text && message.messageKey);

  if (!documents.length) return { saved: 0 };

  await Promise.all(documents.map((document) =>
    chatMessages.updateOne(
      { chatKey, messageKey: document.messageKey },
      {
        $set: document,
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    )
  ));
  return { saved: documents.length };
}

function normalizeChatMessagePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value.trim();
  if (digits.startsWith("7") && digits.length > 11) return "";
  if (/^8\d{10}$/.test(digits)) {
    return `+7${digits.slice(1)}`;
  }
  if (/^7\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+7${digits}`;
  return `+${digits}`;
}

function normalizeChatMessageTitle(value: string, phone: string) {
  const fallbackTitle = getChatMessageGuestTitleFromPhone(phone);
  const trimmedValue = value.replace(/\s+/g, " ").trim();
  if (fallbackTitle) return fallbackTitle;
  return isTechnicalChatMessageTitle(trimmedValue) ? "" : trimmedValue;
}

function getChatMessageGuestTitleFromPhone(phone: string) {
  const digits = normalizeChatMessagePhone(phone).replace(/\D/g, "");
  return digits.length >= 4 ? `Гость ${digits.slice(-4)}` : "";
}

function isTechnicalChatMessageTitle(value: string) {
  if (!value) return false;
  return /^(аудиозвонок|видео|фото|медиа|вы удалили это сообщение|вы закрепили сообщение|facebook business)$/i.test(value);
}

export async function saveAiReplyLogData(payload: Record<string, unknown>) {
  const document = {
    ...stripMongoIdFields(payload) as Record<string, unknown>,
    createdAt: new Date()
  };
  await aiReplyLogs.insertOne(document);
  return document;
}

export async function listAiReplyLogs(limit = 50) {
  return aiReplyLogs
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 500)))
    .toArray();
}

export async function listRoomHolds() {
  await deleteExpiredRoomHolds();
  return roomHolds.find({ expiresAt: { $gt: new Date().toISOString() } }).sort({ expiresAt: 1 }).toArray();
}

export async function saveRoomHoldData(id: string, hold: Record<string, unknown>) {
  const now = new Date();
  const document = {
    ...hold,
    id,
    updatedAt: now
  };
  await roomHolds.updateOne(
    { id },
    {
      $set: document,
      $setOnInsert: { createdAt: typeof hold.createdAt === "string" ? hold.createdAt : now.toISOString() }
    },
    { upsert: true }
  );
  return document;
}

export async function deleteRoomHoldData(id: string) {
  await roomHolds.deleteOne({ id });
}

export async function deleteExpiredRoomHolds() {
  await roomHolds.deleteMany({ expiresAt: { $lte: new Date().toISOString() } });
}

export async function listActiveDialogs() {
  await deleteExpiredActiveDialogs();
  return activeDialogs.find({ expiresAt: { $gt: new Date().toISOString() } }).sort({ updatedAt: -1 }).toArray();
}

export async function claimActiveDialogData(chatKey: string, dialog: Record<string, unknown>) {
  await deleteExpiredActiveDialogs();
  const force = dialog.force === true;
  const existing = await activeDialogs.findOne({ chatKey, expiresAt: { $gt: new Date().toISOString() } });
  if (existing && existing.clientId !== dialog.clientId && !force) {
    return existing;
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 90_000).toISOString();
  const { force: _force, ...dialogData } = dialog;
  const document = {
    ...dialogData,
    chatKey,
    startedAt: typeof dialog.startedAt === "string" ? dialog.startedAt : nowIso,
    updatedAt: nowIso,
    expiresAt
  };
  await activeDialogs.updateOne(
    { chatKey },
    {
      $set: document,
      $setOnInsert: { createdAt: nowIso }
    },
    { upsert: true }
  );
  return document;
}

export async function releaseActiveDialogData(chatKey: string, clientId: string) {
  if (!chatKey) return;
  await activeDialogs.deleteOne({ chatKey, clientId });
}

export async function deleteExpiredActiveDialogs() {
  await activeDialogs.deleteMany({ expiresAt: { $lte: new Date().toISOString() } });
}

export async function listContactLocks() {
  await deleteExpiredContactLocks();
  return contactLocks.find({ expiresAt: { $gt: new Date().toISOString() } }).sort({ updatedAt: -1 }).toArray();
}

export async function claimContactLockData(phone: string, lock: Record<string, unknown>) {
  await deleteExpiredContactLocks();
  const force = lock.force === true;
  const existing = await contactLocks.findOne({ phone, expiresAt: { $gt: new Date().toISOString() } });
  if (existing && existing.clientId !== lock.clientId && !force) {
    return existing;
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30_000).toISOString();
  const { force: _force, ...lockData } = lock;
  const document = {
    ...lockData,
    phone,
    startedAt: typeof lock.startedAt === "string" ? lock.startedAt : nowIso,
    updatedAt: nowIso,
    expiresAt
  };
  await contactLocks.updateOne(
    { phone },
    {
      $set: document,
      $setOnInsert: { createdAt: nowIso }
    },
    { upsert: true }
  );
  return document;
}

export async function releaseContactLockData(phone: string, clientId: string) {
  if (!phone) return;
  await contactLocks.deleteOne({ phone, clientId });
}

export async function deleteExpiredContactLocks() {
  await contactLocks.deleteMany({ expiresAt: { $lte: new Date().toISOString() } });
}

export async function replaceChatDraftData(drafts: Record<string, unknown>) {
  await chatDrafts.deleteMany({});
  const entries = Object.entries(drafts);
  if (entries.length) {
    await chatDrafts.insertMany(entries.map(([chatId, draft]) => ({ chatId, draft, updatedAt: new Date() })));
  }
  return getChatDraftData();
}

async function replaceCollection(collectionName: string, items: Array<Record<string, unknown>>) {
  const collection = db.collection(collectionName);
  await collection.deleteMany({});
  const documents = items
    .filter((item) => item && typeof item === "object" && typeof item.id === "string" && item.id.trim())
    .map((item) => ({ ...item, updatedAt: new Date() }));
  if (documents.length) {
    await collection.insertMany(documents);
  }
}
