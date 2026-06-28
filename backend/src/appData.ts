import { db } from "./db.js";

const reservations = db.collection<Record<string, unknown> & { id: string }>("reservations");
const settings = db.collection<{ id: string; value: unknown; updatedAt: Date }>("settings");
const expenseCategories = db.collection<Record<string, unknown> & { id: string }>("expenseCategories");
const expenseEntries = db.collection<Record<string, unknown> & { id: string }>("expenseEntries");
const chatDrafts = db.collection<{ chatId: string; draft: unknown; updatedAt: Date }>("chatDrafts");

export async function listReservations() {
  return reservations.find().sort({ createdAt: -1 }).toArray();
}

export async function saveReservationData(id: string, reservation: Record<string, unknown>) {
  const document = { ...reservation, id, updatedAt: new Date() };
  await reservations.updateOne({ id }, { $set: document, $setOnInsert: { createdAt: reservation.createdAt ?? new Date().toISOString() } }, { upsert: true });
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
