export type SessionUser = { id: string; username: string; displayName: string; role: "admin" | "operator" };
export type ManagedUser = SessionUser & { active: boolean; createdAt?: string; lastLoginAt?: string };
export type ManagedDevice = { id: string; deviceId: string; deviceName: string; username: string; userId: string; status: "pending" | "approved" | "blocked"; createdAt?: string; lastSeenAt?: string };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://bokingww.onrender.com";
const AUTH_STORAGE_KEY = "gpb-auth-session";
const DEVICE_STORAGE_KEY = "gpb-auth-device";
const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const VERSION_HEADER = "X-GPB-Extension-Version";
const nativeFetch = window.fetch.bind(window);
let currentToken = "";
let currentUser: SessionUser | null = null;
let currentDevice = { deviceId: "", deviceName: "" };
let fetchInstalled = false;

export async function initializeAuth() {
  currentDevice = await ensureDeviceIdentity();
  const stored = await readStoredSession();
  currentToken = stored?.token || "";
  installAuthenticatedFetch();
  if (!currentToken) return null;
  const response = await nativeFetch(`${API_BASE_URL}/api/auth/me`, { headers: getDirectHeaders({ Authorization: `Bearer ${currentToken}` }) });
  if (!response.ok) {
    await clearAuthSession();
    return null;
  }
  currentUser = (await response.json() as { user: SessionUser }).user;
  return currentUser;
}

export async function login(username: string, password: string) {
  currentDevice = await ensureDeviceIdentity();
  const response = await nativeFetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: getDirectHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ username, password, ...currentDevice })
  });
  const errorPayload = response.ok ? null : await response.json().catch(() => ({})) as { code?: string };
  if (!response.ok) throw new Error(response.status === 426 ? "Версия расширения устарела. Установите последнюю версию." : errorPayload?.code === "DEVICE_PENDING" ? "Это устройство ожидает разрешения администратора." : errorPayload?.code === "DEVICE_BLOCKED" ? "Это устройство заблокировано администратором." : response.status === 429 ? "Слишком много попыток. Повторите через 15 минут." : "Неверный логин или пароль.");
  const session = await response.json() as { token: string; expiresAt: string; user: SessionUser };
  currentToken = session.token;
  currentUser = session.user;
  await writeStoredSession(session);
  return session.user;
}

export async function logout() {
  if (currentToken) {
    await nativeFetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST", headers: getDirectHeaders({ Authorization: `Bearer ${currentToken}` }) }).catch(() => undefined);
  }
  await clearAuthSession();
}

export function getAuthToken() {
  return currentToken;
}

export function getCurrentAuthUser() {
  return currentUser;
}

export async function getManagedUsers() {
  const response = await fetch(`${API_BASE_URL}/api/auth/users`);
  if (!response.ok) throw new Error(response.status === 403 ? "Доступно только администратору." : "Не удалось загрузить пользователей.");
  return (await response.json() as { users: ManagedUser[] }).users;
}

export async function createManagedUser(input: { username: string; displayName: string; password: string; role: "admin" | "operator" }) {
  const response = await fetch(`${API_BASE_URL}/api/auth/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const payload = await response.json().catch(() => ({})) as { error?: string; user?: ManagedUser };
  if (!response.ok || !payload.user) throw new Error(payload.error || "Не удалось создать пользователя.");
  return payload.user;
}

export async function updateManagedUser(id: string, patch: { active?: boolean; displayName?: string; password?: string; role?: "admin" | "operator" }) {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  const payload = await response.json().catch(() => ({})) as { error?: string; user?: ManagedUser };
  if (!response.ok || !payload.user) throw new Error(payload.error || "Не удалось обновить пользователя.");
  if (currentUser?.id === payload.user.id) currentUser = payload.user;
  return payload.user;
}

export async function revokeManagedUserSessions(id: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(id)}/sessions`, { method: "DELETE" });
  if (!response.ok) throw new Error("Не удалось завершить сессии пользователя.");
}

export async function deleteManagedUser(id: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error === "You cannot delete your own account" ? "Нельзя удалить свою учётную запись." : payload.error === "The last administrator cannot be deleted" ? "Нельзя удалить последнего администратора." : payload.error || "Не удалось удалить пользователя.");
}

export async function getManagedDevices() {
  const response = await fetch(`${API_BASE_URL}/api/auth/devices`);
  if (!response.ok) throw new Error("Не удалось загрузить устройства.");
  return (await response.json() as { devices: ManagedDevice[] }).devices;
}

export async function setManagedDeviceStatus(id: string, status: "approved" | "blocked") {
  const response = await fetch(`${API_BASE_URL}/api/auth/devices/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  if (!response.ok) throw new Error("Не удалось изменить доступ устройства.");
}

export function appendAuthToken(url: string) {
  const parsed = new URL(url);
  if (currentToken) parsed.searchParams.set("access_token", currentToken);
  parsed.searchParams.set("extension_version", EXTENSION_VERSION);
  parsed.searchParams.set("device_id", currentDevice.deviceId);
  return parsed.toString();
}

function installAuthenticatedFetch() {
  if (fetchInstalled) return;
  fetchInstalled = true;
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (url.startsWith(API_BASE_URL)) {
      headers.set(VERSION_HEADER, EXTENSION_VERSION);
      headers.set("X-GPB-Device-Id", currentDevice.deviceId);
      if (currentToken) headers.set("Authorization", `Bearer ${currentToken}`);
    }
    const response = await nativeFetch(input, { ...init, headers });
    if (response.status === 401 && !url.includes("/api/auth/login")) {
      await clearAuthSession();
      window.dispatchEvent(new CustomEvent("gpb-auth-required"));
    }
    return response;
  };
}

function getDirectHeaders(initial: HeadersInit) {
  const headers = new Headers(initial);
  headers.set(VERSION_HEADER, EXTENSION_VERSION);
  headers.set("X-GPB-Device-Id", currentDevice.deviceId);
  return headers;
}

async function ensureDeviceIdentity() {
  const stored = await new Promise<{ deviceId?: string; deviceName?: string }>((resolve) => chrome.storage.local.get([DEVICE_STORAGE_KEY], (result) => resolve(result[DEVICE_STORAGE_KEY] || {})));
  if (stored.deviceId) return { deviceId: stored.deviceId, deviceName: stored.deviceName || defaultDeviceName() };
  const identity = { deviceId: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""), deviceName: defaultDeviceName() };
  await new Promise<void>((resolve) => chrome.storage.local.set({ [DEVICE_STORAGE_KEY]: identity }, () => resolve()));
  return identity;
}

function defaultDeviceName() {
  return `${navigator.platform || "Компьютер"} · ${navigator.userAgent.includes("Windows") ? "Windows" : navigator.userAgent.includes("Mac") ? "Mac" : navigator.userAgent.includes("Linux") ? "Linux" : "Chrome"}`;
}

async function clearAuthSession() {
  currentToken = "";
  currentUser = null;
  await chrome.storage.local.remove(AUTH_STORAGE_KEY);
}

function readStoredSession() {
  return new Promise<{ token: string; expiresAt: string; user: SessionUser } | null>((resolve) => {
    chrome.storage.local.get([AUTH_STORAGE_KEY], (result) => resolve(result[AUTH_STORAGE_KEY] || null));
  });
}

function writeStoredSession(session: { token: string; expiresAt: string; user: SessionUser }) {
  return new Promise<void>((resolve) => chrome.storage.local.set({ [AUTH_STORAGE_KEY]: session }, () => resolve()));
}
