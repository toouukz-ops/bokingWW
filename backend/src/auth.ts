import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyRequest } from "fastify";
import { ObjectId } from "mongodb";
import { db } from "./db.js";

const scrypt = promisify(scryptCallback);
const users = db.collection("authUsers");
const sessions = db.collection("authSessions");
const devices = db.collection("authDevices");
const auditLogs = db.collection("authAuditLogs");
const SESSION_HOURS = Math.max(1, Number.parseInt(process.env.AUTH_SESSION_HOURS || "12", 10) || 12);

export type AuthUser = { id: string; username: string; displayName: string; role: "admin" | "operator" };
export type AuthDevice = { id: string; deviceId: string; deviceName: string; username: string; userId: string; status: "pending" | "approved" | "blocked"; createdAt?: Date; lastSeenAt?: Date };

export function isAuthRequired() {
  return String(process.env.AUTH_REQUIRED || "true").toLowerCase() !== "false";
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [, salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function authenticate(username: string, password: string, deviceInput: { deviceId: string; deviceName: string }, request: FastifyRequest) {
  const normalized = username.trim().toLowerCase();
  const user = await users.findOne({ username: normalized, active: { $ne: false } });
  if (!user || typeof user.passwordHash !== "string" || !await verifyPassword(password, user.passwordHash)) {
    await writeAudit("login.failed", null, request, { username: normalized });
    return null;
  }
  const deviceId = deviceInput.deviceId.trim();
  if (!/^[a-zA-Z0-9_-]{20,100}$/.test(deviceId)) return { denied: true as const, reason: "DEVICE_ID_REQUIRED" };
  const now = new Date();
  let device = await devices.findOne({ deviceId });
  if (device && String(device.userId) !== String(user._id)) return { denied: true as const, reason: "DEVICE_BOUND_TO_ANOTHER_USER" };
  if (!device) {
    const approvedDeviceCount = await devices.countDocuments({ status: "approved" });
    const status = user.role === "admin" && approvedDeviceCount === 0 ? "approved" : "pending";
    const document = { deviceId, deviceName: deviceInput.deviceName.trim().slice(0, 100) || "Неизвестное устройство", userId: user._id, status, createdAt: now, updatedAt: now, lastSeenAt: now };
    const result = await devices.insertOne(document);
    device = { ...document, _id: result.insertedId };
    await writeAudit(status === "approved" ? "device.bootstrap-approved" : "device.requested", serializeUser(user), request, { deviceId, deviceName: document.deviceName });
  } else {
    await devices.updateOne({ _id: device._id }, { $set: { deviceName: deviceInput.deviceName.trim().slice(0, 100) || device.deviceName, lastSeenAt: now, updatedAt: now } });
  }
  if (device.status !== "approved") return { denied: true as const, reason: device.status === "blocked" ? "DEVICE_BLOCKED" : "DEVICE_PENDING" };
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  await sessions.insertOne({ tokenHash, userId: user._id, deviceId, createdAt: now, expiresAt, lastSeenAt: now });
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, updatedAt: now } });
  const safeUser = serializeUser(user);
  await writeAudit("login.success", safeUser, request);
  return { denied: false as const, token, expiresAt: expiresAt.toISOString(), user: safeUser };
}

export async function getAuthenticatedUser(request: FastifyRequest) {
  const token = getRequestToken(request);
  if (!token) return null;
  const now = new Date();
  const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: now } });
  if (!session) return null;
  const requestDeviceId = getRequestDeviceId(request);
  if (!requestDeviceId || session.deviceId !== requestDeviceId) return null;
  const device = await devices.findOne({ deviceId: requestDeviceId, userId: session.userId, status: "approved" });
  if (!device) return null;
  const user = await users.findOne({ _id: session.userId, active: { $ne: false } });
  if (!user) return null;
  await sessions.updateOne({ _id: session._id }, { $set: { lastSeenAt: now } });
  await devices.updateOne({ _id: device._id }, { $set: { lastSeenAt: now } });
  return { sessionId: String(session._id), tokenHash: session.tokenHash, user: serializeUser(user) };
}

export async function logout(request: FastifyRequest) {
  const token = getRequestToken(request);
  if (token) await sessions.deleteOne({ tokenHash: hashToken(token) });
}

export async function listUsers() {
  return (await users.find({}).sort({ displayName: 1, username: 1 }).toArray()).map(serializeUserRecord);
}

export async function createUser(input: { username: string; displayName: string; password: string; role: "admin" | "operator" }) {
  const username = input.username.trim().toLowerCase();
  validateCredentials(username, input.password);
  const now = new Date();
  const document = { username, displayName: input.displayName.trim() || username, passwordHash: await hashPassword(input.password), role: input.role, active: true, createdAt: now, updatedAt: now };
  const result = await users.insertOne(document);
  return serializeUserRecord({ ...document, _id: result.insertedId });
}

export async function updateUser(id: string, patch: { active?: boolean; displayName?: string; password?: string; role?: "admin" | "operator" }) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.active === "boolean") set.active = patch.active;
  if (patch.displayName?.trim()) set.displayName = patch.displayName.trim();
  if (patch.role) set.role = patch.role;
  if (patch.password) {
    validateCredentials("valid-user", patch.password);
    set.passwordHash = await hashPassword(patch.password);
  }
  const _id = new ObjectId(id);
  await users.updateOne({ _id }, { $set: set });
  if (patch.active === false || patch.password) await sessions.deleteMany({ userId: _id });
  const user = await users.findOne({ _id });
  return user ? serializeUserRecord(user) : null;
}

export async function revokeUserSessions(id: string) {
  return (await sessions.deleteMany({ userId: new ObjectId(id) })).deletedCount;
}

export async function deleteUser(id: string, actorId: string) {
  if (id === actorId) throw new Error("You cannot delete your own account");
  const _id = new ObjectId(id);
  const user = await users.findOne({ _id });
  if (!user) return null;
  if (user.role === "admin" && await users.countDocuments({ role: "admin", active: { $ne: false } }) <= 1) throw new Error("The last administrator cannot be deleted");
  await Promise.all([sessions.deleteMany({ userId: _id }), devices.deleteMany({ userId: _id })]);
  await users.deleteOne({ _id });
  return serializeUserRecord(user);
}

export async function listDevices(): Promise<AuthDevice[]> {
  const userRecords = await users.find({}).project({ username: 1 }).toArray();
  const names = new Map(userRecords.map((user) => [String(user._id), String(user.username)]));
  return (await devices.find({}).sort({ createdAt: -1 }).toArray()).map((device) => ({
    id: String(device._id), deviceId: String(device.deviceId), deviceName: String(device.deviceName || "Неизвестное устройство"),
    userId: String(device.userId), username: names.get(String(device.userId)) || "", status: device.status === "approved" ? "approved" : device.status === "blocked" ? "blocked" : "pending",
    createdAt: device.createdAt, lastSeenAt: device.lastSeenAt
  }));
}

export async function updateDevice(id: string, status: "approved" | "blocked") {
  const _id = new ObjectId(id);
  const device = await devices.findOneAndUpdate({ _id }, { $set: { status, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!device) return null;
  if (status === "blocked") await sessions.deleteMany({ deviceId: device.deviceId });
  return device;
}

export async function writeAudit(action: string, actor: AuthUser | null, request: FastifyRequest, details: Record<string, unknown> = {}) {
  await auditLogs.insertOne({ action, actor, details, ip: request.ip, method: request.method, url: request.url, createdAt: new Date() });
}

function getRequestToken(request: FastifyRequest) {
  const authorization = String(request.headers.authorization || "");
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  const query = request.query as { access_token?: string } | undefined;
  return String(query?.access_token || "").trim();
}

function getRequestDeviceId(request: FastifyRequest) {
  const query = request.query as { device_id?: string } | undefined;
  return String(request.headers["x-gpb-device-id"] || query?.device_id || "").trim();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function serializeUser(user: Record<string, any>): AuthUser {
  return { id: String(user._id), username: String(user.username), displayName: String(user.displayName || user.username), role: user.role === "admin" ? "admin" : "operator" };
}

function serializeUserRecord(user: Record<string, any>) {
  return { ...serializeUser(user), active: user.active !== false, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt };
}

function validateCredentials(username: string, password: string) {
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("Login must contain 3-40 latin letters, digits, dot, dash or underscore");
  if (password.length < 10) throw new Error("Password must contain at least 10 characters");
}
