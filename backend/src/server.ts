import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import sharp from "sharp";
import {
  claimActiveDialogData,
  claimContactLockData,
  deleteMenuOrderData,
  deleteReservationData,
  deleteChatDraftData,
  deleteExpiredContactLocks,
  deleteRoomHoldData,
  getChatDraftById,
  getChatDraftData,
  getChatStatusSourcesData,
  getChatStatusSourcesForIdentityData,
  listChatMessageDialogs,
  listChatMessages,
  listAiReplyLogs,
  getPaymentSettingsData,
  listActiveDialogs,
  listContactLocks,
  listExpenseCategories,
  listExpenseEntries,
  listMenuOrders,
  listReservationConflictCandidates,
  listReservations,
  listRoomHolds,
  releaseActiveDialogData,
  releaseContactLockData,
  replaceChatDraftData,
  replaceExpenseCategories,
  replaceExpenseEntries,
  replaceReservations,
  saveChatDraftData,
  saveAiReplyLogData,
  saveChatMessagesData,
  saveMenuOrderData,
  savePaymentSettingsData,
  saveReservationData,
  saveRoomHoldData
} from "./appData.js";
import { resolveChatStatus } from "./chatStatusDomain.js";
import { applyReservationAction, isBlockingReservation, type ReservationAction } from "./reservationDomain.js";
import { canonicalizeChatDraftIdentity, mergeChatDraftUpdate, normalizeKazakhstanPhone } from "./chatDraftDomain.js";
import { exportServerBackup, importServerBackup } from "./backup.js";
import { createStubDraft, bookingDraftRequestSchema } from "./booking.js";
import { config } from "./config.js";
import { closeDatabase, connectDatabase, pingDatabase } from "./db.js";
import { deleteGuestContact, getGuestContact, guestContactSchema, listGuestContacts, saveGuestContact } from "./guestContacts.js";
import { cropPhotoFile, deleteMediaFile, ensureWhatsappVideoFile, getLocalUploadPath, saveRoomMediaFile, uploadsRoot } from "./media.js";
import { getMediaContentType, getStoredMedia, openStoredMediaStream, saveStoredMediaBuffer } from "./mediaStore.js";
import { createOpenAiClient } from "./openai.js";
import { addRoomMedia, deleteRoom, getRoom, listRooms, removeRoomMedia, replaceRoomMedia, roomSchema, saveRoom } from "./rooms.js";
import { authenticate, createUser, deleteUser, getAuthenticatedUser, isAuthRequired, listDevices, listUsers, logout, revokeUserSessions, updateDevice, updateUser, writeAudit, type AuthUser } from "./auth.js";

await connectDatabase();

const app = Fastify({
  bodyLimit: 250 * 1024 * 1024,
  logger: true
});

await app.register(cors, {
  maxAge: 86_400,
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === "https://web.whatsapp.com" ||
      origin === "https://bokingww.onrender.com" ||
      origin.startsWith("chrome-extension://")
    ) {
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

const publicApiPaths = new Set([
  "/api/health",
  "/api/public/menu",
  "/api/public/menu-orders"
]);
const BUILT_IN_MIN_EXTENSION_VERSION = "1.0.274";
const MIN_EXTENSION_VERSION = compareVersions(String(process.env.MIN_EXTENSION_VERSION || ""), BUILT_IN_MIN_EXTENSION_VERSION) > 0
  ? String(process.env.MIN_EXTENSION_VERSION)
  : BUILT_IN_MIN_EXTENSION_VERSION;
const EXTENSION_UPDATE_URL = process.env.EXTENSION_UPDATE_URL || "";
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

app.addHook("preHandler", async (request, reply) => {
  const path = request.url.split("?")[0] || "";
  const isPublic = publicApiPaths.has(path) || path.startsWith("/api/public/menu/");
  if (!path.startsWith("/api/") || isPublic) return;
  const query = request.query as { extension_version?: string } | undefined;
  const extensionVersion = String(request.headers["x-gpb-extension-version"] || query?.extension_version || "").trim();
  if (compareVersions(extensionVersion, MIN_EXTENSION_VERSION) < 0) {
    return reply.status(426).send({
      error: "Extension update required",
      code: "EXTENSION_UPDATE_REQUIRED",
      minimumVersion: MIN_EXTENSION_VERSION,
      updateUrl: EXTENSION_UPDATE_URL
    });
  }
  if (path === "/api/auth/login") return;
  const auth = await getAuthenticatedUser(request);
  if (auth) {
    (request as FastifyRequest & { authUser?: AuthUser }).authUser = auth.user;
    return;
  }
  if (isAuthRequired()) return reply.status(401).send({ error: "Authentication required", code: "AUTH_REQUIRED" });
});

function compareVersions(left: string, right: string) {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10));
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (!left || leftParts.some((part) => !Number.isFinite(part))) return -1;
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

app.addHook("onResponse", async (request, reply) => {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
  const actor = getRequestAuthUser(request);
  if (!actor || request.url.startsWith("/api/auth/") || request.url.startsWith("/api/debug/")) return;
  await writeAudit("api.mutation", actor, request, { statusCode: reply.statusCode });
});

app.post("/api/auth/login", async (request, reply) => {
  const key = request.ip;
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    return reply.status(429).send({ error: "Too many login attempts" });
  }
  const body = request.body as { username?: string; password?: string; deviceId?: string; deviceName?: string } | undefined;
  const result = await authenticate(String(body?.username || ""), String(body?.password || ""), { deviceId: String(body?.deviceId || ""), deviceName: String(body?.deviceName || "") }, request);
  if (!result) {
    loginAttempts.set(key, { count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1, resetAt: now + 15 * 60 * 1000 });
    return reply.status(401).send({ error: "Invalid login or password" });
  }
  if (result.denied) {
    const status = result.reason === "DEVICE_PENDING" ? 403 : 401;
    return reply.status(status).send({ error: result.reason, code: result.reason });
  }
  loginAttempts.delete(key);
  return result;
});

app.get("/api/auth/me", async (request, reply) => {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return reply.status(401).send({ error: "Authentication required" });
  return { user: auth.user };
});

app.post("/api/auth/logout", async (request, reply) => {
  await logout(request);
  return reply.status(204).send();
});

app.get("/api/auth/users", async (request, reply) => {
  const actor = getRequestAuthUser(request);
  if (!actor || actor.role !== "admin") return reply.status(403).send({ error: "Admin access required" });
  return { users: await listUsers() };
});

app.post("/api/auth/users", async (request, reply) => {
  const actor = getRequestAuthUser(request);
  if (!actor || actor.role !== "admin") return reply.status(403).send({ error: "Admin access required" });
  try {
    const body = request.body as { username?: string; displayName?: string; password?: string; role?: "admin" | "operator" };
    const user = await createUser({ username: String(body.username || ""), displayName: String(body.displayName || ""), password: String(body.password || ""), role: body.role === "admin" ? "admin" : "operator" });
    await writeAudit("user.created", actor, request, { userId: user.id, username: user.username, role: user.role });
    return reply.status(201).send({ user });
  } catch (error) {
    return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.patch("/api/auth/users/:id", async (request, reply) => {
  const actor = getRequestAuthUser(request);
  if (!actor || actor.role !== "admin") return reply.status(403).send({ error: "Admin access required" });
  try {
    const { id } = request.params as { id: string };
    const user = await updateUser(id, request.body as { active?: boolean; displayName?: string; password?: string; role?: "admin" | "operator" });
    if (!user) return reply.status(404).send({ error: "User not found" });
    await writeAudit("user.updated", actor, request, { userId: id });
    return { user };
  } catch (error) {
    return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete("/api/auth/users/:id/sessions", async (request, reply) => {
  const actor = getRequestAuthUser(request);
  if (!actor || actor.role !== "admin") return reply.status(403).send({ error: "Admin access required" });
  const { id } = request.params as { id: string };
  const revoked = await revokeUserSessions(id);
  await writeAudit("user.sessions.revoked", actor, request, { userId: id, revoked });
  return { revoked };
});

app.delete("/api/auth/users/:id", async (request, reply) => {
  const actor = getRequestAuthUser(request);
  if (!actor || actor.role !== "admin") return reply.status(403).send({ error: "Admin access required" });
  try {
    const { id } = request.params as { id: string };
    const deleted = await deleteUser(id, actor.id);
    if (!deleted) return reply.status(404).send({ error: "User not found" });
    await writeAudit("user.deleted", actor, request, { userId: id, username: deleted.username });
    return { deleted: true };
  } catch (error) {
    return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/auth/devices", async (request, reply) => {
  const actor = getRequestAuthUser(request);
  if (!actor || actor.role !== "admin") return reply.status(403).send({ error: "Admin access required" });
  return { devices: await listDevices() };
});

app.patch("/api/auth/devices/:id", async (request, reply) => {
  const actor = getRequestAuthUser(request);
  if (!actor || actor.role !== "admin") return reply.status(403).send({ error: "Admin access required" });
  const { id } = request.params as { id: string };
  const body = request.body as { status?: "approved" | "blocked" };
  if (body.status !== "approved" && body.status !== "blocked") return reply.status(400).send({ error: "Invalid device status" });
  try {
    const device = await updateDevice(id, body.status);
    if (!device) return reply.status(404).send({ error: "Device not found" });
    await writeAudit(`device.${body.status}`, actor, request, { deviceId: device.deviceId, userId: String(device.userId) });
    return { ok: true };
  } catch (error) {
    return reply.status(400).send({ error: error instanceof Error ? error.message : String(error) });
  }
});

function getRequestAuthUser(request: FastifyRequest) {
  return (request as FastifyRequest & { authUser?: AuthUser }).authUser ?? null;
}

const mediaCacheControl = "public, max-age=31536000, immutable";
const menuThumbnailWidth = 640;
const menuThumbnailQuality = 72;

app.get("/uploads/thumb/*", async (request, reply) => {
  const params = request.params as { "*": string };
  const requestedPath = params["*"] ?? "";
  const sourceSuffix = requestedPath.endsWith(".webp") ? requestedPath.slice(0, -5) : requestedPath;
  const sourcePath = `/uploads/${sourceSuffix}`;
  const thumbnailPath = `/uploads/thumb/${sourceSuffix}.webp`;
  const localThumbnailPath = getLocalUploadPath(thumbnailPath);

  if (localThumbnailPath) {
    try {
      await stat(localThumbnailPath);
      return sendUploadMedia(thumbnailPath, reply);
    } catch {
      // Continue with durable cache/source lookup.
    }
  }

  const storedThumbnail = await getStoredMedia(thumbnailPath);
  if (storedThumbnail) {
    const thumbnail = await readStoredMediaBuffer(thumbnailPath);
    await writeLocalUploadBuffer(thumbnailPath, thumbnail);
    reply.header("Cache-Control", mediaCacheControl);
    reply.header("content-length", String(thumbnail.length));
    reply.type("image/webp");
    return reply.send(thumbnail);
  }

  try {
    const thumbnail = await createMenuThumbnail(sourcePath);
    await writeLocalUploadBuffer(thumbnailPath, thumbnail);
    await saveStoredMediaBuffer(thumbnailPath, thumbnail);
    reply.header("Cache-Control", mediaCacheControl);
    reply.header("content-length", String(thumbnail.length));
    reply.type("image/webp");
    return reply.send(thumbnail);
  } catch {
    return sendUploadMedia(sourcePath, reply);
  }
});

app.get("/uploads/*", async (request, reply) => {
  const params = request.params as { "*": string };
  const publicPath = `/uploads/${params["*"] ?? ""}`;
  return sendUploadMedia(publicPath, reply);
});

async function sendUploadMedia(publicPath: string, reply: FastifyReply) {
  const localPath = getLocalUploadPath(publicPath);

  if (localPath) {
    try {
      const localStat = await stat(localPath);
      reply.header("Cache-Control", mediaCacheControl);
      reply.type(getMediaContentType(publicPath));
      reply.header("content-length", String(localStat.size));
      return reply.send(createReadStream(localPath));
    } catch {
      // Fall through to durable Mongo storage.
    }
  }

  const storedMedia = await getStoredMedia(publicPath);
  if (!storedMedia) {
    return reply.status(404).send({ error: "Media not found" });
  }

  reply.header("Cache-Control", mediaCacheControl);
  reply.type(String(storedMedia.contentType || getMediaContentType(publicPath)));
  if (typeof storedMedia.length === "number") {
    reply.header("content-length", String(storedMedia.length));
  }
  return reply.send(openStoredMediaStream(storedMedia._id));
}

async function createMenuThumbnail(publicPath: string) {
  const localPath = getLocalUploadPath(publicPath);
  let image: sharp.Sharp;

  if (localPath) {
    try {
      await stat(localPath);
      image = sharp(localPath);
    } catch {
      image = sharp(await readStoredMediaBuffer(publicPath));
    }
  } else {
    image = sharp(await readStoredMediaBuffer(publicPath));
  }

  return image
    .rotate()
    .resize({ width: menuThumbnailWidth, withoutEnlargement: true })
    .webp({ quality: menuThumbnailQuality })
    .toBuffer();
}

async function readStoredMediaBuffer(publicPath: string) {
  const storedMedia = await getStoredMedia(publicPath);
  if (!storedMedia) {
    throw new Error("Media not found");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of openStoredMediaStream(storedMedia._id)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function writeLocalUploadBuffer(publicPath: string, data: Buffer) {
  const localPath = getLocalUploadPath(publicPath);
  if (!localPath) return;

  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, data);
}

const frontendDebugLogs: Array<{
  body: Record<string, unknown>;
  createdAt: string;
}> = [];
const realtimeClients = new Set<{ clientId: string; send: (event: string, data: unknown) => void }>();
type ChatStatusSources = {
  drafts: Record<string, unknown>;
  reservations: Array<Record<string, unknown> & { id: string }>;
};
let chatStatusSourcesCache: ChatStatusSources | null = null;
let chatStatusSourcesRefresh: Promise<ChatStatusSources> | null = null;

function getCachedChatStatusSources() {
  if (chatStatusSourcesCache) return Promise.resolve(chatStatusSourcesCache);
  if (chatStatusSourcesRefresh) return chatStatusSourcesRefresh;
  chatStatusSourcesRefresh = getChatStatusSourcesData()
    .then((sources) => {
      chatStatusSourcesCache = sources;
      return sources;
    })
    .finally(() => {
      chatStatusSourcesRefresh = null;
    });
  return chatStatusSourcesRefresh;
}

function replaceCachedReservationStatusSources(items: ChatStatusSources["reservations"]) {
  if (!chatStatusSourcesCache) return;
  chatStatusSourcesCache = { ...chatStatusSourcesCache, reservations: items };
}

function upsertCachedReservationStatusSource(reservation: ChatStatusSources["reservations"][number]) {
  if (!chatStatusSourcesCache) return;
  chatStatusSourcesCache = {
    ...chatStatusSourcesCache,
    reservations: chatStatusSourcesCache.reservations
      .filter((item) => item.id !== reservation.id)
      .concat(reservation)
  };
}

function deleteCachedReservationStatusSource(id: string) {
  if (!chatStatusSourcesCache) return;
  chatStatusSourcesCache = {
    ...chatStatusSourcesCache,
    reservations: chatStatusSourcesCache.reservations.filter((item) => item.id !== id)
  };
}

function replaceCachedChatDraftStatusSources(drafts: Record<string, unknown>) {
  if (!chatStatusSourcesCache) return;
  chatStatusSourcesCache = { ...chatStatusSourcesCache, drafts };
}

function upsertCachedChatDraftStatusSource(chatId: string, draft: unknown) {
  if (!chatStatusSourcesCache) return;
  chatStatusSourcesCache = {
    ...chatStatusSourcesCache,
    drafts: { ...chatStatusSourcesCache.drafts, [chatId]: draft }
  };
}

function deleteCachedChatDraftStatusSource(chatId: string) {
  if (!chatStatusSourcesCache) return;
  const drafts = { ...chatStatusSourcesCache.drafts };
  delete drafts[chatId];
  chatStatusSourcesCache = { ...chatStatusSourcesCache, drafts };
}

function broadcastRealtime(event: string, data: unknown, sourceClientId = "") {
  for (const client of realtimeClients) {
    if (sourceClientId && client.clientId === sourceClientId) continue;
    client.send(event, data);
  }
}

function toReservationText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeReservationPhone(value: unknown) {
  return normalizeKazakhstanPhone(toReservationText(value));
}

function reservationDateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return Boolean(leftStart && leftEnd && rightStart && rightEnd && leftStart < rightEnd && rightStart < leftEnd);
}

function getReservationBlockingItemsForServer(reservation: Record<string, unknown>) {
  const checkIn = toReservationText(reservation.checkIn);
  const checkOut = toReservationText(reservation.checkOut);
  const roomIds = Array.isArray(reservation.roomIds)
    ? reservation.roomIds.map((roomId) => toReservationText(roomId)).filter(Boolean)
    : [];
  const items = Array.isArray(reservation.items)
    ? reservation.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];

  if (items.length) {
    return items
      .map((item) => ({
        checkIn: toReservationText(item.checkIn) || checkIn,
        checkOut: toReservationText(item.checkOut) || checkOut,
        roomId: toReservationText(item.roomId)
      }))
      .filter((item) => item.roomId && item.checkIn && item.checkOut);
  }

  return roomIds.map((roomId) => ({ checkIn, checkOut, roomId })).filter((item) => item.roomId && item.checkIn && item.checkOut);
}

function reservationBlockingItemsEqual(
  leftItems: Array<{ checkIn: string; checkOut: string; roomId: string }>,
  rightItems: Array<{ checkIn: string; checkOut: string; roomId: string }>
) {
  const serialize = (item: { checkIn: string; checkOut: string; roomId: string }) => `${item.roomId}|${item.checkIn}|${item.checkOut}`;
  const left = leftItems.map(serialize).sort();
  const right = rightItems.map(serialize).sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function isServerBlockingReservation(reservation: Record<string, unknown>) {
  return isBlockingReservation(reservation);
}

async function validateReservationBeforeSave(id: string, reservation: Record<string, unknown>) {
  if (!isServerBlockingReservation(reservation)) return { ok: true as const };

  const normalizedReservationPhone = normalizeReservationPhone(reservation.phone);
  if (!normalizedReservationPhone) {
    return {
      error: "Reservation phone is required",
      ok: false as const,
      status: 400
    };
  }

  const contact = await getGuestContact(normalizedReservationPhone);
  if (!contact) {
    return {
      error: "Guest contact must be saved before reservation",
      ok: false as const,
      status: 409
    };
  }

  const nextItems = getReservationBlockingItemsForServer({ ...reservation, id });
  if (!nextItems.length) return { ok: true as const };

  const reservations = await listReservationConflictCandidates(id, nextItems.map((item) => item.roomId));
  const existingReservation = reservations.find((candidate) => candidate.id === id);
  if (
    existingReservation &&
    isServerBlockingReservation(existingReservation) &&
    reservationBlockingItemsEqual(nextItems, getReservationBlockingItemsForServer(existingReservation))
  ) {
    return { ok: true as const };
  }

  for (const candidate of reservations) {
    if (candidate.id === id || !isServerBlockingReservation(candidate)) continue;
    const candidateItems = getReservationBlockingItemsForServer(candidate);
    const conflict = nextItems.find((nextItem) =>
      candidateItems.some((candidateItem) =>
        nextItem.roomId === candidateItem.roomId &&
        reservationDateRangesOverlap(nextItem.checkIn, nextItem.checkOut, candidateItem.checkIn, candidateItem.checkOut)
      )
    );
    if (!conflict) continue;

    return {
      conflictReservationId: candidate.id,
      error: "Room is already reserved for this period",
      ok: false as const,
      roomId: conflict.roomId,
      status: 409
    };
  }

  return { ok: true as const };
}

function getPublicMenuItems(settings: unknown) {
  const menuItems = settings && typeof settings === "object" && !Array.isArray(settings) && Array.isArray((settings as Record<string, unknown>).menuItems)
    ? (settings as Record<string, unknown>).menuItems as unknown[]
    : [];
  return menuItems
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item) => ({
      id: toSafeString(item.id),
      title: toSafeString(item.title),
      photoPath: toSafeString(item.photoPath),
      price: toSafeNumber(item.price),
      cookingTime: toSafeString(item.cookingTime),
      composition: toSafeString(item.composition)
    }))
    .filter((item) => item.id && item.title && item.price >= 0);
}

function getPublicMenuIntroText(settings: unknown) {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const introText = toSafeString((settings as Record<string, unknown>).menuIntroText);
    if (introText) return introText;
  }
  return "Не тратьте время на поиск еды. Оформите заказ заранее, и к вашему приезду в Green Pine Burabay еда будет готова.";
}

function normalizeMenuOrderPhone(value: unknown) {
  const digits = toSafeString(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return "";
}

function normalizeMenuOrderPayload(payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  const items = Array.isArray(payload.items)
    ? payload.items
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .map((item) => {
        const quantity = Math.max(1, Math.min(99, Math.round(toSafeNumber(item.quantity) || 1)));
        const price = Math.max(0, toSafeNumber(item.price));
        return {
          id: toSafeString(item.id) || `order-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          menuItemId: toSafeString(item.menuItemId),
          title: toSafeString(item.title),
          price,
          quantity,
          total: price * quantity
        };
      })
      .filter((item) => item.menuItemId && item.title && item.quantity > 0)
    : [];
  const roomNumbers = Array.isArray(payload.roomNumbers)
    ? payload.roomNumbers.map((room) => toSafeString(room)).filter(Boolean)
    : [];
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const servingModeText = toSafeString(payload.servingMode);
  const servingMode = servingModeText === "takeaway" || servingModeText === "arrival" ? servingModeText : "ready";
  const paymentStatusText = toSafeString(payload.paymentStatus);
  const paymentStatus = paymentStatusText === "paid" || paymentStatusText === "payOnArrival" ? paymentStatusText : "unpaid";
  const statusText = toSafeString(payload.status);
  const validStatuses = new Set(["new", "confirmed", "sentToKitchen", "cooking", "ready", "done", "cancelled"]);

  return {
    id: toSafeString(payload.id) || `menu-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: toSafeString(payload.source) === "qr" ? "qr" : "reservation-link",
    reservationId: toSafeString(payload.reservationId),
    guestName: toSafeString(payload.guestName) || "Гость",
    phone: normalizeMenuOrderPhone(payload.phone),
    roomNumbers,
    checkIn: toSafeString(payload.checkIn),
    readyDate: toDateInput(payload.readyDate) || new Date().toISOString().slice(0, 10),
    readyTime: /^\d{2}:\d{2}$/.test(toSafeString(payload.readyTime)) ? toSafeString(payload.readyTime) : "",
    servingMode,
    comment: toSafeString(payload.comment).slice(0, 600),
    items,
    total,
    status: validStatuses.has(statusText) ? statusText : "new",
    paymentStatus,
    kitchenSentAt: toSafeString(payload.kitchenSentAt),
    doneAt: toSafeString(payload.doneAt),
    archivedAt: toSafeString(payload.archivedAt),
    createdAt: toSafeString(payload.createdAt) || now,
    updatedAt: now
  };
}

async function enrichMenuOrderPayloadFromReservation(payload: Record<string, unknown>) {
  const reservationId = toSafeString(payload.reservationId);
  if (!reservationId) return payload;

  const reservations = await listReservations();
  const reservation = reservations.find((item) => toSafeString(item.id) === reservationId);
  if (!reservation) return payload;

  const roomIdSet = new Set<string>();
  if (Array.isArray(reservation.roomIds)) {
    reservation.roomIds.forEach((roomId) => {
      const value = toSafeString(roomId);
      if (value) roomIdSet.add(value);
    });
  }
  if (Array.isArray(reservation.items)) {
    reservation.items
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .forEach((item) => {
        const roomId = toSafeString(item.roomId);
        if (roomId) roomIdSet.add(roomId);
      });
  }

  const rooms = roomIdSet.size ? await listRooms() : [];
  const roomNumbers = rooms
    .filter((room) => roomIdSet.has(room.id))
    .map((room) => toSafeString(room.number) || toSafeString(room.title))
    .filter(Boolean);

  return {
    ...payload,
    guestName: toSafeString(payload.guestName) || toSafeString(reservation.guestFirstName) || toSafeString(reservation.guestName) || "Гость",
    phone: normalizeMenuOrderPhone(payload.phone) || normalizeMenuOrderPhone(reservation.phone),
    roomNumbers: Array.isArray(payload.roomNumbers) && payload.roomNumbers.length ? payload.roomNumbers : roomNumbers,
    checkIn: toSafeString(payload.checkIn) || toSafeString(reservation.checkIn)
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPublicMenuPage(reservationId: string) {
  const safeReservationId = escapeHtml(reservationId);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Меню Green Pine Burabay</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; color: #17212b; background: #f5f7f8; }
    .page { max-width: 1120px; margin: 0 auto; padding: 18px; }
    .hero { background: #0f6b57; color: white; border-radius: 8px; padding: 22px; margin-bottom: 16px; }
    .hero h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.1; }
    .hero p { margin: 0; font-size: 16px; line-height: 1.45; max-width: 720px; }
    .order-hours { margin: 14px 0 0; display: inline-flex; align-items: center; border-radius: 8px; background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.28); padding: 10px 12px; font-size: 21px; line-height: 1.2; font-weight: 900; }
    .guest { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; font-weight: 700; }
    .guest span { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 7px 10px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .card, .cart { background: white; border: 1px solid #d9e1e6; border-radius: 8px; overflow: hidden; }
    .photo { width: 100%; aspect-ratio: 4 / 3; background: #e8edf0; object-fit: cover; display: block; }
    .body { padding: 12px; }
    .title { display: flex; justify-content: space-between; gap: 10px; font-weight: 800; font-size: 17px; }
    .price { color: #0f6b57; white-space: nowrap; }
    .meta { margin: 8px 0 0; color: #637080; font-size: 13px; line-height: 1.35; }
    .actions { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 12px; }
    .qty { display: inline-flex; align-items: center; border: 1px solid #cfd8df; border-radius: 7px; overflow: hidden; }
    .qty button, .add, .submit { border: 0; min-height: 38px; font-weight: 800; cursor: pointer; }
    .qty button { width: 38px; background: white; color: #0f6b57; font-size: 18px; }
    .qty span { width: 34px; text-align: center; font-weight: 800; }
    .add, .submit { background: #0f6b57; color: white; border-radius: 7px; padding: 0 14px; }
    .cart { position: sticky; top: 12px; padding: 14px; }
    .cart h2 { margin: 0 0 12px; font-size: 20px; }
    .cart-line { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 9px 0; border-bottom: 1px solid #eef1f3; }
    .cart-line small { color: #637080; }
    .form { display: grid; gap: 10px; margin-top: 12px; }
    .phone-field[hidden] { display: none; }
    label { display: grid; gap: 5px; font-size: 13px; font-weight: 800; color: #495667; }
    input, textarea, select { width: 100%; border: 1px solid #cfd8df; border-radius: 7px; min-height: 42px; padding: 9px 10px; font: inherit; background: white; }
    textarea { min-height: 74px; resize: vertical; }
    .schedule-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: stretch; }
    .schedule-fields[hidden] { display: none; }
    .schedule-card { min-width: 0; border: 2px solid #d6e1e7; border-radius: 8px; background: linear-gradient(180deg, #ffffff 0%, #f4fbf8 100%); padding: 10px; box-shadow: 0 8px 18px rgba(15, 107, 87, .08); cursor: pointer; }
    .schedule-card:focus-within { border-color: #0f6b57; box-shadow: 0 0 0 4px rgba(15, 107, 87, .14), 0 10px 22px rgba(15, 107, 87, .12); }
    .schedule-label { display: flex; align-items: center; gap: 7px; color: #17212b; font-size: 15px; font-weight: 900; line-height: 1; }
    .schedule-icon { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: white; box-shadow: 0 6px 14px rgba(15, 107, 87, .18); flex: 0 0 auto; }
    .schedule-icon svg { width: 17px; height: 17px; stroke-width: 2.4; }
    .schedule-date-icon { background: #0f84ff; }
    .schedule-time-icon { background: #f59f00; }
    .schedule-card input { min-height: 44px; border: 0; border-radius: 0; padding: 7px 0 0; background: transparent; color: #17212b; font-size: 18px; font-weight: 900; letter-spacing: 0; }
    .schedule-card input:focus { outline: 0; }
    .schedule-card input::-webkit-calendar-picker-indicator { opacity: 1; cursor: pointer; transform: scale(1.15); }
    .toggle { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .toggle button { border: 1px solid #cfd8df; background: white; border-radius: 7px; min-height: 42px; font-weight: 800; cursor: pointer; }
    .toggle button.active { border-color: #0f6b57; background: #e9f7f2; color: #0f6b57; }
    .total { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 20px; font-weight: 900; }
    .empty, .status { color: #637080; line-height: 1.4; }
    .status.success { color: #0f6b57; font-weight: 800; }
    .status.error { color: #b42318; font-weight: 800; }
    .order-summary { display: none; margin-top: 12px; border: 1px solid #cfe4dd; background: #f2fbf7; border-radius: 8px; padding: 12px; }
    .order-summary.is-visible { display: block; }
    .order-summary h3 { margin: 0 0 8px; font-size: 18px; }
    .order-summary pre { margin: 0; white-space: pre-wrap; font: 700 14px/1.45 Inter, Arial, sans-serif; color: #17212b; }
    .summary-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .summary-actions .wide { grid-column: 1 / -1; }
    .summary-actions button { border: 1px solid #cfd8df; background: white; border-radius: 7px; min-height: 38px; font-weight: 800; color: #17212b; cursor: pointer; }
    .confirm-backdrop { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 18px; background: rgba(23,33,43,.54); }
    .confirm-backdrop[hidden] { display: none; }
    .confirm-modal { width: min(460px, 100%); border-radius: 10px; background: white; border: 1px solid #d9e1e6; box-shadow: 0 18px 60px rgba(23,33,43,.28); padding: 16px; }
    .confirm-modal h2 { margin: 0 0 8px; font-size: 22px; }
    .confirm-modal pre { margin: 0; white-space: pre-wrap; font: 800 15px/1.45 Inter, Arial, sans-serif; color: #17212b; }
    .confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    .confirm-actions button { border-radius: 7px; min-height: 42px; font-weight: 900; cursor: pointer; }
    .confirm-actions .cancel { border: 1px solid #cfd8df; background: white; color: #17212b; }
    .confirm-actions .confirm { border: 0; background: #0f6b57; color: white; }
    @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .cart { position: static; } .page { padding: 10px; } .order-hours { display: flex; font-size: 18px; } .schedule-fields { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; } .schedule-card { padding: 9px; } .schedule-label { font-size: 14px; } .schedule-card input { font-size: 16px; } }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <h1>Меню Green Pine Burabay</h1>
      <p id="intro">Не тратьте время на поиск еды. Оформите заказ заранее, и к вашему приезду в Green Pine Burabay еда будет готова.</p>
      <div class="order-hours">Заказы принимаются до 17:00 и выдаются до 18:00</div>
      <div class="guest" id="guest"></div>
    </section>
    <main class="layout">
      <section class="grid" id="menu"></section>
      <aside class="cart">
        <h2>Ваш заказ</h2>
        <div id="cart"></div>
        <div class="form">
          <label>Как подать заказ</label>
          <div class="toggle">
            <button type="button" class="active" id="ready">Подать по готовности</button>
            <button type="button" id="takeaway">Упаковать с собой</button>
            <button type="button" id="arrival">Подготовить к приезду</button>
          </div>
          <label class="phone-field" id="phoneField" hidden>Телефон для связи<input id="customerPhone" type="tel" inputmode="tel" placeholder="+7 700 123 55 66"></label>
          <div class="schedule-fields" id="scheduleFields" hidden>
            <label class="schedule-card">
              <span class="schedule-label">
                <span class="schedule-icon schedule-date-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M8 2v4M16 2v4M4 10h16M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>
                </span>
                <span>Дата</span>
              </span>
              <input id="readyDate" type="date">
            </label>
            <label class="schedule-card">
              <span class="schedule-label">
                <span class="schedule-icon schedule-time-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                </span>
                <span>Время</span>
              </span>
              <input id="readyTime" type="time">
            </label>
          </div>
          <label>Комментарий<textarea id="comment" placeholder="Например: без лука, приборы положить"></textarea></label>
        </div>
        <div class="total"><span>Итого</span><span id="total">0 тг</span></div>
        <button class="submit" style="width:100%;margin-top:12px" id="submit">Оформить заказ</button>
        <p class="status" id="status"></p>
        <section class="order-summary" id="orderSummary">
          <h3>Ваш заказ</h3>
          <pre id="orderSummaryText"></pre>
          <div class="summary-actions">
            <button type="button" id="copyOrder">Скопировать</button>
            <button type="button" id="saveOrder">Сохранить</button>
            <button class="wide" type="button" id="downloadOrder">Скачать TXT</button>
          </div>
        </section>
      </aside>
    </main>
  </div>
  <div class="confirm-backdrop" id="confirmBackdrop" hidden>
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
      <h2 id="confirmTitle">Проверьте заказ</h2>
      <pre id="confirmText"></pre>
      <div class="confirm-actions">
        <button class="cancel" type="button" id="confirmCancel">Изменить</button>
        <button class="confirm" type="button" id="confirmSubmit">Все верно</button>
      </div>
    </div>
  </div>
  <script>
    const reservationId = "${safeReservationId}";
    const menuParams = new URLSearchParams(window.location.search);
    const menuGuestName = (menuParams.get("name") || "").trim();
    const menuGuestPhone = (menuParams.get("phone") || "").trim();
    const state = { items: [], reservation: null, cart: {}, servingMode: "ready" };
    const money = (value) => new Intl.NumberFormat("ru-RU").format(value || 0) + " тг";
    const today = () => new Date().toISOString().slice(0, 10);
    function nextReadyTime() {
      const date = new Date();
      date.setMinutes(Math.ceil((date.getMinutes() + 20) / 30) * 30, 0, 0);
      return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
    }
    function mediaUrl(path) {
      if (!path) return "";
      return path.startsWith("/uploads/") ? "/uploads/thumb/" + path.replace(/^\\/uploads\\//, "") + ".webp" : path;
    }
    function normalizePhone(value) {
      const digits = String(value || "").replace(/\\D/g, "");
      if (!digits) return "";
      if (digits.length === 10) return "+7" + digits;
      if (digits.length === 11 && digits.startsWith("8")) return "+7" + digits.slice(1);
      if (digits.length === 11 && digits.startsWith("7")) return "+" + digits;
      return "";
    }
    function getKnownPhone() {
      const r = state.reservation || {};
      return normalizePhone(r.phone || menuGuestPhone);
    }
    function getGuestName(phone) {
      const r = state.reservation || {};
      const name = r.guestName || menuGuestName || "";
      if (name && name !== "Гость") return name;
      const digits = String(phone || "").replace(/\\D/g, "");
      return digits.length >= 4 ? "Гость " + digits.slice(-4) : "Гость";
    }
    function extractTimeFromComment(value) {
      const match = String(value || "").match(/(?:^|\\D)([01]?\\d|2[0-3])[:.]([0-5]\\d)(?:\\D|$)/);
      if (!match) return "";
      return String(match[1]).padStart(2, "0") + ":" + match[2];
    }
    function isKitchenReadyTimeAllowed(value) {
      if (!value) return true;
      return value <= "18:00";
    }
    function setStatus(text, tone) {
      const node = document.getElementById("status");
      node.textContent = text || "";
      node.className = "status" + (tone ? " " + tone : "");
    }
    function renderGuest() {
      const guest = document.getElementById("guest");
      const r = state.reservation || {};
      const phone = getKnownPhone();
      const tags = [
        r.guestName || menuGuestName || "",
        phone,
        (r.roomNumbers || []).length ? "Номер " + r.roomNumbers.join(", ") : "",
        r.checkIn ? "Заезд " + r.checkIn : ""
      ].filter(Boolean);
      guest.innerHTML = (tags.length ? tags : ["Гость кафе"]).map((item) => "<span>" + item + "</span>").join("");
      const phoneField = document.getElementById("phoneField");
      const phoneInput = document.getElementById("customerPhone");
      phoneField.hidden = Boolean(phone);
      if (phone && !phoneInput.value) phoneInput.value = phone;
    }
    function renderMenu() {
      const menu = document.getElementById("menu");
      if (!state.items.length) {
        menu.innerHTML = '<div class="empty">Меню пока не заполнено.</div>';
        return;
      }
      menu.innerHTML = state.items.map((item, index) => {
        const count = state.cart[item.id]?.quantity || 0;
        const imageLoading = index < 2 ? "eager" : "lazy";
        const imagePriority = index === 0 ? "high" : "auto";
        return '<article class="card">' +
          (item.photoPath ? '<img class="photo" src="' + mediaUrl(item.photoPath) + '" alt="" loading="' + imageLoading + '" fetchpriority="' + imagePriority + '" decoding="async">' : '<div class="photo"></div>') +
          '<div class="body">' +
          '<div class="title"><span>' + item.title + '</span><span class="price">' + money(item.price) + '</span></div>' +
          '<p class="meta">' + [item.composition, item.cookingTime ? "Время: " + item.cookingTime : ""].filter(Boolean).join("<br>") + '</p>' +
          '<div class="actions"><div class="qty"><button type="button" onclick="changeQty(\\'' + item.id + '\\', -1)">-</button><span>' + count + '</span><button type="button" onclick="changeQty(\\'' + item.id + '\\', 1)">+</button></div>' +
          '<button class="add" type="button" onclick="changeQty(\\'' + item.id + '\\', 1)">Добавить</button></div>' +
          '</div></article>';
      }).join("");
    }
    function renderCart() {
      const cart = document.getElementById("cart");
      const lines = Object.values(state.cart);
      if (!lines.length) {
        cart.innerHTML = '<p class="empty">Выберите блюда из меню.</p>';
      } else {
        cart.innerHTML = lines.map((line) => '<div class="cart-line"><div><strong>' + line.title + '</strong><br><small>' + line.quantity + ' x ' + money(line.price) + '</small></div><strong>' + money(line.price * line.quantity) + '</strong></div>').join("");
      }
      document.getElementById("total").textContent = money(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
    }
    function getOrderTotal() {
      return Object.values(state.cart).reduce((sum, line) => sum + line.price * line.quantity, 0);
    }
    function servingModeLabel(mode) {
      if (mode === "takeaway") return "упаковать с собой";
      if (mode === "arrival") return "подготовить к приезду";
      return "подать по готовности";
    }
    function buildOrderSummaryText(order) {
      const itemLines = order.items.map((line, index) => (index + 1) + ". " + line.title + " x" + line.quantity + " | " + money(line.price) + " = " + money(line.price * line.quantity));
      return [
        "Заказ по меню",
        "Гость: " + (order.guestName || "Гость"),
        order.phone ? "Телефон: " + order.phone : "",
        "Время: " + [order.readyDate, order.readyTime].filter(Boolean).join(" "),
        "Подача: " + servingModeLabel(order.servingMode),
        ...itemLines,
        "Итого: " + money(order.total),
        "Оплата: не оплачено",
        order.comment ? "Комментарий: " + order.comment : ""
      ].filter(Boolean).join("\\n");
    }
    function showOrderConfirmation(order) {
      return new Promise((resolve) => {
        const backdrop = document.getElementById("confirmBackdrop");
        const text = document.getElementById("confirmText");
        const cancel = document.getElementById("confirmCancel");
        const submit = document.getElementById("confirmSubmit");
        text.textContent = buildOrderSummaryText(order) + "\\n\\nВсе верно?";
        backdrop.hidden = false;
        function close(result) {
          backdrop.hidden = true;
          cancel.onclick = null;
          submit.onclick = null;
          resolve(result);
        }
        cancel.onclick = () => close(false);
        submit.onclick = () => close(true);
      });
    }
    function showOrderSummary(order) {
      const summary = document.getElementById("orderSummary");
      const text = document.getElementById("orderSummaryText");
      text.textContent = buildOrderSummaryText(order);
      summary.classList.add("is-visible");
    }
    async function copyOrderSummary() {
      const text = document.getElementById("orderSummaryText").textContent || "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Заказ скопирован.", "success");
      } catch {
        setStatus("Не удалось скопировать автоматически. Выделите текст заказа вручную.", "error");
      }
    }
    async function saveOrderSummary() {
      const text = document.getElementById("orderSummaryText").textContent || "";
      if (!text) return;
      if (navigator.share) {
        try {
          await navigator.share({ title: "Заказ Green Pine Burabay", text });
          setStatus("Заказ сохранен.", "success");
          return;
        } catch {
          return;
        }
      }
      downloadOrderSummary();
    }
    function downloadOrderSummary() {
      const text = document.getElementById("orderSummaryText").textContent || "";
      if (!text) return;
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "green-pine-menu-order.txt";
      link.click();
      URL.revokeObjectURL(link.href);
    }
    function setServingMode(mode) {
      state.servingMode = mode;
      ["ready", "takeaway", "arrival"].forEach((id) => {
        document.getElementById(id).classList.toggle("active", id === mode);
      });
      const scheduleFields = document.getElementById("scheduleFields");
      scheduleFields.hidden = mode !== "arrival";
      if (mode === "arrival") {
        const readyDate = document.getElementById("readyDate");
        const readyTime = document.getElementById("readyTime");
        if (!readyDate.value) readyDate.value = today();
        if (!readyTime.value) readyTime.value = nextReadyTime();
      }
    }
    window.changeQty = function(id, delta) {
      const item = state.items.find((entry) => entry.id === id);
      if (!item) return;
      const current = state.cart[id]?.quantity || 0;
      const next = Math.max(0, current + delta);
      if (!next) delete state.cart[id];
      else state.cart[id] = { menuItemId: item.id, title: item.title, price: item.price, quantity: next };
      renderMenu();
      renderCart();
    };
    async function submitOrder() {
      const lines = Object.values(state.cart);
      if (!lines.length) {
        setStatus("Выберите хотя бы одну позицию.", "error");
        return;
      }
      const readyDate = document.getElementById("readyDate").value || "";
      const readyTime = document.getElementById("readyTime").value || "";
      const comment = document.getElementById("comment").value || "";
      const commentTime = extractTimeFromComment(comment);
      const finalServingMode = state.servingMode === "arrival" || commentTime ? "arrival" : state.servingMode;
      const finalReadyDate = finalServingMode === "arrival" ? (readyDate || today()) : today();
      const finalReadyTime = state.servingMode === "arrival" ? readyTime : commentTime;
      if (state.servingMode === "arrival" && (!readyDate || !readyTime)) {
        setStatus("Укажите дату и время готовности.", "error");
        return;
      }
      if (!isKitchenReadyTimeAllowed(finalReadyTime)) {
        setStatus("Кухня выдает заказы до 18:00. Выберите время не позже 18:00.", "error");
        if (finalServingMode === "arrival") {
          setServingMode("arrival");
          document.getElementById("readyTime").focus();
        }
        return;
      }
      const r = state.reservation || {};
      const customerPhoneInput = document.getElementById("customerPhone");
      const phone = getKnownPhone() || normalizePhone(customerPhoneInput.value);
      if (!phone) {
        document.getElementById("phoneField").hidden = false;
        customerPhoneInput.focus();
        setStatus("Укажите номер телефона, чтобы администратор мог уточнить заказ.", "error");
        return;
      }
      const guestName = getGuestName(phone);
      const roomNumbers = r.roomNumbers || [];
      const total = getOrderTotal();
      const order = {
        source: reservationId ? "reservation-link" : "qr",
        reservationId,
        guestName,
        phone,
        roomNumbers,
        checkIn: r.checkIn || "",
        readyDate: finalReadyDate,
        readyTime: finalReadyTime,
        servingMode: finalServingMode,
        comment,
        items: lines.map((line) => ({ ...line, id: "item-" + line.menuItemId, total: line.price * line.quantity })),
        status: "new",
        paymentStatus: "unpaid"
      };
      if (!(await showOrderConfirmation(order))) return;
      setStatus("Отправляем заказ...", "");
      document.getElementById("submit").disabled = true;
      try {
        const response = await fetch("/api/public/menu-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order)
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error || "request failed");
        }
        const savedOrder = await response.json();
        const acceptedOrder = { ...order, ...savedOrder };
        showOrderSummary(acceptedOrder);
        setStatus("Заказ принят.", "success");
      } catch (error) {
        const message = error && error.message === "Phone is required"
          ? "Укажите номер телефона, чтобы администратор мог уточнить заказ."
          : "Не удалось отправить заказ. Попробуйте еще раз.";
        setStatus(message, "error");
        if (error && error.message === "Phone is required") {
          document.getElementById("phoneField").hidden = false;
          document.getElementById("customerPhone").focus();
        }
        document.getElementById("submit").disabled = false;
      }
    }
    async function boot() {
      try {
        const menuApiUrl = reservationId ? "/api/public/menu/" + encodeURIComponent(reservationId) : "/api/public/menu";
        let response = await fetch(menuApiUrl);
        if (!response.ok && reservationId) {
          response = await fetch("/api/public/menu");
        }
        if (!response.ok) throw new Error("menu failed");
        const data = await response.json();
        state.items = data.menuItems || [];
        state.reservation = data.reservation || null;
        document.getElementById("intro").textContent = data.introText || document.getElementById("intro").textContent;
        renderGuest();
        renderMenu();
        renderCart();
      } catch {
        document.getElementById("menu").innerHTML = '<div class="empty">Не удалось загрузить меню.</div>';
      }
    }
    document.getElementById("ready").onclick = () => setServingMode("ready");
    document.getElementById("takeaway").onclick = () => setServingMode("takeaway");
    document.getElementById("arrival").onclick = () => setServingMode("arrival");
    document.getElementById("submit").onclick = submitOrder;
    document.getElementById("copyOrder").onclick = () => void copyOrderSummary();
    document.getElementById("saveOrder").onclick = () => void saveOrderSummary();
    document.getElementById("downloadOrder").onclick = downloadOrderSummary;
    boot();
  </script>
</body>
</html>`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

app.get("/api/health", async (_request, reply) => {
  try {
    await withTimeout(pingDatabase(), 1500, "Mongo ping timeout");
  } catch (error) {
    return reply.status(503).send({
      ok: false,
      service: "gpb-whatsapp-booking-backend",
      mongo: "error",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return {
    ok: true,
    mongo: "ok",
    service: "gpb-whatsapp-booking-backend"
  };
});

app.get("/api/health/full", async (_request, reply) => {
  const startedAt = Date.now();
  const report: Record<string, unknown> = {
    backend: "ok",
    service: "gpb-whatsapp-booking-backend"
  };

  try {
    await withTimeout(pingDatabase(), 1500, "Mongo ping timeout");
    report.mongo = "ok";
  } catch (error) {
    report.mongo = "error";
    report.mongoError = error instanceof Error ? error.message : String(error);
    report.responseMs = Date.now() - startedAt;
    return reply.status(503).send(report);
  }

  try {
    await withTimeout(listGuestContacts(), 5000, "guestContacts timeout");
    report.guestContacts = "ok";
  } catch (error) {
    report.guestContacts = "error";
    report.guestContactsError = error instanceof Error ? error.message : String(error);
    report.responseMs = Date.now() - startedAt;
    return reply.status(503).send(report);
  }

  report.responseMs = Date.now() - startedAt;
  return report;
});

app.get("/menu/r/:reservationId", async (request, reply) => {
  const { reservationId } = request.params as { reservationId: string };
  reply.type("text/html; charset=utf-8");
  return buildPublicMenuPage(reservationId);
});

app.get("/menu", async (_request, reply) => {
  reply.type("text/html; charset=utf-8");
  return buildPublicMenuPage("");
});

app.get("/api/public/menu", async () => {
  const settings = await getPaymentSettingsData();
  const menuItems = getPublicMenuItems(settings);

  return {
    introText: getPublicMenuIntroText(settings),
    menuItems,
    reservation: null
  };
});

app.get("/api/public/menu/:reservationId", async (request, reply) => {
  const { reservationId } = request.params as { reservationId: string };
  const reservations = await listReservations();
  const reservation = reservations.find((item) => item.id === reservationId);

  const settings = await getPaymentSettingsData();
  const menuItems = getPublicMenuItems(settings);

  if (!reservation) {
    return {
      introText: getPublicMenuIntroText(settings),
      menuItems,
      reservation: null
    };
  }

  const rooms = await listRooms();
  const roomIds = Array.isArray(reservation.roomIds) ? reservation.roomIds.map((roomId) => String(roomId)) : [];
  const reservationRooms = rooms.filter((room) => roomIds.includes(room.id));

  return {
    introText: getPublicMenuIntroText(settings),
    menuItems,
    reservation: {
      id: reservation.id,
      guestName: toSafeString(reservation.guestFirstName) || toSafeString(reservation.guestName) || "Гость",
      phone: normalizeMenuOrderPhone(reservation.phone),
      checkIn: toSafeString(reservation.checkIn),
      roomNumbers: reservationRooms.map((room) => toSafeString(room.number) || toSafeString(room.title)).filter(Boolean)
    }
  };
});

app.post("/api/public/menu-orders", async (request, reply) => {
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return reply.status(400).send({ error: "Invalid menu order" });

  const enrichedBody = await enrichMenuOrderPayloadFromReservation(body);
  const order = normalizeMenuOrderPayload(enrichedBody);
  if (!order.items.length) return reply.status(400).send({ error: "Order items are required" });
  if (!order.phone) return reply.status(400).send({ error: "Phone is required" });

  const savedOrder = await saveMenuOrderData(order.id, order);
  broadcastRealtime("menu-orders.changed", { action: "upsert", order: savedOrder });
  return savedOrder;
});

app.get("/api/menu-orders", async () => {
  return listMenuOrders();
});

app.put("/api/menu-orders/:id", async (request) => {
  const { id } = request.params as { id: string };
  const body = request.body as Record<string, unknown> | undefined;
  const order = normalizeMenuOrderPayload({ ...(body ?? {}), id });
  const savedOrder = await saveMenuOrderData(id, order);
  broadcastRealtime("menu-orders.changed", { action: "upsert", order: savedOrder });
  return savedOrder;
});

app.delete("/api/menu-orders/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  await deleteMenuOrderData(id);
  broadcastRealtime("menu-orders.changed", { action: "delete", id: decodeURIComponent(id) });
  return reply.status(204).send();
});

app.get("/api/debug/logs", async () => {
  return frontendDebugLogs;
});

app.get("/api/events", async (request, reply) => {
  const query = request.query as { clientId?: string };
  const clientId = query.clientId || "";
  reply.hijack();
  reply.raw.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no"
  });
  reply.raw.write("retry: 2000\n\n");

  const client = {
    clientId,
    send: (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };
  realtimeClients.add(client);
  client.send("sync.ready", { serverTime: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    reply.raw.write(`event: sync.ping\n`);
    reply.raw.write(`data: ${JSON.stringify({ serverTime: new Date().toISOString() })}\n\n`);
  }, 25_000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    realtimeClients.delete(client);
  });
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

app.get("/api/active-dialogs", async () => {
  return listActiveDialogs();
});

app.put("/api/active-dialogs/:chatKey", async (request, reply) => {
  const { chatKey } = request.params as { chatKey: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return reply.status(400).send({ error: "Invalid active dialog" });
  }
  const decodedChatKey = decodeURIComponent(chatKey);
  const dialog = await claimActiveDialogData(decodedChatKey, body);
  broadcastRealtime("active-dialogs.changed", { action: "upsert", dialog }, String(body.clientId ?? ""));
  return dialog;
});

app.delete("/api/active-dialogs/:chatKey", async (request, reply) => {
  const { chatKey } = request.params as { chatKey: string };
  const query = request.query as { clientId?: string };
  await releaseActiveDialogData(decodeURIComponent(chatKey), query.clientId ?? "");
  broadcastRealtime("active-dialogs.changed", { action: "delete", chatKey: decodeURIComponent(chatKey), clientId: query.clientId ?? "" }, query.clientId ?? "");
  return reply.status(204).send();
});

app.get("/api/contact-locks", async () => {
  return listContactLocks();
});

app.put("/api/contact-locks/:phone", async (request, reply) => {
  const { phone } = request.params as { phone: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return reply.status(400).send({ error: "Invalid contact lock" });
  }
  const normalizedPhone = normalizeReservationPhone(decodeURIComponent(phone));
  if (!normalizedPhone) return reply.status(400).send({ error: "Contact lock phone is required" });
  const lock = await claimContactLockData(normalizedPhone, body);
  broadcastRealtime("contact-locks.changed", { action: "upsert", lock }, String(body.clientId ?? ""));
  return lock;
});

app.delete("/api/contact-locks/:phone", async (request, reply) => {
  const { phone } = request.params as { phone: string };
  const query = request.query as { clientId?: string };
  const normalizedPhone = normalizeReservationPhone(decodeURIComponent(phone));
  if (!normalizedPhone) return reply.status(204).send();
  await releaseContactLockData(normalizedPhone, query.clientId ?? "");
  broadcastRealtime("contact-locks.changed", { action: "delete", phone: normalizedPhone, clientId: query.clientId ?? "" }, query.clientId ?? "");
  return reply.status(204).send();
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

type AiReplySuggestionPayload = {
  answers: string[];
  answerTranslations: string[];
  reason: string;
  recommended: number;
};

const AI_REPLY_SYSTEM_PROMPT = `Ты — помощник оператора по продажам гостиницы Green Pine Burabay.

Тебе передаются:

1. Полная история переписки с гостем.
2. Последнее сообщение гостя.
3. Актуальные данные гостиницы, номеров, цен и услуг.
4. Краткий справочник по Боровому: озёра, пляжи, центр, достопримечательности, расстояния и маршруты.

Задача:
Проанализируй переписку и предложи 5 вариантов следующего ответа оператору.

Приоритеты:

1. Язык:
— Если поле replyLanguage равно "kk", все 5 answers ОБЯЗАТЕЛЬНО должны быть на казахском языке.
— Если поле replyLanguage равно "ru", все 5 answers должны быть на русском языке.
— Поле reason всегда пиши на русском языке.
— Если answers не на русском языке, добавь русский перевод каждого варианта в answerTranslations.
— Если последнее сообщение гостя начинается с приветствия, лучший ответ тоже должен начинаться с короткого приветствия на языке гостя.

2. Факты:
— Не придумывай цены, наличие, услуги и расстояния.
— Используй hotelData.rooms и hotelData.availability.
— Учитывай hotelData.objectInfo.rules. Если правило там есть, отвечай уверенно.
— Учитывай hotelData.objectInfo.description и hotelData.objectInfo.examples как рабочую инструкцию владельца.
— Если в hotelData.availability есть requestedPeriod и availableRoomsCount больше 0, обязательно используй это: скажи, что на эти даты есть свободные номера.
— Если в hotelData.availability есть requestedMonth, но requestedPeriod пустой, гость указал только месяц. Не утверждай наличие на конкретные даты; попроси точные даты и мягко предложи проверить номера на этот месяц.
— Если гость указал количество людей, а availableTotalPlaces хватает, мягко веди к подбору/бронированию для этой группы.
— Доступность номеров — поддерживающий факт, но не замена ответа на последнее сообщение гостя.

3. Домики и номера:
— Green Pine Burabay — гостиница с номерами, а не база с отдельными домиками.
— Если гость спрашивает домик, коттедж, үй или отдельный house, честно объясни, что домиков нет.
— Если при этом по датам есть свободные номера, лучший ответ должен совмещать оба смысла: домиков нет, но на эти даты есть номера.
— Не ограничивайся сухим отказом, если можно предложить доступные номера.

4. Продажа:
— Учитывай всю переписку, особенно последнее сообщение.
— Не задавай повторно вопросы, на которые гость уже ответил.
— Учитывай, что гость может менять даты, состав и требования.
— Не обвиняй гостя и не спорь с ним.
— Отвечай только на текущий вопрос или возражение.
— Если последнее сообщение гостя — возражение, сомнение, раздражение или короткая реакция, сначала ответь на это по смыслу.
— При недостатке данных задай один короткий уточняющий вопрос.
— Мягко веди гостя к бронированию.
— Если объект явно не подходит, честно сообщи это.
— Не дави и не запугивай гостя.

Стиль:
— Каждый вариант — не более 8 слов.
— Ответ должен быть простым и понятным для WhatsApp.
— Не используй длинные описания и сложные формулировки.
— Варианты должны отличаться по смыслу, а не только словами.
— Выбери лучший вариант и отметь его как рекомендуемый.

Формат ответа строго JSON:
{
  "recommended": 2,
  "reason": "Кратко объясни оператору причину выбора",
  "answers": [
    "Вариант ответа 1",
    "Вариант ответа 2",
    "Вариант ответа 3",
    "Вариант ответа 4",
    "Вариант ответа 5"
  ],
  "answerTranslations": [
    "Перевод варианта 1 на русский",
    "Перевод варианта 2 на русский",
    "Перевод варианта 3 на русский",
    "Перевод варианта 4 на русский",
    "Перевод варианта 5 на русский"
  ]
}

Поле reason и answerTranslations видит только оператор. Гостю они не отправляются.`;

const AI_REPLY_OUTPUT_CONTRACT = `Техническое требование:
Ответ верни строго JSON-объектом с полями recommended, reason, answers, answerTranslations.
answers всегда ровно 5 коротких вариантов.
reason всегда на русском языке.
Если answers не на русском, answerTranslations содержит русский перевод каждого варианта.
Гостю отправляется только выбранный текст из answers.`;

function toSafeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toSafeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function compactRoomForAi(room: Record<string, unknown>) {
  const sleepingPlaces = Array.isArray(room.sleepingPlaces)
    ? room.sleepingPlaces
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
        .map((item) => `${toSafeString(item.title)} x${toSafeNumber(item.count) || 1}, мест ${toSafeNumber(item.normalCapacity) || toSafeNumber(item.placesCount)}`)
        .filter(Boolean)
    : [];
  return {
    number: toSafeString(room.number),
    title: toSafeString(room.title),
    category: toSafeString(room.group),
    floor: toSafeString(room.floor),
    places: toSafeNumber(room.capacityAdults) + toSafeNumber(room.capacityChildren),
    weekdayPrice: toSafeNumber(room.weekdayPrice) || toSafeNumber(room.basePrice),
    weekendPrice: toSafeNumber(room.weekendPrice) || toSafeNumber(room.basePrice),
    holidayPrice: toSafeNumber(room.holidayPrice) || toSafeNumber(room.weekendPrice) || toSafeNumber(room.basePrice),
    food: toSafeString(room.amenities).split(",").map((item) => item.trim()).filter((item) => /завтрак|питан/i.test(item)).join(", "),
    amenities: toSafeString(room.amenities).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12).join(", "),
    description: toSafeString(room.description).slice(0, 500),
    sleepingPlaces
  };
}

function toDateInput(value: unknown) {
  const text = toSafeString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function addDaysInput(dateInput: string, days: number) {
  const [year, month, day] = dateInput.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function dateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return Boolean(leftStart && leftEnd && rightStart && rightEnd && leftStart < rightEnd && rightStart < leftEnd);
}

function isIgnorableAiMessageText(value: unknown) {
  const text = toSafeString(value).toLowerCase();
  return !text ||
    /^(вы удалили это сообщение|сообщение удалено|deleted message|this message was deleted)$/i.test(text) ||
    /исчезающие сообщения|disappearing messages|сообщения и звонки защищены|messages and calls are end-to-end encrypted/i.test(text);
}

function cleanAiMessageText(value: unknown) {
  let text = toSafeString(value);
  if (!text) return "";
  text = text
    .replace(/^\s*вы\s+(?:фото|видео|изображение|документ|номер|меню|объект|прайс|счет)\s*:\s*/i, "")
    .replace(/^\s*(?:фото|видео|изображение|документ|номер|меню|объект|прайс|счет)\s*:\s*/i, "")
    .trim();
  text = text
    .replace(/^(?:номер|комната)\s+\d{2,4}\s+[^?!?.\n]*?\+\s*/i, "")
    .replace(/^(?:номер|комната)\s+\d{2,4}\s+[^?!?.\n]{0,40}(?=\s+(?:ну|да|нет|можем|можно|а|и|или|тогда)\b)/i, "")
    .trim();
  return text;
}

const AI_MONTHS: Record<string, number> = {
  "январ": 1,
  "қаңтар": 1,
  "феврал": 2,
  "ақпан": 2,
  "март": 3,
  "наурыз": 3,
  "апрел": 4,
  "сәуір": 4,
  "май": 5,
  "мамыр": 5,
  "июн": 6,
  "маусым": 6,
  "июл": 7,
  "шілде": 7,
  "август": 8,
  "августа": 8,
  "тамыз": 8,
  "сентябр": 9,
  "қыркүй": 9,
  "октябр": 10,
  "қазан": 10,
  "ноябр": 11,
  "қараша": 11,
  "декабр": 12,
  "желтоқсан": 12
};

function findLastAiMonthMention(text: string) {
  let result: { month: number; monthName: string; index: number } | null = null;
  for (const [name, month] of Object.entries(AI_MONTHS)) {
    const index = text.lastIndexOf(name);
    if (index >= 0 && (!result || index > result.index)) {
      result = { month, monthName: name, index };
    }
  }
  return result;
}

function findLastAiDateIntent(text: string) {
  const monthPattern = Object.keys(AI_MONTHS).join("|");
  const patterns = [
    new RegExp(`(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s*(?:не|на)?\\s*(${monthPattern})`, "gi"),
    new RegExp(`(${monthPattern})\\s*(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})`, "gi")
  ];
  let matchData: { index: number; startDay: number; endDay: number; month: number } | null = null;
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const firstValue = match[1] || "";
      const monthFirst = !/\d/.test(firstValue);
      const monthText = Object.keys(AI_MONTHS).find((name) => (monthFirst ? firstValue : match[3] || "").toLowerCase().includes(name));
      const month = monthText ? AI_MONTHS[monthText] : 0;
      const startDay = Number.parseInt(monthFirst ? match[2] : match[1], 10);
      const endDay = Number.parseInt(monthFirst ? match[3] : match[2], 10);
      if (!month || !Number.isFinite(startDay) || !Number.isFinite(endDay)) continue;
      if (!matchData || (match.index ?? 0) >= matchData.index) {
        matchData = { index: match.index ?? 0, startDay, endDay, month };
      }
    }
  }
  if (!matchData) return null;
  const year = new Date().getFullYear();
  const checkIn = `${year}-${String(matchData.month).padStart(2, "0")}-${String(matchData.startDay).padStart(2, "0")}`;
  let checkOut = `${year}-${String(matchData.month).padStart(2, "0")}-${String(matchData.endDay).padStart(2, "0")}`;
  if (checkOut <= checkIn) checkOut = addDaysInput(checkIn, Math.max(1, matchData.endDay - matchData.startDay || 1));
  return { checkIn, checkOut };
}

function extractAiBookingIntent(messages: Array<Record<string, unknown>>, body: Record<string, unknown> | undefined) {
  const panelCheckIn = toDateInput(body?.checkIn);
  const panelCheckOut = toDateInput(body?.checkOut);
  const panelGuests = toSafeNumber(body?.guestsTotal);
  const bodyLastGuestMessage = isIgnorableAiMessageText(body?.lastGuestMessage) ? "" : cleanAiMessageText(body?.lastGuestMessage);
  const textParts = messages
    .slice(-12)
    .map((message) => cleanAiMessageText(message.text))
    .filter(Boolean);
  if (bodyLastGuestMessage && !textParts.includes(bodyLastGuestMessage)) {
    textParts.push(bodyLastGuestMessage);
  }
  const text = textParts.join("\n").toLowerCase();
  const explicitDateIntent = findLastAiDateIntent(text);
  const monthMention = findLastAiMonthMention(text);
  const usePanelDates = !explicitDateIntent && !monthMention;
  const checkIn = explicitDateIntent?.checkIn || (usePanelDates ? panelCheckIn : "");
  const checkOut = explicitDateIntent?.checkOut || (usePanelDates ? panelCheckOut : "");
  const guestMatches = [...text.matchAll(/(\d{1,2})\s*(?:адам(?:ға|га)?|адам|чел(?:овек)?|гост(?:я|ей|ь)?)/gi)];
  const guestMatch = guestMatches.length ? guestMatches[guestMatches.length - 1] : null;
  return {
    checkIn,
    checkOut,
    guestsTotal: guestMatch ? Number.parseInt(guestMatch[1], 10) : panelGuests,
    requestedMonth: !explicitDateIntent && monthMention ? monthMention.month : 0
  };
}

function detectGuestReplyLanguage(messages: Array<Record<string, unknown>>) {
  const lastGuestText = toSafeString([...messages].reverse().find((message) => !message.fromMe && toSafeString(message.text))?.text);
  const classifyText = (value: string) => {
    const text = value.toLowerCase();
    const hasLetters = /[a-zа-яёәғқңөұүһі]/i.test(text);
    const hasKazakhLetters = /[әғқңөұүһі]/i.test(text);
    const hasKazakhWords = /\b(салеметсіз|сәлеметсіз|салеметсиз|адамға|адамга|барма|бар ма|күнге|кунге|үй|уй|жоқ|иә|неше|қанша|канша)\b/i.test(text);
    return { hasLetters, isKazakh: hasKazakhLetters || hasKazakhWords };
  };
  const lastLanguage = classifyText(lastGuestText);
  if (lastLanguage.hasLetters) return lastLanguage.isKazakh ? "kk" : "ru";
  const recentGuestText = messages
    .slice(-8)
    .filter((message) => !message.fromMe)
    .map((message) => toSafeString(message.text))
    .join(" ")
    .toLowerCase();
  return classifyText(recentGuestText).isKazakh ? "kk" : "ru";
}

function getReservationItemsForAi(reservation: Record<string, unknown>) {
  const items = Array.isArray(reservation.items)
    ? reservation.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  if (items.length) return items;
  const roomIds = Array.isArray(reservation.roomIds) ? reservation.roomIds.map((roomId) => toSafeString(roomId)).filter(Boolean) : [];
  return roomIds.map((roomId) => ({
    roomId,
    checkIn: toSafeString(reservation.checkIn),
    checkOut: toSafeString(reservation.checkOut)
  }));
}

function buildAvailabilityForAi(
  rooms: Array<Record<string, unknown>>,
  reservations: Array<Record<string, unknown>>,
  intent: { checkIn: string; checkOut: string; guestsTotal: number; requestedMonth?: number }
) {
  if (!intent.checkIn || !intent.checkOut) {
    const activeRooms = rooms
      .filter((room) => toSafeString(room.category) === "guest-room" && Boolean(room.bookable) && toSafeString(room.status) === "active" && !room.hideInBookingPanel)
      .map((room) => compactRoomForAi(room))
      .slice(0, 30);
    return {
      requestedPeriod: null,
      requestedMonth: intent.requestedMonth || null,
      note: intent.requestedMonth
        ? "Гость указал месяц без точных дат. Не используй дату из панели; уточни точные даты и предложи проверить номера на этот месяц."
        : "Даты из переписки не определены. Нужно уточнить даты.",
      availableRooms: activeRooms,
      availableRoomsCount: activeRooms.length,
      availableTotalPlaces: activeRooms.reduce((sum, room) => sum + toSafeNumber(room.places), 0)
    };
  }
  const bookedRoomIds = new Set<string>();
  const overlappingReservations: Array<Record<string, unknown>> = [];
  for (const reservation of reservations) {
    if (toSafeString(reservation.status) === "cancelled") continue;
    const overlappingItems = getReservationItemsForAi(reservation).filter((item) =>
      dateRangesOverlap(toSafeString(item.checkIn), toSafeString(item.checkOut), intent.checkIn, intent.checkOut)
    );
    if (!overlappingItems.length) continue;
    overlappingReservations.push({
      guest: toSafeString(reservation.guestFirstName) || "Гость",
      rooms: overlappingItems.map((item) => toSafeString(item.roomId)).filter(Boolean),
      checkIn: toSafeString(reservation.checkIn),
      checkOut: toSafeString(reservation.checkOut),
      status: toSafeString(reservation.status)
    });
    overlappingItems.forEach((item) => {
      const roomId = toSafeString(item.roomId);
      if (roomId) bookedRoomIds.add(roomId);
    });
  }
  const availableRooms = rooms
    .filter((room) => toSafeString(room.category) === "guest-room" && Boolean(room.bookable) && toSafeString(room.status) === "active" && !room.hideInBookingPanel)
    .filter((room) => !bookedRoomIds.has(toSafeString(room.id)))
    .map((room) => compactRoomForAi(room))
    .slice(0, 30);
  return {
    requestedPeriod: {
      checkIn: intent.checkIn,
      checkOut: intent.checkOut,
      guestsTotal: intent.guestsTotal
    },
    availableRooms,
    availableRoomsCount: availableRooms.length,
    availableTotalPlaces: availableRooms.reduce((sum, room) => sum + toSafeNumber(room.places), 0),
    overlappingReservations
  };
}

function buildBorovoeReferenceForAi() {
  return [
    "Green Pine Burabay находится в Бурабае/Боровом, подходит гостям на машине и для спокойного отдыха.",
    "Не обещай точное расстояние или минуты, если в данных переписки или объекта нет точной цифры.",
    "Если гость просит центр, пляж, озеро или пешую доступность, отвечай честно и мягко уточняй приоритет.",
    "Можно упоминать, что в Боровом важны даты, состав гостей, питание, парковка и близость к нужной локации.",
    "Если гость хочет совсем рядом с озером/центром, не спорь: предложи проверить вариант или честно сказать, что может не подойти."
  ].join("\n");
}

function normalizeAiSuggestionPayload(value: unknown): AiReplySuggestionPayload {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const answers = Array.isArray(payload.answers)
    ? payload.answers.map((answer) => toSafeString(answer)).filter(Boolean).slice(0, 5)
    : [];
  const answerTranslations = Array.isArray(payload.answerTranslations)
    ? payload.answerTranslations.map((answer) => toSafeString(answer)).slice(0, 5)
    : [];
  while (answers.length < 5) {
    answers.push("Уточните, пожалуйста, даты и состав гостей");
  }
  while (answerTranslations.length < 5) {
    answerTranslations.push("");
  }
  const rawRecommended = typeof payload.recommended === "number" ? payload.recommended : Number.parseInt(String(payload.recommended ?? "1"), 10);
  const recommended = Math.max(1, Math.min(5, Number.isFinite(rawRecommended) ? rawRecommended : 1));
  return {
    answers,
    answerTranslations,
    reason: toSafeString(payload.reason) || "Выбран самый уместный короткий ответ.",
    recommended
  };
}

function parseAiJsonResponse(text: string): AiReplySuggestionPayload {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const jsonText = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  return normalizeAiSuggestionPayload(JSON.parse(jsonText));
}

function isLikelyRussianAnswer(text: string) {
  const normalized = text.toLowerCase();
  return /\b(у нас|есть|нет|только|номера|номер|домиков|свободные|можем|предложить|выберите|помогу|бронированием|какой|интересует|к сожалению|вместо)\b/i.test(normalized);
}

function needsKazakhAnswerRepair(payload: AiReplySuggestionPayload) {
  return payload.answers.some((answer) => isLikelyRussianAnswer(answer));
}

async function repairKazakhAiSuggestions(
  client: ReturnType<typeof createOpenAiClient>,
  payload: AiReplySuggestionPayload
): Promise<AiReplySuggestionPayload> {
  if (!client) return payload;
  const repairPrompt = JSON.stringify({
    task: "Translate answers to Kazakh language only. Do not leave Russian in answers. Keep answerTranslations in Russian.",
    rules: [
      "answers: Kazakh language only",
      "answerTranslations: Russian translation only",
      "reason: Russian only",
      "Keep each answer under 8 words",
      "Do not change meaning",
      "Return strict JSON with recommended, reason, answers, answerTranslations"
    ],
    input: payload
  }, null, 2);
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a strict Kazakh translator for WhatsApp sales replies. Russian text is forbidden in answers."
      },
      { role: "user", content: repairPrompt }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  });
  const content = completion.choices[0]?.message?.content ?? "";
  return content.trim() ? parseAiJsonResponse(content) : payload;
}

app.post("/api/ai/reply-suggestions", async (request, reply) => {
  const client = createOpenAiClient();
  if (!client) {
    return reply.status(503).send({ error: "OPENAI_API_KEY is not configured" });
  }

  const body = request.body as Record<string, unknown> | undefined;
  const chatKey = toSafeString(body?.chatKey);
  if (!chatKey) {
    return reply.status(400).send({ error: "chatKey is required" });
  }

  const [messages, rooms, settings, reservations] = await Promise.all([
    listChatMessages(chatKey, 80),
    listRooms(),
    getPaymentSettingsData(),
    listReservations()
  ]);
  const visibleMessages = Array.isArray(body?.visibleMessages)
    ? body.visibleMessages
        .filter((message): message is Record<string, unknown> => Boolean(message && typeof message === "object" && !Array.isArray(message)))
        .map((message) => ({
          fromMe: Boolean(message.fromMe),
          text: cleanAiMessageText(message.text),
          timestamp: toSafeString(message.timestamp),
          type: toSafeString(message.type) || "visible"
        }))
        .filter((message) => !isIgnorableAiMessageText(message.text))
    : [];
  const savedMessagesForAi = messages.filter((message) => !isIgnorableAiMessageText(message.text));
  const baseMessagesForAi = visibleMessages.length ? visibleMessages : savedMessagesForAi;
  const bodyLastGuestMessageForAi = isIgnorableAiMessageText(body?.lastGuestMessage) ? "" : cleanAiMessageText(body?.lastGuestMessage);
  const messagesForAi = bodyLastGuestMessageForAi && !baseMessagesForAi.some((message) => toSafeString(message.text) === bodyLastGuestMessageForAi)
    ? [...baseMessagesForAi, { fromMe: false, text: bodyLastGuestMessageForAi, timestamp: "", type: "lastGuestMessage" }]
    : baseMessagesForAi;
  const intent = extractAiBookingIntent(messagesForAi, body);
  const replyLanguage = detectGuestReplyLanguage(messagesForAi);
  const roomsForAi = rooms as unknown as Array<Record<string, unknown>>;
  const availability = buildAvailabilityForAi(roomsForAi, reservations as Array<Record<string, unknown>>, intent);

  const compactMessages = messagesForAi
    .slice(-40)
    .map((message) => {
      const author = message.fromMe ? "Оператор" : "Гость";
      const text = cleanAiMessageText(message.text);
      return text ? `${message.timestamp ? `[${message.timestamp}] ` : ""}${author}: ${text}`.trim() : "";
    })
    .filter(Boolean);
  const bodyLastGuestMessage = isIgnorableAiMessageText(body?.lastGuestMessage) ? "" : cleanAiMessageText(body?.lastGuestMessage);
  const lastGuestMessage = bodyLastGuestMessage ||
    cleanAiMessageText([...messagesForAi].reverse().find((message) => !message.fromMe && cleanAiMessageText(message.text))?.text) ||
    "";
  const compactRooms = rooms
    .filter((room) => room.bookable && room.status === "active" && !room.hideInBookingPanel)
    .map((room) => compactRoomForAi(room as unknown as Record<string, unknown>))
    .slice(0, 40);
  const settingsRecord = settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
  const customChatBotPrompt = toSafeString(settingsRecord.chatBotPrompt);
  const chatBotSystemPrompt = `${customChatBotPrompt || AI_REPLY_SYSTEM_PROMPT}\n\n${AI_REPLY_OUTPUT_CONTRACT}`;
  const chatBotObjectDescription = toSafeString(settingsRecord.chatBotObjectDescription);
  const chatBotExamples = toSafeString(settingsRecord.chatBotExamples);
  const objectInfo = {
    description: chatBotObjectDescription,
    examples: chatBotExamples,
    paymentLink: toSafeString(settingsRecord.paymentLink),
    packageGiftText: toSafeString(settingsRecord.packageGiftText),
    rules: {
      pets: "С животными нельзя."
    },
    customFoodOptions: Array.isArray(settingsRecord.customFoodOptions) ? settingsRecord.customFoodOptions.slice(0, 20) : [],
    includedCardPages: Array.isArray(settingsRecord.includedCardPages)
      ? settingsRecord.includedCardPages
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
          .map((item) => toSafeString(item.description))
          .filter(Boolean)
          .slice(0, 10)
      : []
  };

  const userPrompt = JSON.stringify({
    chat: {
      chatKey,
      chatTitle: toSafeString(body?.chatTitle),
      phone: toSafeString(body?.phone),
      guestName: toSafeString(body?.guestName)
    },
    lastGuestMessage,
    replyLanguage,
    languageInstruction: replyLanguage === "kk"
      ? "Гость пишет на казахском или казахско-русской смеси. Все answers должны быть на казахском. answerTranslations должны быть русским переводом. Если есть доступные номера, ответ на казахском должен продавать номера, а не просто отказывать по домикам."
      : "Гость пишет на русском. Answers должны быть на русском.",
    messages: compactMessages,
    hotelData: {
      objectInfo,
      rooms: compactRooms,
      availability
    },
    borovoeReference: buildBorovoeReferenceForAi()
  }, null, 2);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: chatBotSystemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.6,
    response_format: { type: "json_object" }
  });

  const content = completion.choices[0]?.message?.content ?? "";
  if (!content.trim()) {
    return reply.status(502).send({ error: "OpenAI returned empty response" });
  }

  try {
    const parsed = parseAiJsonResponse(content);
    const repaired = replyLanguage === "kk" && needsKazakhAnswerRepair(parsed)
      ? await repairKazakhAiSuggestions(client, parsed)
      : null;
    const result = repaired ?? parsed;
    if (replyLanguage === "ru") {
      result.answerTranslations = [];
    }
    saveAiReplyLogData({
      chatKey,
      chatTitle: toSafeString(body?.chatTitle),
      phone: toSafeString(body?.phone),
      guestName: toSafeString(body?.guestName),
      lastGuestMessage,
      replyLanguage,
      repaired: Boolean(repaired),
      intent,
      availability,
      messages: compactMessages,
      result,
      rawModelResponse: content
    }).catch((error) => request.log.error({ error }, "AI reply log save failed"));
    return result;
  } catch (error) {
    request.log.error({ error, content }, "AI suggestions parse failed");
    return reply.status(502).send({ error: "Invalid AI response" });
  }
});

app.get("/api/ai/reply-suggestions/logs", async (request) => {
  const query = request.query as Record<string, string | undefined>;
  const limit = Number.parseInt(query.limit ?? "50", 10);
  return { logs: await listAiReplyLogs(Number.isFinite(limit) ? limit : 50) };
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

app.get("/api/guest-contacts", async (_request, reply) => {
  try {
    return await withTimeout(listGuestContacts(), 6000, "Guest contacts list timeout");
  } catch (error) {
    return reply.status(503).send({
      error: "Guest contacts unavailable",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/guest-contacts/:phone", async (request, reply) => {
  const { phone } = request.params as { phone: string };
  try {
    const contact = await withTimeout(getGuestContact(decodeURIComponent(phone)), 3500, "Guest contact lookup timeout");
    if (!contact) return reply.status(404).send({ error: "Guest contact not found" });
    return contact;
  } catch (error) {
    return reply.status(503).send({
      error: "Guest contact lookup unavailable",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/guest-contacts", async (request, reply) => {
  const result = guestContactSchema.safeParse(request.body);

  if (!result.success) {
    return reply.status(400).send({
      error: "Invalid guest contact",
      details: result.error.flatten()
    });
  }

  try {
    const contact = await withTimeout(saveGuestContact(result.data), 6000, "Guest contact save timeout");
    broadcastRealtime("guest-contacts.changed", { action: "upsert", contact });
    await deleteExpiredContactLocks();
    return contact;
  } catch (error) {
    return reply.status(503).send({
      error: "Guest contact save unavailable",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.delete("/api/guest-contacts/:phone", async (request, reply) => {
  const { phone } = request.params as { phone: string };
  try {
    const decodedPhone = decodeURIComponent(phone);
    await withTimeout(deleteGuestContact(decodedPhone), 6000, "Guest contact delete timeout");
    broadcastRealtime("guest-contacts.changed", { action: "delete", phone: normalizeReservationPhone(decodedPhone) });
    return reply.status(204).send();
  } catch (error) {
    return reply.status(503).send({
      error: "Guest contact delete unavailable",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/reservations", async () => {
  return listReservations();
});

app.put("/api/reservations", async (request) => {
  const body = request.body as { items?: Array<Record<string, unknown>> } | undefined;
  const query = request.query as { clientId?: string };
  const items = await replaceReservations(Array.isArray(body?.items) ? body.items : []);
  replaceCachedReservationStatusSources(items);
  broadcastRealtime("reservations.changed", { action: "replace", items }, query.clientId);
  return items;
});

app.put("/api/reservations/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const query = request.query as { clientId?: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") {
    return reply.status(400).send({ error: "Invalid reservation" });
  }

  const canonicalReservation = await findEquivalentActiveReservation(id, body);
  const targetId = canonicalReservation?.id ?? id;
  const normalizedBody = canonicalReservation
    ? {
      ...body,
      id: targetId,
      balancePaidAt: canonicalReservation.balancePaidAt ?? body.balancePaidAt,
      checkedInAt: canonicalReservation.checkedInAt ?? body.checkedInAt,
      checkedOutAt: canonicalReservation.checkedOutAt ?? body.checkedOutAt,
      paidAmount: Math.max(Number(canonicalReservation.paidAmount ?? 0), Number(body.paidAmount ?? 0)),
      payments: Array.isArray(canonicalReservation.payments) && canonicalReservation.payments.length
        ? canonicalReservation.payments
        : body.payments,
      prepaymentReceivedAt: canonicalReservation.prepaymentReceivedAt ?? body.prepaymentReceivedAt
    }
    : body;

  const validation = await validateReservationBeforeSave(targetId, normalizedBody);
  if (!validation.ok) {
    return reply.status(validation.status).send(validation);
  }

  const reservation = await saveReservationData(targetId, normalizedBody);
  upsertCachedReservationStatusSource(reservation);
  broadcastRealtime("reservations.changed", { action: "upsert", reservation }, query.clientId);
  return reservation;
});

async function findEquivalentActiveReservation(id: string, reservation: Record<string, unknown>) {
  if (reservation.status === "cancelled" || reservation.isAddOnSale) return null;
  const phone = normalizeReservationPhone(reservation.phone);
  const checkIn = toReservationText(reservation.checkIn);
  const checkOut = toReservationText(reservation.checkOut);
  const roomIds = Array.isArray(reservation.roomIds) ? reservation.roomIds.map(toReservationText).filter(Boolean).sort() : [];
  if (!phone || !checkIn || !checkOut || !roomIds.length) return null;
  return (await listReservations())
    .filter((candidate) =>
      candidate.id !== id &&
      !candidate.isAddOnSale &&
      candidate.status !== "cancelled" &&
      !candidate.noShowAt &&
      normalizeReservationPhone(candidate.phone) === phone &&
      candidate.checkIn === checkIn &&
      candidate.checkOut === checkOut
    )
    .filter((candidate) => {
      const candidateRoomIds = Array.isArray(candidate.roomIds)
        ? candidate.roomIds.map(toReservationText).filter(Boolean).sort()
        : [];
      return candidateRoomIds.length === roomIds.length && candidateRoomIds.every((roomId, index) => roomId === roomIds[index]);
    })
    .sort((left, right) => {
      const leftPaid = Number(left.paidAmount ?? 0);
      const rightPaid = Number(right.paidAmount ?? 0);
      if (leftPaid !== rightPaid) return rightPaid - leftPaid;
      return String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""));
    })[0] ?? null;
}

app.post("/api/reservations/:id/actions/:action", async (request, reply) => {
  const { id, action } = request.params as { id: string; action: ReservationAction };
  const query = request.query as { clientId?: string };
  const supportedActions: ReservationAction[] = ["confirm", "prepayment", "balance", "check-in", "check-out"];
  if (!supportedActions.includes(action)) return reply.status(400).send({ error: "Unsupported reservation action" });

  const decodedId = decodeURIComponent(id);
  const existing = (await listReservations()).find((reservation) => reservation.id === decodedId);
  if (!existing) return reply.status(404).send({ error: "Reservation not found" });

  let nextReservation: Record<string, unknown>;
  try {
    nextReservation = applyReservationAction(existing, action, {
      ...(request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {}),
      now: new Date().toISOString()
    });
  } catch (error) {
    return reply.status(409).send({ error: error instanceof Error ? error.message : String(error) });
  }

  if (action === "confirm") {
    const validation = await validateReservationBeforeSave(decodedId, nextReservation);
    if (!validation.ok) return reply.status(validation.status).send(validation);
  }

  const reservation = nextReservation === existing ? existing : await saveReservationData(decodedId, nextReservation);
  upsertCachedReservationStatusSource(reservation);
  broadcastRealtime("reservations.changed", { action: "upsert", reservation }, query.clientId);
  return reservation;
});

app.delete("/api/reservations/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const query = request.query as { clientId?: string };
  await deleteReservationData(id);
  const decodedId = decodeURIComponent(id);
  deleteCachedReservationStatusSource(decodedId);
  broadcastRealtime("reservations.changed", { action: "delete", id: decodedId }, query.clientId);
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

app.get("/api/chat-drafts", async (request) => {
  const query = request.query as Record<string, string | undefined>;
  if (query.full !== "1") {
    return { drafts: {} };
  }

  return { drafts: await getChatDraftData() };
});

app.get("/api/chat-statuses", async () => {
  return getCachedChatStatusSources();
});

app.get("/api/chat-status", async (request) => {
  const query = request.query as { chatId?: string; phone?: string; title?: string; waChatId?: string };
  const chatId = toSafeString(query.chatId).toLowerCase();
  const phoneDigits = normalizeReservationPhone(query.phone);
  const phone = phoneDigits ? `+${phoneDigits}` : "";
  const title = toSafeString(query.title);
  const waChatId = toSafeString(query.waChatId).toLowerCase();
  const chatIds = [
    chatId,
    phone ? `phone:${phone}` : "",
    waChatId ? `wa:${waChatId}` : ""
  ];
  const phones = phoneDigits ? [phone, phoneDigits] : [];
  const sources = await getChatStatusSourcesForIdentityData(chatIds, phones, waChatId ? [waChatId] : [], title ? [title] : []);
  return {
    ...sources,
    resolvedStatus: resolveChatStatus(sources.drafts, sources.reservations)
  };
});

app.get("/api/chat-drafts/:chatId", async (request) => {
  const { chatId } = request.params as { chatId: string };
  const decodedChatId = decodeURIComponent(chatId);
  const canonicalIdentity = canonicalizeChatDraftIdentity(decodedChatId, {});
  const storedDraft = await getChatDraftById(canonicalIdentity.chatId) ?? await getChatDraftById(decodedChatId);
  const draft = await sanitizeChatDraft(storedDraft);
  if (draft && storedDraft && JSON.stringify(draft) !== JSON.stringify(storedDraft)) {
    await saveChatDraftData(canonicalIdentity.chatId, draft as Record<string, unknown>);
  }
  return { draft };
});

async function sanitizeChatDrafts(drafts: Record<string, unknown>) {
  const entries = await Promise.all(
    Object.entries(drafts).map(async ([chatId, draft]) => [chatId, await sanitizeChatDraft(draft)] as const)
  );
  return Object.fromEntries(entries);
}

async function sanitizeChatDraft(draft: unknown) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return draft;

  const draftRecord = draft as Record<string, unknown>;
  const lastReservation = draftRecord.lastReservation;
  if (!lastReservation || typeof lastReservation !== "object" || Array.isArray(lastReservation)) {
    const linkedReservation = await findReservationForDraft(draftRecord);
    return linkedReservation
      ? {
        ...draftRecord,
        agreementEverSent: true,
        lastReservation: linkedReservation,
        prepaymentAlreadyPaid: Boolean(linkedReservation.prepaymentReceivedAt)
      }
      : draftRecord;
  }

  const reservationId = typeof (lastReservation as Record<string, unknown>).id === "string"
    ? (lastReservation as Record<string, unknown>).id
    : "";
  if (!reservationId) return clearDraftReservationLink(draftRecord);

  const reservations = await listReservations();
  const linkedReservation = reservations.find((reservation) => reservation.id === reservationId);
  if (linkedReservation && linkedReservation.status !== "cancelled" && !linkedReservation.noShowAt) {
    return { ...draftRecord, lastReservation: linkedReservation };
  }

  return clearDraftReservationLink(draftRecord);
}

async function findReservationForDraft(draft: Record<string, unknown>) {
  const phone = normalizeReservationPhone(draft.phone);
  if (!phone) return null;
  const checkIn = toReservationText(draft.checkIn);
  const checkOut = toReservationText(draft.checkOut);
  const selectedRoomIds = Array.isArray(draft.selectedBookingRoomIds)
    ? draft.selectedBookingRoomIds.map(toReservationText).filter(Boolean).sort()
    : [];
  const candidates = (await listReservations())
    .filter((reservation) =>
      !reservation.isAddOnSale &&
      reservation.status !== "cancelled" &&
      !reservation.noShowAt &&
      normalizeReservationPhone(reservation.phone) === phone
    )
    .filter((reservation) => !checkIn || !checkOut || (reservation.checkIn === checkIn && reservation.checkOut === checkOut))
    .filter((reservation) => {
      if (!selectedRoomIds.length) return true;
      const roomIds = Array.isArray(reservation.roomIds) ? reservation.roomIds.map(toReservationText).filter(Boolean).sort() : [];
      return roomIds.length === selectedRoomIds.length && roomIds.every((roomId, index) => roomId === selectedRoomIds[index]);
    })
    .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")));
  return candidates.length === 1 ? candidates[0] : null;
}

function clearDraftReservationLink(draft: Record<string, unknown>) {
  return {
    ...draft,
    agreementSent: false,
    lastReservation: null,
    prepaymentAlreadyPaid: false,
    selectedBookingRoomIds: [],
    selectedRoomId: "",
    updatedAt: new Date().toISOString()
  };
}

app.put("/api/chat-drafts", async (request) => {
  const body = request.body as { drafts?: Record<string, unknown> } | undefined;
  const drafts = body?.drafts && typeof body.drafts === "object" && !Array.isArray(body.drafts) ? body.drafts : {};
  const canonicalDrafts: Record<string, unknown> = {};
  for (const [chatId, rawDraft] of Object.entries(drafts)) {
    const identity = canonicalizeChatDraftIdentity(chatId, rawDraft);
    canonicalDrafts[identity.chatId] = mergeChatDraftUpdate(canonicalDrafts[identity.chatId], identity.draft);
  }
  const savedDrafts = await replaceChatDraftData(await sanitizeChatDrafts(canonicalDrafts));
  replaceCachedChatDraftStatusSources(savedDrafts);
  broadcastRealtime("chat-drafts.changed", { action: "replace", drafts: savedDrafts });
  return { drafts: savedDrafts };
});

app.put("/api/chat-drafts/:chatId", async (request, reply) => {
  const { chatId } = request.params as { chatId: string };
  const body = request.body as { draft?: unknown } | undefined;
  if (!body || !body.draft || typeof body.draft !== "object" || Array.isArray(body.draft)) {
    return reply.status(400).send({ error: "Invalid chat draft" });
  }

  const decodedChatId = decodeURIComponent(chatId);
  const identity = canonicalizeChatDraftIdentity(decodedChatId, body.draft);
  const existingCanonicalDraft = await getChatDraftById(identity.chatId);
  const existingLegacyDraft = identity.chatId === decodedChatId ? null : await getChatDraftById(decodedChatId);
  const mergedExistingDraft = mergeChatDraftUpdate(
    existingCanonicalDraft,
    (existingLegacyDraft ?? {}) as Record<string, unknown>
  );
  const mergedDraft = mergeChatDraftUpdate(mergedExistingDraft, identity.draft);
  const draft = await saveChatDraftData(identity.chatId, await sanitizeChatDraft(mergedDraft));
  if (identity.chatId !== decodedChatId) {
    await deleteChatDraftData(decodedChatId);
    deleteCachedChatDraftStatusSource(decodedChatId);
  }
  upsertCachedChatDraftStatusSource(identity.chatId, draft);
  broadcastRealtime("chat-drafts.changed", { action: "upsert", chatId: identity.chatId, draft });
  return { draft };
});

app.delete("/api/chat-drafts/:chatId", async (request, reply) => {
  const { chatId } = request.params as { chatId: string };
  const decodedChatId = decodeURIComponent(chatId);
  await deleteChatDraftData(decodedChatId);
  deleteCachedChatDraftStatusSource(decodedChatId);
  broadcastRealtime("chat-drafts.changed", { action: "delete", chatId: decodedChatId });
  return reply.status(204).send();
});

app.get("/api/chat-messages", async (request) => {
  const query = request.query as { limit?: string };
  const limit = Number.parseInt(query.limit || "20000", 10);
  return { dialogs: await listChatMessageDialogs(Number.isFinite(limit) ? limit : 20_000) };
});

app.get("/api/chat-messages/:chatKey", async (request) => {
  const { chatKey } = request.params as { chatKey: string };
  const query = request.query as { limit?: string };
  const limit = Number.parseInt(query.limit || "500", 10);
  return { messages: await listChatMessages(decodeURIComponent(chatKey), Number.isFinite(limit) ? limit : 500) };
});

app.put("/api/chat-messages/:chatKey", async (request, reply) => {
  const { chatKey } = request.params as { chatKey: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply.status(400).send({ error: "Invalid chat messages payload" });
  }

  return saveChatMessagesData(decodeURIComponent(chatKey), body);
});

app.get("/api/room-holds", async () => {
  return listRoomHolds();
});

app.put("/api/room-holds/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply.status(400).send({ error: "Invalid room hold" });
  }

  const hold = await saveRoomHoldData(id, body);
  broadcastRealtime("room-holds.changed", { action: "upsert", hold }, typeof body.clientId === "string" ? body.clientId : "");
  return hold;
});

app.delete("/api/room-holds/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const query = request.query as { clientId?: string };
  await deleteRoomHoldData(decodeURIComponent(id));
  broadcastRealtime("room-holds.changed", { action: "delete", id: decodeURIComponent(id) }, query.clientId);
  return reply.status(204).send();
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
    const details = error instanceof Error ? error.message : "Unknown upload error";
    return reply.status(400).send({ error: "Media upload failed", details });
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

void getCachedChatStatusSources().catch((error) => {
  app.log.error(error, "Chat status cache warmup failed");
});
