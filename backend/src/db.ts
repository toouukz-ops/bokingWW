import { MongoClient } from "mongodb";
import { config } from "./config.js";

export const mongoClient = new MongoClient(config.mongodbUri);
export const db = mongoClient.db(config.mongodbDbName);

export async function connectDatabase() {
  await mongoClient.connect();
  await ensureCollection("rooms");
  await ensureCollection("guestContacts");
  await ensureCollection("reservations");
  await ensureCollection("settings");
  await ensureCollection("expenseCategories");
  await ensureCollection("expenseEntries");
  await ensureCollection("chatDrafts");
  await ensureCollection("roomHolds");
  await ensureCollection("activeDialogs");
  await dropLegacyNumberIndex();
  await migrateLegacyRooms();
  await migrateLegacyGuestContacts();
  await db.collection("rooms").createIndex({ id: 1 }, { unique: true });
  await db.collection("guestContacts").createIndex({ phone: 1 }, { unique: true });
  await db.collection("guestContacts").createIndex({ inquiryDate: -1 });
  await db.collection("roomHolds").createIndex({ id: 1 }, { unique: true });
  await db.collection("roomHolds").createIndex({ expiresAt: 1 });
  await db.collection("roomHolds").createIndex({ roomId: 1, checkIn: 1, checkOut: 1 });
  await db.collection("activeDialogs").createIndex({ chatKey: 1 }, { unique: true });
  await db.collection("activeDialogs").createIndex({ expiresAt: 1 });
  await db.collection("activeDialogs").createIndex({ clientId: 1 });
}

export async function closeDatabase() {
  await mongoClient.close();
}

export async function pingDatabase() {
  await db.command({ ping: 1 });
}

async function ensureCollection(name: string) {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
  if (!exists) {
    await db.createCollection(name);
  }
}

async function dropLegacyNumberIndex() {
  const rooms = db.collection("rooms");
  const indexes = await rooms.indexes();
  const numberIndex = indexes.find((index) => index.name === "number_1");
  if (numberIndex) {
    await rooms.dropIndex("number_1");
  }
}

async function migrateLegacyRooms() {
  const rooms = db.collection("rooms");
  const legacyRooms = await rooms.find({ id: { $exists: false } }).sort({ number: 1 }).toArray();

  await Promise.all(
    legacyRooms.map((room, index) =>
      rooms.updateOne(
        { _id: room._id },
        {
          $set: {
            id: `room-${String(room._id)}`,
            sortOrder: typeof room.sortOrder === "number" ? room.sortOrder : index,
            updatedAt: new Date()
          }
        }
      )
    )
  );
}

async function migrateLegacyGuestContacts() {
  const contacts = db.collection("guestContacts");
  const documents = await contacts.find().toArray();
  const byPhone = new Map<string, typeof documents>();

  documents.forEach((document) => {
    const phone = typeof document.phone === "string" ? normalizeGuestPhone(document.phone) : "";
    if (!phone) return;
    byPhone.set(phone, (byPhone.get(phone) ?? []).concat(document));
  });

  for (const [phone, group] of byPhone.entries()) {
    const sorted = group.slice().sort((left, right) => {
      const leftDate = new Date(String(left.inquiryDate ?? left.updatedAt ?? left.createdAt ?? 0)).getTime();
      const rightDate = new Date(String(right.inquiryDate ?? right.updatedAt ?? right.createdAt ?? 0)).getTime();
      return rightDate - leftDate;
    });
    const latest = sorted[0];
    if (!latest) continue;

    const needsMerge = group.length > 1 || latest.phone !== phone;
    if (!needsMerge) continue;

    await contacts.deleteMany({ _id: { $in: group.map((document) => document._id) } });
    await contacts.insertOne({
      ...latest,
      _id: latest._id,
      phone
    });
  }
}

function normalizeGuestPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value.trim();
  if (/^8\d{10}$/.test(digits)) return `+7${digits.slice(1)}`;
  if (/^7\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+7${digits}`;
  return `+${digits}`;
}
