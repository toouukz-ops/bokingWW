import { MongoClient } from "mongodb";
import { config } from "./config.js";

export const mongoClient = new MongoClient(config.mongodbUri);
export const db = mongoClient.db(config.mongodbDbName);

export async function connectDatabase() {
  await mongoClient.connect();
  await db.collection("rooms").createIndex({ number: 1 }, { unique: true });
  await seedRooms();
}

export async function closeDatabase() {
  await mongoClient.close();
}

async function seedRooms() {
  const roomNumbers = ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "115"];
  const rooms = db.collection("rooms");
  const now = new Date();

  await Promise.all(
    roomNumbers.map((number) =>
      rooms.updateOne(
        { number },
        {
          $setOnInsert: {
            number,
            title: `Номер ${number}`,
            status: "active",
            basePrice: 0,
            floor: "",
            capacityAdults: 2,
            capacityChildren: 0,
            extraBeds: 0,
            beds: "",
            description: "",
            amenities: "",
            adminNotes: "",
            photoPaths: [],
            videoPaths: [],
            createdAt: now,
            updatedAt: now
          }
        },
        { upsert: true }
      )
    )
  );
}
