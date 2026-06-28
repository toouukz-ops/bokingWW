import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import Fastify from "fastify";
import { mkdir } from "node:fs/promises";
import {
  deleteReservationData,
  getChatDraftData,
  getPaymentSettingsData,
  listExpenseCategories,
  listExpenseEntries,
  listReservations,
  replaceChatDraftData,
  replaceExpenseCategories,
  replaceExpenseEntries,
  replaceReservations,
  savePaymentSettingsData,
  saveReservationData
} from "./appData.js";
import { exportServerBackup, importServerBackup } from "./backup.js";
import { createStubDraft, bookingDraftRequestSchema } from "./booking.js";
import { config } from "./config.js";
import { closeDatabase, connectDatabase } from "./db.js";
import { deleteGuestContact, guestContactSchema, listGuestContacts, saveGuestContact } from "./guestContacts.js";
import { cropPhotoFile, deleteMediaFile, ensureWhatsappVideoFile, saveRoomMediaFile, uploadsRoot } from "./media.js";
import { addRoomMedia, deleteRoom, getRoom, listRooms, removeRoomMedia, replaceRoomMedia, roomSchema, saveRoom } from "./rooms.js";

await connectDatabase();

const app = Fastify({
  bodyLimit: 250 * 1024 * 1024,
  logger: true
});

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || origin === "https://web.whatsapp.com" || origin.startsWith("chrome-extension://")) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed"), false);
  }
});
await app.register(multipart, {
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 1
  }
});
await mkdir(uploadsRoot, { recursive: true });
await app.register(staticFiles, {
  root: uploadsRoot,
  prefix: "/uploads/"
});

const frontendDebugLogs: Array<{
  body: Record<string, unknown>;
  createdAt: string;
}> = [];

app.get("/api/health", async () => {
  return {
    ok: true,
    service: "gpb-whatsapp-booking-backend"
  };
});

app.get("/api/debug/logs", async () => {
  return frontendDebugLogs;
});

app.post("/api/debug/logs", async (request) => {
  const body = request.body as Record<string, unknown> | undefined;
  frontendDebugLogs.push({
    body: body ?? {},
    createdAt: new Date().toISOString()
  });
  if (frontendDebugLogs.length > 200) {
    frontendDebugLogs.splice(0, frontendDebugLogs.length - 200);
  }
  request.log.info({
    source: "frontend",
    debug: body ?? {}
  }, "GPB frontend debug");

  return { ok: true };
});

app.post("/api/booking/draft", async (request, reply) => {
  const result = bookingDraftRequestSchema.safeParse(request.body);

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid request",
      details: result.error.flatten()
    });
  }

  return createStubDraft(result.data.message);
});

app.get("/api/backup/server", async (request) => {
  const query = request.query as Record<string, string | undefined>;
  return exportServerBackup({
    includeGuestContacts: query.guestContacts !== "0",
    includeMedia: query.media !== "0",
    includeRooms: query.rooms !== "0"
  });
});

app.post("/api/backup/server/import", async (request, reply) => {
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return reply.status(400).send({ error: "Invalid backup payload" });
  }

  return importServerBackup(body);
});

app.get("/api/guest-contacts", async () => {
  return listGuestContacts();
});

app.post("/api/guest-contacts", async (request, reply) => {
  const result = guestContactSchema.safeParse(request.body);

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid guest contact",
      details: result.error.flatten()
    });
  }

  return saveGuestContact(result.data);
});

app.delete("/api/guest-contacts/:phone", async (request, reply) => {
  const { phone } = request.params as { phone: string };
  await deleteGuestContact(decodeURIComponent(phone));
  return reply.status(204).send();
});

app.get("/api/reservations", async () => {
  return listReservations();
});

app.put("/api/reservations", async (request) => {
  const body = request.body as { items?: Array<Record<string, unknown>> } | undefined;
  return replaceReservations(Array.isArray(body?.items) ? body.items : []);
});

app.put("/api/reservations/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return reply.status(400).send({ error: "Invalid reservation" });
  }

  return saveReservationData(id, body);
});

app.delete("/api/reservations/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  await deleteReservationData(id);
  return reply.status(204).send();
});

app.get("/api/payment-settings", async () => {
  return { settings: await getPaymentSettingsData() };
});

app.put("/api/payment-settings", async (request) => {
  const body = request.body as { settings?: unknown } | undefined;
  return { settings: await savePaymentSettingsData(body?.settings ?? null) };
});

app.get("/api/expense-categories", async () => {
  return listExpenseCategories();
});

app.put("/api/expense-categories", async (request) => {
  const body = request.body as { items?: Array<Record<string, unknown>> } | undefined;
  return replaceExpenseCategories(Array.isArray(body?.items) ? body.items : []);
});

app.get("/api/expense-entries", async () => {
  return listExpenseEntries();
});

app.put("/api/expense-entries", async (request) => {
  const body = request.body as { items?: Array<Record<string, unknown>> } | undefined;
  return replaceExpenseEntries(Array.isArray(body?.items) ? body.items : []);
});

app.get("/api/chat-drafts", async () => {
  return { drafts: await getChatDraftData() };
});

app.put("/api/chat-drafts", async (request) => {
  const body = request.body as { drafts?: Record<string, unknown> } | undefined;
  const drafts = body?.drafts && typeof body.drafts === "object" && !Array.isArray(body.drafts) ? body.drafts : {};
  return { drafts: await replaceChatDraftData(drafts) };
});

app.get("/api/rooms", async () => {
  return listRooms();
});

app.get("/api/rooms/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const room = await getRoom(id);

  if (!room) {
    return reply.status(404).send({ error: "Room not found" });
  }

  return room;
});

app.put("/api/rooms/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = roomSchema.safeParse({
    ...(request.body as Record<string, unknown>),
    id
  });

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid room",
      details: result.error.flatten()
    });
  }

  return saveRoom(result.data);
});

app.delete("/api/rooms/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const deleted = await deleteRoom(id);

  if (!deleted) {
    return reply.status(404).send({ error: "Room not found" });
  }

  return { ok: true };
});

app.post("/api/rooms/:id/media", async (request, reply) => {
  const { id } = request.params as { id: string };
  const room = await getRoom(id);
  if (!room) {
    return reply.status(404).send({ error: "Room not found" });
  }

  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: "File is required" });
  }

  try {
    const media = await saveRoomMediaFile(id, file);
    const updatedRoom = await addRoomMedia(id, media.mediaType, media.path);
    return updatedRoom;
  } catch (error) {
    request.log.error(error);
    return reply.status(400).send({ error: "Media upload failed" });
  }
});

app.delete("/api/rooms/:id/media", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { path?: string } | undefined;
  if (!body?.path) {
    return reply.status(400).send({ error: "Path is required" });
  }

  await deleteMediaFile(body.path);
  const updatedRoom = await removeRoomMedia(id, body.path);
  if (!updatedRoom) {
    return reply.status(404).send({ error: "Room not found" });
  }

  return updatedRoom;
});

app.post("/api/object-gallery/media", async (request, reply) => {
  const file = await request.file();
  if (!file) {
    return reply.status(400).send({ error: "File is required" });
  }

  try {
    return await saveRoomMediaFile("object-gallery", file);
  } catch (error) {
    request.log.error(error);
    return reply.status(400).send({ error: "Object gallery upload failed" });
  }
});

app.delete("/api/object-gallery/media", async (request, reply) => {
  const body = request.body as { path?: string } | undefined;
  if (!body?.path) {
    return reply.status(400).send({ error: "Path is required" });
  }

  await deleteMediaFile(body.path);
  return reply.status(204).send();
});

app.post("/api/media/whatsapp-video", async (request, reply) => {
  const body = request.body as { path?: string } | undefined;
  if (!body?.path) {
    return reply.status(400).send({ error: "Path is required" });
  }

  try {
    const path = await ensureWhatsappVideoFile(body.path);
    return { path };
  } catch (error) {
    request.log.error(error);
    return reply.status(400).send({ error: "Video conversion failed" });
  }
});

app.post("/api/rooms/:id/media/crop", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { aspectRatio?: number; focalX?: number; focalY?: number; path?: string } | undefined;
  if (!body?.path || !body.aspectRatio) {
    return reply.status(400).send({ error: "Path and aspectRatio are required" });
  }

  const room = await getRoom(id);
  if (!room) {
    return reply.status(404).send({ error: "Room not found" });
  }

  try {
    const croppedPath = await cropPhotoFile(id, body.path, {
      aspectRatio: body.aspectRatio,
      focalX: body.focalX ?? 50,
      focalY: body.focalY ?? 50
    });
    const updatedRoom = await replaceRoomMedia(id, body.path, croppedPath);
    return updatedRoom;
  } catch (error) {
    request.log.error(error);
    return reply.status(400).send({ error: "Crop failed" });
  }
});

const close = async () => {
  await app.close();
  await closeDatabase();
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({
  port: config.port,
  host: process.env.HOST ?? "0.0.0.0"
});
