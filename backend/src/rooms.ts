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

interface RoomRow {
  number: string;
  title: string;
  status: "active" | "hidden" | "repair";
  base_price: number;
  floor: string | null;
  capacity_adults: number;
  capacity_children: number;
  extra_beds: number;
  beds: string | null;
  description: string | null;
  amenities: string | null;
  admin_notes: string | null;
  photo_paths: string;
  video_paths: string;
}

export function listRooms(): Room[] {
  const rows = db.prepare("SELECT * FROM rooms ORDER BY number").all() as RoomRow[];
  return rows.map(mapRoomRow);
}

export function getRoom(number: string): Room | null {
  const row = db.prepare("SELECT * FROM rooms WHERE number = ?").get(number) as RoomRow | undefined;
  return row ? mapRoomRow(row) : null;
}

export function saveRoom(room: Room): Room {
  db.prepare(`
    INSERT INTO rooms (
      number,
      title,
      status,
      base_price,
      floor,
      capacity_adults,
      capacity_children,
      extra_beds,
      beds,
      description,
      amenities,
      admin_notes,
      photo_paths,
      video_paths,
      is_active,
      updated_at
    )
    VALUES (
      @number,
      @title,
      @status,
      @basePrice,
      @floor,
      @capacityAdults,
      @capacityChildren,
      @extraBeds,
      @beds,
      @description,
      @amenities,
      @adminNotes,
      @photoPaths,
      @videoPaths,
      @isActive,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(number) DO UPDATE SET
      title = excluded.title,
      status = excluded.status,
      base_price = excluded.base_price,
      floor = excluded.floor,
      capacity_adults = excluded.capacity_adults,
      capacity_children = excluded.capacity_children,
      extra_beds = excluded.extra_beds,
      beds = excluded.beds,
      description = excluded.description,
      amenities = excluded.amenities,
      admin_notes = excluded.admin_notes,
      photo_paths = excluded.photo_paths,
      video_paths = excluded.video_paths,
      is_active = excluded.is_active,
      updated_at = CURRENT_TIMESTAMP
  `).run({
    ...room,
    isActive: room.status === "active" ? 1 : 0,
    photoPaths: JSON.stringify(room.photoPaths),
    videoPaths: JSON.stringify(room.videoPaths)
  });

  return getRoom(room.number) ?? room;
}

function mapRoomRow(row: RoomRow): Room {
  return {
    number: row.number,
    title: row.title,
    status: row.status,
    basePrice: row.base_price,
    floor: row.floor ?? "",
    capacityAdults: row.capacity_adults,
    capacityChildren: row.capacity_children,
    extraBeds: row.extra_beds,
    beds: row.beds ?? "",
    description: row.description ?? "",
    amenities: row.amenities ?? "",
    adminNotes: row.admin_notes ?? "",
    photoPaths: parseJsonArray(row.photo_paths),
    videoPaths: parseJsonArray(row.video_paths)
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}
