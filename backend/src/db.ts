import { MongoClient } from "mongodb";
import { config } from "./config.js";

export const mongoClient = new MongoClient(config.mongodbUri);
export const db = mongoClient.db(config.mongodbDbName);

export async function connectDatabase() {
  await mongoClient.connect();
  await dropLegacyNumberIndex();
  await migrateLegacyRooms();
  await consolidateSeedRooms();
  await backfillCatalogFields();
  await db.collection("rooms").createIndex({ id: 1 }, { unique: true });
  await seedRooms();
}

export async function closeDatabase() {
  await mongoClient.close();
}

async function seedRooms() {
  const rooms = db.collection("rooms");
  const now = new Date();

  await Promise.all(
    catalogDefaults.map((item, index) =>
      rooms.updateOne(
        { id: item.id },
        {
          $setOnInsert: {
            id: item.id,
            number: item.number,
            title: item.title,
            sortOrder: index,
            category: item.category,
            bookable: item.bookable,
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

const roomNumbers = ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "115"];
const catalogDefaults = [
  ...roomNumbers.map((number) => ({
    id: `room-${number}`,
    number,
    title: `Номер ${number}`,
    category: Number(number) <= 104 ? "staff-room" : "guest-room",
    bookable: Number(number) >= 105
  })),
  {
    id: "amenity-sauna",
    number: "SAUNA",
    title: "Сауна",
    category: "amenity",
    bookable: true
  },
  {
    id: "amenity-gazebo",
    number: "GAZEBO",
    title: "Беседка",
    category: "amenity",
    bookable: true
  },
  {
    id: "amenity-bbq",
    number: "BBQ",
    title: "Мангальная зона",
    category: "amenity",
    bookable: true
  }
];

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

async function consolidateSeedRooms() {
  const rooms = db.collection("rooms");

  for (const [index, number] of roomNumbers.entries()) {
    const documents = await rooms.find({ number }).toArray();
    if (documents.length === 0) {
      continue;
    }

    const preferred = documents.find((room) => room.id === `room-${number}`) ?? documents[0];
    const now = new Date();

    await rooms.updateOne(
      { _id: preferred._id },
      {
        $set: {
          id: `room-${number}`,
          sortOrder: typeof preferred.sortOrder === "number" ? preferred.sortOrder : index,
          category: Number(number) <= 104 ? "staff-room" : "guest-room",
          bookable: Number(number) >= 105,
          updatedAt: now
        }
      }
    );

    const duplicateIds = documents.filter((room) => String(room._id) !== String(preferred._id)).map((room) => room._id);
    if (duplicateIds.length > 0) {
      await rooms.deleteMany({ _id: { $in: duplicateIds } });
    }
  }
}

async function backfillCatalogFields() {
  const rooms = db.collection("rooms");

  for (const item of catalogDefaults) {
    await rooms.updateOne(
      { id: item.id },
      {
        $set: {
          category: item.category,
          bookable: item.bookable,
          updatedAt: new Date()
        }
      }
    );
  }
}
