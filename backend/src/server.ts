import cors from "@fastify/cors";
import Fastify from "fastify";
import { createStubDraft, bookingDraftRequestSchema } from "./booking.js";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { getRoom, listRooms, roomSchema, saveRoom } from "./rooms.js";

migrate();

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

app.get("/api/rooms/:number", async (request, reply) => {
  const { number } = request.params as { number: string };
  const room = getRoom(number);

  if (!room) {
    return reply.status(404).send({ error: "Room not found" });
  }

  return room;
});

app.put("/api/rooms/:number", async (request, reply) => {
  const { number } = request.params as { number: string };
  const result = roomSchema.safeParse({
    ...(request.body as Record<string, unknown>),
    number
  });

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid room",
      details: result.error.flatten()
    });
  }

  return saveRoom(result.data);
});

await app.listen({
  port: config.port,
  host: "127.0.0.1"
});
