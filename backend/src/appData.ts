import { db } from "./db.js";

const reservations = db.collection<Record<string, unknown> & { id: string }>("reservations");
const settings = db.collection<{ id: string; value: unknown; updatedAt: Date }>("settings");
const expenseCategories = db.collection<Record<string, unknown> & { id: string }>("expenseCategories");
const expenseEntries = db.collection<Record<string, unknown> & { id: string }>("expenseEntries");
const chatDrafts = db.collection<{ chatId: string; draft: unknown; updatedAt: Date }>("chatDrafts");
const roomHolds = db.collection<Record<string, unknown> & { id: string; expiresAt: string }>("roomHolds");
const activeDialogs = db.collection<Record<string, unknown> & { chatKey: string; clientId: string; expiresAt: string }>("activeDialogs");

export async function listReservations() {
  return reservations.find().sort({ createdAt: -1 }).toArray();
}

export async function saveReservationData(id: string, reservation: Record<string, unknown>) {
  const { createdAt, ...reservationData } = reservation;
  const document = { ...reservationData, id, updatedAt: new Date() };
  await reservations.updateOne({ id }, { $set: document, $setOnInsert: { createdAt: createdAt ?? new Date().toISOString() } }, { upsert: true });
  return document;
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
  const existing = await activeDialogs.findOne({ chatKey, expiresAt: { $gt: new Date().toISOString() } });
  if (existing && existing.clientId !== dialog.clientId) {
    return existing;
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 90_000).toISOString();
  const document = {
    ...dialog,
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
