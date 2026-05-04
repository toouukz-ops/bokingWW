import { z } from "zod";
import { db } from "./db.js";

export const roomSchema = z.object({
  id: z.string().min(1),
  number: z.string().min(1),
  title: z.string().min(1),
  sortOrder: z.number().int().min(0),
  category: z.enum(["guest-room", "staff-room", "amenity"]),
  bookable: z.boolean(),
  includedInStay: z.boolean().default(false),
  status: z.enum(["active", "hidden", "repair"]),
  basePrice: z.number().int().min(0),
  floor: z.string().optional().default(""),
  capacityAdults: z.number().int().min(1),
  capacityChildren: z.number().int().min(0),
  extraBeds: z.number().int().min(0),
  beds: z.string().optional().default(""),
  description: z.string().optional().default(""),
  amenities: z.string().optional().default(""),
  adminNotes: z.string().optional().default(""),
  photoPaths: z.array(z.string()).default([]),
  videoPaths: z.array(z.string()).default([])
});

export type Room = z.infer<typeof roomSchema>;

interface RoomDocument extends Room {
  createdAt: Date;
  updatedAt: Date;
}

const rooms = db.collection<RoomDocument>("rooms");

export async function listRooms(): Promise<Room[]> {
  const documents = await rooms.find().sort({ sortOrder: 1, number: 1 }).toArray();
  return documents.map(mapRoomDocument);
}

export async function getRoom(id: string): Promise<Room | null> {
  const document = await rooms.findOne({ id });
  return document ? mapRoomDocument(document) : null;
}

export async function saveRoom(room: Room): Promise<Room> {
  const now = new Date();

  await rooms.updateOne(
    { id: room.id },
    {
      $set: {
        ...room,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return (await getRoom(room.id)) ?? room;
}

export async function addRoomMedia(id: string, mediaType: "photo" | "video", path: string): Promise<Room | null> {
  const field = mediaType === "photo" ? "photoPaths" : "videoPaths";
  await rooms.updateOne(
    { id },
    {
      $addToSet: { [field]: path },
      $set: { updatedAt: new Date() }
    }
  );

  return getRoom(id);
}

export async function removeRoomMedia(id: string, path: string): Promise<Room | null> {
  await rooms.updateOne(
    { id },
    {
      $pull: {
        photoPaths: path,
        videoPaths: path
      },
      $set: { updatedAt: new Date() }
    }
  );

  return getRoom(id);
}

export async function replaceRoomMedia(id: string, oldPath: string, newPath: string): Promise<Room | null> {
  const room = await getRoom(id);
  if (!room) {
    return null;
  }

  const photoPaths = room.photoPaths.map((path) => (path === oldPath ? newPath : path));
  const videoPaths = room.videoPaths.map((path) => (path === oldPath ? newPath : path));

  await rooms.updateOne(
    { id },
    {
      $set: {
        photoPaths,
        videoPaths,
        updatedAt: new Date()
      }
    }
  );

  return getRoom(id);
}

function mapRoomDocument(document: RoomDocument): Room {
  return {
    id: document.id ?? document.number,
    number: document.number,
    title: document.title,
    sortOrder: document.sortOrder ?? 0,
    category: document.category ?? "guest-room",
    bookable: document.bookable ?? true,
    includedInStay: document.includedInStay ?? false,
    status: document.status,
    basePrice: document.basePrice,
    floor: document.floor ?? "",
    capacityAdults: document.capacityAdults,
    capacityChildren: document.capacityChildren,
    extraBeds: document.extraBeds,
    beds: document.beds ?? "",
    description: document.description ?? "",
    amenities: document.amenities ?? "",
    adminNotes: document.adminNotes ?? "",
    photoPaths: Array.isArray(document.photoPaths) ? document.photoPaths : [],
    videoPaths: Array.isArray(document.videoPaths) ? document.videoPaths : []
  };
}
