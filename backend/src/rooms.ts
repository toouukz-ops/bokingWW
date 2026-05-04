import { z } from "zod";
import { db } from "./db.js";

export const roomSchema = z.object({
  number: z.string().min(1),
  title: z.string().min(1),
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
  const documents = await rooms.find().sort({ number: 1 }).toArray();
  return documents.map(mapRoomDocument);
}

export async function getRoom(number: string): Promise<Room | null> {
  const document = await rooms.findOne({ number });
  return document ? mapRoomDocument(document) : null;
}

export async function saveRoom(room: Room): Promise<Room> {
  const now = new Date();

  await rooms.updateOne(
    { number: room.number },
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

  return (await getRoom(room.number)) ?? room;
}

function mapRoomDocument(document: RoomDocument): Room {
  return {
    number: document.number,
    title: document.title,
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
