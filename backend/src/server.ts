import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import Fastify from "fastify";
import { mkdir } from "node:fs/promises";
import { createStubDraft, bookingDraftRequestSchema } from "./booking.js";
import { config } from "./config.js";
import { closeDatabase, connectDatabase } from "./db.js";
import { deleteMediaFile, saveRoomMediaFile, uploadsRoot } from "./media.js";
import { addRoomMedia, getRoom, listRooms, removeRoomMedia, roomSchema, saveRoom } from "./rooms.js";

await connectDatabase();

const app = Fastify({
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
    fileSize: 80 * 1024 * 1024,
    files: 1
  }
});
await mkdir(uploadsRoot, { recursive: true });
await app.register(staticFiles, {
  root: uploadsRoot,
  prefix: "/uploads/"
});

app.get("/api/health", async () => {
  return {
    ok: true,
    service: "gpb-whatsapp-booking-backend"
  };
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

const close = async () => {
  await app.close();
  await closeDatabase();
};

process.on("SIGINT", close);
process.on("SIGTERM", close);

await app.listen({
  port: config.port,
  host: "127.0.0.1"
});
