import { MongoClient } from "mongodb";
import { config } from "./config.js";

export const mongoClient = new MongoClient(config.mongodbUri);
export const db = mongoClient.db(config.mongodbDbName);

export async function connectDatabase() {
  await mongoClient.connect();
  await dropLegacyNumberIndex();
  await migrateLegacyRooms();
  await db.collection("rooms").createIndex({ id: 1 }, { unique: true });
  await db.collection("guestContacts").createIndex({ phone: 1 }, { unique: true });
  await db.collection("guestContacts").createIndex({ inquiryDate: -1 });
}

export async function closeDatabase() {
  await mongoClient.close();
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
