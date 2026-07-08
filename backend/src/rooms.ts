import { z } from "zod";
import { db } from "./db.js";

const sleepingPlaceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["double-bed", "three-quarter-bed", "single-bed", "sofa", "fixed-sofa", "sofa-bed", "rollaway", "air-bed", "custom"]),
  title: z.string().min(1),
  count: z.number().int().min(1),
  placesCount: z.number().min(0).optional(),
  normalCapacity: z.number().min(0),
  denseCapacity: z.number().min(0),
  isMain: z.boolean().default(true),
  allowSharedSameGender: z.boolean().default(false),
  pairOnly: z.boolean().default(false),
  childFriendly: z.boolean().default(true),
  adultFriendly: z.boolean().default(true),
  needsPreparation: z.boolean().default(false),
  extraPrice: z.number().int().min(0).default(0),
  notes: z.string().optional().default("")
});
export const roomSchema = z.object({
  id: z.string().min(1),
  number: z.string(),
  title: z.string().min(1),
  sortOrder: z.number().int().min(0),
  group: z.string().optional().default("Без группы"),
  category: z.enum(["guest-room", "staff-room", "amenity"]),
  objectType: z.enum(["room", "house", "amenity", "staff", "sauna", "gazebo", "bbq", "firepit", "parking", "dining"]).optional().default("room"),
  bookable: z.boolean(),
  includedInStay: z.boolean().default(false),
  status: z.enum(["active", "hidden", "repair"]),
  excludeFromBookingSummary: z.boolean().optional().default(false),
  hideInBookingPanel: z.boolean().optional().default(false),
  basePrice: z.number().int().min(0),
  weekdayPrice: z.number().int().min(0).optional().default(0),
  weekendPrice: z.number().int().min(0).optional().default(0),
  holidayPrice: z.number().int().min(0).optional().default(0),
  floor: z.string().optional().default(""),
  occupancyLabel: z.string().optional().default(""),
  bathroomType: z.enum(["inside-room", "private-on-floor", "shared-on-floor", "none"]).optional().default("inside-room"),
  capacityAdults: z.number().int().min(1),
  capacityChildren: z.number().int().min(0),
  extraBeds: z.number().int().min(0),
  extraBedEnabled: z.boolean().optional().default(false),
  extraBedPrice: z.number().int().min(0).optional().default(0),
  extraBedDescription: z.string().optional().default(""),
  beds: z.string().optional().default(""),
  sleepingPlaces: z.array(sleepingPlaceSchema).optional().default([]),
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

export async function deleteRoom(id: string): Promise<boolean> {
  const result = await rooms.deleteOne({ id });
  return result.deletedCount > 0;
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
    group: document.group ?? getDefaultGroup(document.category),
    category: document.category ?? "guest-room",
    objectType: document.objectType ?? getDefaultObjectType(document.category),
    bookable: document.bookable ?? true,
    includedInStay: document.includedInStay ?? false,
    status: document.status ?? "active",
    excludeFromBookingSummary: document.excludeFromBookingSummary ?? false,
    hideInBookingPanel: document.hideInBookingPanel ?? false,
    basePrice: document.basePrice,
    weekdayPrice: document.weekdayPrice ?? document.basePrice ?? 0,
    weekendPrice: document.weekendPrice ?? document.basePrice ?? 0,
    holidayPrice: document.holidayPrice ?? document.weekendPrice ?? document.basePrice ?? 0,
    floor: document.floor ?? "",
    occupancyLabel: document.occupancyLabel ?? "",
    bathroomType: document.bathroomType ?? "inside-room",
    capacityAdults: document.capacityAdults,
    capacityChildren: document.capacityChildren,
    extraBeds: document.extraBeds,
    extraBedEnabled: document.extraBedEnabled ?? false,
    extraBedPrice: document.extraBedPrice ?? 0,
    extraBedDescription: document.extraBedDescription ?? "",
    beds: document.beds ?? "",
    sleepingPlaces: Array.isArray(document.sleepingPlaces) ? document.sleepingPlaces : [],
    description: document.description ?? "",
    amenities: document.amenities ?? "",
    adminNotes: document.adminNotes ?? "",
    photoPaths: Array.isArray(document.photoPaths) ? document.photoPaths : [],
    videoPaths: Array.isArray(document.videoPaths) ? document.videoPaths : []
  };
}

function getDefaultGroup(category: Room["category"]) {
  if (category === "staff-room") return "Блок персонала";
  if (category === "amenity") return "Территория";
  return "Блок А";
}

function getDefaultObjectType(category: Room["category"]) {
  if (category === "amenity") return "amenity";
  if (category === "staff-room") return "staff";
  return "room";
}
