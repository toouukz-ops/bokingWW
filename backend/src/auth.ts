import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyRequest } from "fastify";
import { ObjectId } from "mongodb";
import { db } from "./db.js";

const scrypt = promisify(scryptCallback);
const users = db.collection("authUsers");
const sessions = db.collection("authSessions");
const auditLogs = db.collection("authAuditLogs");
const SESSION_HOURS = Math.max(1, Number.parseInt(process.env.AUTH_SESSION_HOURS || "12", 10) || 12);

export type AuthUser = { id: string; username: string; displayName: string; role: "admin" | "operator" };

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

export async function authenticate(username: string, password: string, request: FastifyRequest) {
  const normalized = username.trim().toLowerCase();
  const user = await users.findOne({ username: normalized, active: { $ne: false } });
  if (!user || typeof user.passwordHash !== "string" || !await verifyPassword(password, user.passwordHash)) {
    await writeAudit("login.failed", null, request, { username: normalized });
    return null;
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000);
  await sessions.insertOne({ tokenHash, userId: user._id, createdAt: now, expiresAt, lastSeenAt: now });
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, updatedAt: now } });
  const safeUser = serializeUser(user);
  await writeAudit("login.success", safeUser, request);
  return { token, expiresAt: expiresAt.toISOString(), user: safeUser };
}

export async function getAuthenticatedUser(request: FastifyRequest) {
  const token = getRequestToken(request);
  if (!token) return null;
  const now = new Date();
  const session = await sessions.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: now } });
  if (!session) return null;
  const user = await users.findOne({ _id: session.userId, active: { $ne: false } });
  if (!user) return null;
  await sessions.updateOne({ _id: session._id }, { $set: { lastSeenAt: now } });
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

export async function writeAudit(action: string, actor: AuthUser | null, request: FastifyRequest, details: Record<string, unknown> = {}) {
  await auditLogs.insertOne({ action, actor, details, ip: request.ip, method: request.method, url: request.url, createdAt: new Date() });
}

function getRequestToken(request: FastifyRequest) {
  const authorization = String(request.headers.authorization || "");
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  const query = request.query as { access_token?: string } | undefined;
  return String(query?.access_token || "").trim();
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
