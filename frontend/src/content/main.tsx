import { createRoot } from "react-dom/client";
import { BookingPanel } from "../panel/BookingPanel";
import type { ChatBookingDraft, ManualChatStatus, Reservation } from "../shared/types";

const ROOT_ID = "gpb-booking-extension-root";
const LOCAL_CHAT_DRAFTS_STORAGE_KEY = "gpb-chat-booking-drafts";
const LOCAL_RESERVATIONS_STORAGE_KEY = "gpb-booking-reservations";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://bokingww.onrender.com";

type ChatStatusTone = "info" | "pending" | "success" | "extended" | "muted" | "danger";
type ChatStatusItem = {
  label: string;
  manualStatus?: ManualChatStatus;
  tone: ChatStatusTone;
  updatedAt: string;
};
type ChatStatusIndex = {
  byPhone: Map<string, ChatStatusItem>;
  byTitle: Map<string, ChatStatusItem>;
  byChatId: Map<string, ChatStatusItem>;
  byWaChatId: Map<string, ChatStatusItem>;
  ambiguousTitles: Set<string>;
  items: Array<{ phone: string; status: ChatStatusItem; title: string }>;
};

let chatStatusIndex: ChatStatusIndex = createEmptyChatStatusIndex();
let chatStatusRefreshTimer: number | null = null;
let chatStatusOverlayStarted = false;
let chatStatusPollTimer: number | null = null;
let chatStatusRefreshInFlight = false;
let chatStatusEvents: EventSource | null = null;
let manualStatusMenu: HTMLElement | null = null;
let activeChatStatusRow: HTMLElement | null = null;
let activeChatStatusIdentity: ReturnType<typeof getChatIdentityForRow> | null = null;
const loadedChatStatuses = new Map<string, ChatStatusItem>();
const observedOutgoingMessages = new WeakSet<Element>();
let lastObservedOutgoingFingerprint = "";
let chatStatusDebug = {
  applied: 0,
  rows: 0,
  serverDrafts: 0,
  serverReservations: 0,
  statuses: 0,
  updatedAt: ""
};

const EMPTY_CHAT_STATUS: ChatStatusItem = {
  label: "Без статуса",
  manualStatus: "none",
  tone: "muted",
  updatedAt: ""
};

const MANUAL_CHAT_STATUS_OPTIONS: Array<{ value: ManualChatStatus; label: string; tone: ChatStatusTone }> = [
  { value: "none", label: "Без статуса", tone: "muted" },
  { value: "chat-started", label: "Чат начат", tone: "info" },
  { value: "room-sent", label: "Номер отправлен", tone: "info" },
  { value: "price-sent", label: "Прайс отправлен", tone: "info" },
  { value: "agreement", label: "На согласовании", tone: "pending" },
  { value: "prepayment", label: "Предоплата получена", tone: "success" },
  { value: "booked", label: "Забронировано", tone: "success" },
  { value: "checked-in", label: "Въехал", tone: "success" },
  { value: "checked-out", label: "Выехал", tone: "muted" },
  { value: "cancelled", label: "Снято с брони", tone: "danger" }
];

function isExtensionContextInvalidatedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /extension context invalidated|context invalidated/i.test(message);
}

window.addEventListener("unhandledrejection", (event) => {
  if (isExtensionContextInvalidatedError(event.reason)) {
    event.preventDefault();
  }
});

function canUseChromeStorage() {
  try {
    return Boolean(chrome?.runtime?.id && chrome.storage?.local);
  } catch {
    return false;
  }
}

function mountPanel() {
  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  document.body.appendChild(root);

  createRoot(root).render(<BookingPanel />);
}

function startWhatsAppChatStatusOverlay() {
  if (chatStatusOverlayStarted) return;
  if (!canUseChromeStorage()) {
    window.setTimeout(startWhatsAppChatStatusOverlay, 800);
    return;
  }
  chatStatusOverlayStarted = true;

  const observer = new MutationObserver((mutations) => {
    if (mutations.length && mutations.every(isOwnChatStatusMutation)) return;
    detectOutgoingChatStatusEvents(mutations);
    scheduleApplyChatStatuses();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", handleChatStatusActivationClick, true);
  document.addEventListener("click", closeManualStatusMenuOnOutsideClick, true);

  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (!changes[LOCAL_CHAT_DRAFTS_STORAGE_KEY] && !changes[LOCAL_RESERVATIONS_STORAGE_KEY]) return;
      void applyLocalStatusToActiveChat();
    });
  } catch {
    if (chatStatusPollTimer) window.clearInterval(chatStatusPollTimer);
    chatStatusPollTimer = null;
    chatStatusOverlayStarted = false;
    observer.disconnect();
  }
}

function handleChatStatusActivationClick(event: MouseEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target || target.closest(".gpb-wa-chat-status-badge") || target.closest(".gpb-wa-chat-status-menu")) return;
  const sidebar = getWhatsAppSidebar();
  if (!sidebar || !sidebar.contains(target)) return;
  const row = findWhatsAppChatRow(target, sidebar, sidebar.getBoundingClientRect());
  if (!row) return;
  window.setTimeout(() => {
    void activateChatStatusRow(row);
  }, 0);
}

async function activateChatStatusRow(row: HTMLElement) {
  const identity = getChatIdentityForRow(row);
  if (!identity.chatId) return;
  activeChatStatusRow = row;
  activeChatStatusIdentity = identity;
  await applyLocalStatusToActiveChat();

  const activationKey = getChatStatusIdentityKey(identity);
  try {
    const serverSources = await fetchServerChatStatusForIdentity(identity);
    if (
      !activeChatStatusRow ||
      !activeChatStatusIdentity ||
      getChatStatusIdentityKey(activeChatStatusIdentity) !== activationKey
    ) {
      return;
    }
    const localSources = await getLocalChatStatusSources();
    const drafts = mergeChatDraftStatusSources(localSources.drafts, serverSources.drafts);
    const reservations = mergeReservationStatusSources(localSources.reservations, serverSources.reservations);
    chatStatusIndex = createChatStatusIndexFromSources(drafts, reservations);
    syncLoadedStatusForActiveChat();
    applyChatStatusesToWhatsAppList();
  } catch {
    // The local status already remains visible for the selected chat.
  }
}

async function applyLocalStatusToActiveChat() {
  if (!activeChatStatusRow || !activeChatStatusIdentity) return;
  const localSources = await getLocalChatStatusSources();
  chatStatusIndex = createChatStatusIndexFromSources(localSources.drafts, localSources.reservations);
  syncLoadedStatusForActiveChat();
  applyChatStatusesToWhatsAppList();
}

function getChatStatusIdentityKey(identity: ReturnType<typeof getChatIdentityForRow>) {
  return identity.waChatId || identity.phone || identity.chatId;
}

function getChatStatusIdentityKeys(identity: ReturnType<typeof getChatIdentityForRow>) {
  return Array.from(new Set([
    identity.waChatId ? `wa:${identity.waChatId}` : "",
    identity.phone ? `phone:${identity.phone}` : "",
    identity.chatId ? `chat:${identity.chatId}` : ""
  ].filter(Boolean)));
}

function syncLoadedStatusForActiveChat() {
  if (!activeChatStatusIdentity) return;
  const status = getStatusForChatIdentity(activeChatStatusIdentity);
  const keys = getChatStatusIdentityKeys(activeChatStatusIdentity);
  if (!status || status.label === EMPTY_CHAT_STATUS.label) {
    keys.forEach((key) => loadedChatStatuses.delete(key));
    if (activeChatStatusRow) clearChatStatusRow(activeChatStatusRow);
    return;
  }
  keys.forEach((key) => loadedChatStatuses.set(key, status));
}

function getLoadedStatusForIdentity(identity: ReturnType<typeof getChatIdentityForRow>) {
  for (const key of getChatStatusIdentityKeys(identity)) {
    const status = loadedChatStatuses.get(key);
    if (status) return status;
  }
  return null;
}

async function fetchServerChatStatusForIdentity(identity: ReturnType<typeof getChatIdentityForRow>) {
  const params = new URLSearchParams();
  params.set("chatId", identity.chatId);
  if (identity.phone) params.set("phone", `+${identity.phone}`);
  if (identity.waChatId) params.set("waChatId", identity.waChatId);
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/chat-status?${params.toString()}`, 8000);
  if (!response.ok) throw new Error(`Chat status request failed: ${response.status}`);
  const payload = await response.json();
  return {
    drafts: normalizeChatDrafts((payload as { drafts?: unknown })?.drafts),
    reservations: normalizeReservations((payload as { reservations?: unknown })?.reservations)
  };
}

function startChatStatusRealtimeSync() {
  if (chatStatusEvents) return;
  try {
    const events = new EventSource(`${API_BASE_URL}/api/events?clientId=chat-status-overlay`);
    const refresh = () => void refreshChatStatusIndex();
    events.addEventListener("chat-drafts.changed", refresh);
    events.addEventListener("reservations.changed", refresh);
    chatStatusEvents = events;
  } catch {
    chatStatusEvents = null;
  }
}

function detectOutgoingChatStatusEvents(mutations: MutationRecord[]) {
  const outgoingMessages = new Set<Element>();
  mutations.forEach((mutation) => {
    Array.from(mutation.addedNodes).forEach((node) => {
      if (!(node instanceof Element) || node.closest(`#${ROOT_ID}`)) return;
      if (node.matches(".message-out")) outgoingMessages.add(node);
      node.querySelectorAll(".message-out").forEach((message) => outgoingMessages.add(message));
    });
  });

  outgoingMessages.forEach((message) => {
    if (observedOutgoingMessages.has(message)) return;
    observedOutgoingMessages.add(message);
    const text = normalizeText((message as HTMLElement).innerText || message.textContent || "");
    const identity = getActiveChatStatusIdentity();
    if (!identity.chatId) return;
    const fingerprint = `${identity.chatId}|${text.slice(0, 240)}`;
    if (fingerprint === lastObservedOutgoingFingerprint) return;
    lastObservedOutgoingFingerprint = fingerprint;
    void recordAutomaticChatStatus(identity, isSentRoomMessageText(text) ? "room-sent" : "chat-started");
  });
}

function getActiveChatStatusIdentity() {
  const selectedRow = document.querySelector<HTMLElement>(
    '#pane-side [aria-selected="true"], #side [aria-selected="true"], #pane-side [data-testid="cell-frame-container"][aria-selected="true"]'
  );
  if (selectedRow) return getChatIdentityForRow(selectedRow);
  const activeRoot = document.querySelector<HTMLElement>("#main");
  const waChatId = extractWhatsAppChatIdFromElement(activeRoot);
  const title = normalizeText(document.querySelector<HTMLElement>("#main header [title]")?.getAttribute("title") || "");
  const phone = normalizePhone(waChatId) || normalizePhone(title);
  const chatId = waChatId
    ? createChatId(`wa:${waChatId}`)
    : phone
      ? createChatId(`phone:+${phone}`)
      : title
        ? createChatId(`title:${title}`)
        : "";
  return { chatId, phone, title, waChatId };
}

function isSentRoomMessageText(text: string) {
  return /(?:^|\s)номер\s*(?:№\s*)?\d{2,4}\b/i.test(text) &&
    /(?:стандарт|люкс|полулюкс|комнат|кровать|мест|этаж|цена|сутк)/i.test(text);
}

async function recordAutomaticChatStatus(
  identity: { chatId: string; phone: string; title: string; waChatId: string },
  kind: "chat-started" | "room-sent"
) {
  const now = new Date().toISOString();
  const localSources = await getLocalChatStatusSources();
  const localDraft = localSources.drafts[identity.chatId] ?? null;
  const serverDraft = await fetchServerChatDraft(identity.chatId).catch(() => null);
  const existingDraft = !serverDraft || compareStatusSourceDates(localDraft?.updatedAt, serverDraft.updatedAt) >= 0
    ? localDraft
    : serverDraft;
  const phone = identity.phone ? `+${identity.phone}` : existingDraft?.phone || "";
  const draft = normalizeDraftForManualStatus(existingDraft, {
    guestFirstName: existingDraft?.guestFirstName || getGuestNameFallbackFromPhone(phone) || identity.title || "Гость",
    manualStatus: existingDraft?.manualStatus ?? "none",
    manualStatusAt: existingDraft?.manualStatusAt || now,
    phone,
    waChatId: identity.waChatId
  });
  draft.chatStartedAt = draft.chatStartedAt || now;
  if (kind === "room-sent" && !draft.agreementEverSent && !draft.agreementSent) {
    draft.catalogStatus = "room-sent";
    draft.catalogStatusAt = now;
  }
  draft.updatedAt = now;

  await saveAutomaticStatusDraftLocally(identity.chatId, draft);
  const status = getDraftStatusItem(draft);
  if (status) {
    setLatestStatus(chatStatusIndex.byChatId, identity.chatId, status);
    setLatestStatus(chatStatusIndex.byWaChatId, identity.waChatId, status);
    setLatestStatus(chatStatusIndex.byPhone, identity.phone, status);
    setLatestTitleStatus(chatStatusIndex, identity.title, status);
    addStatusIndexItem(chatStatusIndex, { phone: identity.phone, status, title: identity.title });
  }
  scheduleApplyChatStatuses();

  await fetchWithTimeout(`${API_BASE_URL}/api/chat-drafts/${encodeURIComponent(identity.chatId)}`, 8000, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft })
  }).catch(() => undefined);
}

function saveAutomaticStatusDraftLocally(chatId: string, draft: ChatBookingDraft) {
  return new Promise<void>((resolve) => {
    if (!canUseChromeStorage()) {
      resolve();
      return;
    }
    chrome.storage.local.get([LOCAL_CHAT_DRAFTS_STORAGE_KEY], (result) => {
      const drafts = normalizeChatDrafts(result[LOCAL_CHAT_DRAFTS_STORAGE_KEY]);
      chrome.storage.local.set({ [LOCAL_CHAT_DRAFTS_STORAGE_KEY]: { ...drafts, [chatId]: draft } }, () => resolve());
    });
  });
}

function scheduleApplyChatStatuses() {
  if (chatStatusRefreshTimer) return;
  chatStatusRefreshTimer = window.setTimeout(() => {
    chatStatusRefreshTimer = null;
    syncLoadedStatusForActiveChat();
    applyChatStatusesToWhatsAppList();
  }, 180);
}

async function refreshChatStatusIndex() {
  if (chatStatusRefreshInFlight || !activeChatStatusRow) return;
  chatStatusRefreshInFlight = true;
  try {
    await activateChatStatusRow(activeChatStatusRow);
  } catch {
    // Keep the local status of the selected chat on a transient network error.
  } finally {
    chatStatusRefreshInFlight = false;
  }
}

async function buildChatStatusIndex(): Promise<ChatStatusIndex> {
  const localSources = await getLocalChatStatusSources();
  const serverResult = await Promise.allSettled([fetchServerChatStatusSources()]);
  const serverSources = serverResult[0]?.status === "fulfilled"
    ? serverResult[0].value
    : { drafts: {}, reservations: [] };
  const drafts = mergeChatDraftStatusSources(localSources.drafts, serverSources.drafts);
  const reservations = mergeReservationStatusSources(localSources.reservations, serverSources.reservations);

  updateChatStatusSourceDebug(Object.keys(serverSources.drafts).length, serverSources.reservations.length);
  return createChatStatusIndexFromSources(drafts, reservations);
}

function getLocalChatStatusSources(): Promise<{ drafts: Record<string, ChatBookingDraft>; reservations: Reservation[] }> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([LOCAL_CHAT_DRAFTS_STORAGE_KEY, LOCAL_RESERVATIONS_STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          resolve({ drafts: {}, reservations: [] });
          return;
        }
        resolve({
          drafts: normalizeChatDrafts(result[LOCAL_CHAT_DRAFTS_STORAGE_KEY]),
          reservations: normalizeReservations(result[LOCAL_RESERVATIONS_STORAGE_KEY])
        });
      });
    } catch {
      resolve({ drafts: {}, reservations: [] });
    }
  });
}

async function fetchServerChatStatusSources(): Promise<{ drafts: Record<string, ChatBookingDraft>; reservations: Reservation[] }> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/chat-statuses`, 20_000);
  if (!response.ok) throw new Error(`Chat statuses request failed: ${response.status}`);
  const payload = await response.json();
  return {
    drafts: normalizeChatDrafts((payload as { drafts?: unknown })?.drafts),
    reservations: normalizeReservations((payload as { reservations?: unknown })?.reservations)
  };
}

function mergeChatDraftStatusSources(
  localDrafts: Record<string, ChatBookingDraft>,
  serverDrafts: Record<string, ChatBookingDraft>
) {
  const merged = { ...serverDrafts };
  Object.entries(localDrafts).forEach(([chatId, localDraft]) => {
    const serverDraft = merged[chatId];
    if (!serverDraft || compareStatusSourceDates(localDraft.updatedAt, serverDraft.updatedAt) >= 0) {
      merged[chatId] = localDraft;
    }
  });
  return merged;
}

function mergeReservationStatusSources(localReservations: Reservation[], serverReservations: Reservation[]) {
  const merged = new Map(serverReservations.map((reservation) => [reservation.id, reservation]));
  localReservations.forEach((localReservation) => {
    const serverReservation = merged.get(localReservation.id);
    if (!serverReservation || compareStatusSourceDates(getReservationStatusUpdatedAt(localReservation), getReservationStatusUpdatedAt(serverReservation)) >= 0) {
      merged.set(localReservation.id, localReservation);
    }
  });
  return Array.from(merged.values());
}

function compareStatusSourceDates(left: string | undefined, right: string | undefined) {
  return String(left || "").localeCompare(String(right || ""));
}

function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => window.clearTimeout(timeoutId));
}

function createChatStatusIndexFromSources(drafts: Record<string, ChatBookingDraft>, reservations: Reservation[]) {
  const index = createEmptyChatStatusIndex();

  Object.entries(drafts).forEach(([chatId, draft]) => {
    const status = getDraftStatusItem(draft);
    if (!status) return;
    setLatestStatus(index.byChatId, chatId, status);
    const waChatId = normalizeWhatsAppChatId(draft.waChatId || extractWaChatIdFromChatId(chatId));
    setLatestStatus(index.byWaChatId, waChatId, status);
    const phone = normalizePhone(draft.phone);
    const title = extractDraftTitleFromChatId(chatId);
    const draftTitle = draft.lastReservation?.guestFirstName || draft.guestFirstName || "";
    setLatestStatus(index.byPhone, phone, status);
    setLatestTitleStatus(index, title, status);
    setLatestTitleStatus(index, draftTitle, status);
    addStatusIndexItem(index, { phone, status, title });
    addStatusIndexItem(index, { phone, status, title: draftTitle });
  });

  reservations.forEach((reservation) => {
    if (reservation.isAddOnSale) return;
    const status = getReservationStatusItem(reservation);
    const phone = normalizePhone(reservation.phone);
    setLatestStatus(index.byPhone, phone, status);
    if (reservation.phone) setLatestStatus(index.byChatId, createChatId(`phone:${reservation.phone}`), status);
    setLatestTitleStatus(index, reservation.guestFirstName, status);
    addStatusIndexItem(index, { phone, status, title: reservation.guestFirstName });
  });

  return index;
}

function applyChatStatusesToWhatsAppList() {
  const sidebar = getWhatsAppSidebar();
  if (!sidebar) return;
  const rows = getWhatsAppChatRows(sidebar);
  let applied = 0;
  rows.forEach((row) => {
    const identity = getChatIdentityForRow(row);
    const identityKey = getChatStatusIdentityKeys(identity)[0] || "";
    const status = getLoadedStatusForIdentity(identity);
    if (status) {
      if (row.dataset.gpbChatStatusIdentity && row.dataset.gpbChatStatusIdentity !== identityKey) {
        clearChatStatusRow(row);
      }
      applyChatStatusToRow(row, status);
      row.dataset.gpbChatStatusIdentity = identityKey;
      applied += 1;
    } else if (row.dataset.gpbChatStatusIdentity) {
      clearChatStatusRow(row);
    }
  });
  updateChatStatusDebug(rows.length, applied);
}

function getStatusForChatIdentity(identity: ReturnType<typeof getChatIdentityForRow>) {
  if (identity.waChatId) {
    const byWaChatId = chatStatusIndex.byWaChatId.get(identity.waChatId);
    if (byWaChatId) return byWaChatId;
    const byWaChatKey = chatStatusIndex.byChatId.get(createChatId(`wa:${identity.waChatId}`));
    if (byWaChatKey) return byWaChatKey;
  }
  if (identity.phone) {
    const byPhone = chatStatusIndex.byPhone.get(identity.phone);
    if (byPhone) return byPhone;
    const byPhoneChatId = chatStatusIndex.byChatId.get(createChatId(`phone:+${identity.phone}`));
    if (byPhoneChatId) return byPhoneChatId;
  }
  const byChatId = chatStatusIndex.byChatId.get(identity.chatId);
  if (byChatId) return byChatId;
  if (!identity.waChatId && !identity.phone && identity.title) {
    const titleKey = normalizeTitle(identity.title);
    if (titleKey && !chatStatusIndex.ambiguousTitles.has(titleKey)) {
      return chatStatusIndex.byTitle.get(titleKey) ?? null;
    }
  }
  return null;
}

function getWhatsAppSidebar() {
  return document.querySelector<HTMLElement>("#pane-side") ??
    document.querySelector<HTMLElement>("#side");
}

function applyChatStatusToRow(row: HTMLElement, status: ChatStatusItem) {
  if (status.label === EMPTY_CHAT_STATUS.label) {
    clearChatStatusRow(row);
    return;
  }
  const nextToneClass = `gpb-wa-chat-status-${status.tone}`;
  const currentBadge = row.querySelector<HTMLElement>(".gpb-wa-chat-status-badge");
  const isAlreadyApplied = row.classList.contains("gpb-wa-chat-status-row") &&
    row.classList.contains(nextToneClass) &&
    row.dataset.gpbChatStatus === status.label &&
    currentBadge?.textContent === status.label;

  if (isAlreadyApplied) return;

  row.classList.remove(
    "gpb-wa-chat-status-info",
    "gpb-wa-chat-status-pending",
    "gpb-wa-chat-status-success",
    "gpb-wa-chat-status-extended",
    "gpb-wa-chat-status-muted",
    "gpb-wa-chat-status-danger"
  );
  row.classList.add("gpb-wa-chat-status-row", nextToneClass);
  row.dataset.gpbChatStatus = status.label;
  row.style.position = "relative";

  const badge = currentBadge ?? document.createElement("span");
  badge.className = "gpb-wa-chat-status-badge";
  badge.textContent = status.label;
  badge.title = "Нажмите, чтобы поменять статус";
  badge.dataset.gpbManualStatus = status.manualStatus || "";
  badge.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openManualStatusMenu(row, badge, status);
  };
  if (!currentBadge) row.appendChild(badge);
}

function clearChatStatusRow(row: HTMLElement) {
  row.classList.remove(
    "gpb-wa-chat-status-row",
    "gpb-wa-chat-status-info",
    "gpb-wa-chat-status-pending",
    "gpb-wa-chat-status-success",
    "gpb-wa-chat-status-extended",
    "gpb-wa-chat-status-muted",
    "gpb-wa-chat-status-danger"
  );
  row.querySelector(".gpb-wa-chat-status-badge")?.remove();
  row.removeAttribute("data-gpb-chat-status");
  row.removeAttribute("data-gpb-chat-status-identity");
}

function isOwnChatStatusMutation(mutation: MutationRecord) {
  const target = mutation.target instanceof HTMLElement ? mutation.target : null;
  if (target?.classList.contains("gpb-wa-chat-status-row")) return true;
  const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
  return changedNodes.length > 0 && changedNodes.every((node) =>
    node instanceof HTMLElement && (
      node.classList.contains("gpb-wa-chat-status-badge") ||
      Boolean(node.querySelector(".gpb-wa-chat-status-badge"))
    )
  );
}

function getWhatsAppChatRows(sidebar: HTMLElement) {
  const sidebarRect = sidebar.getBoundingClientRect();
  const directRows = Array.from(sidebar.querySelectorAll<HTMLElement>('[role="listitem"], [role="row"], [data-testid="cell-frame-container"]'))
    .filter((element) => isVisibleChatRow(element, sidebarRect));
  if (directRows.length) {
    return uniqueChatRows(directRows);
  }

  const candidates = Array.from(sidebar.querySelectorAll<HTMLElement>('[aria-selected], div[tabindex], div[role="button"]'));
  const rows = new Set<HTMLElement>();

  candidates.forEach((element) => {
    if (element.closest(`#${ROOT_ID}`)) return;
    const row = findWhatsAppChatRow(element, sidebar, sidebarRect);
    if (row) rows.add(row);
  });

  return uniqueChatRows(Array.from(rows));
}

function uniqueChatRows(rows: HTMLElement[]) {
  const sortedRows = rows.sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
  return sortedRows.filter((row) => !sortedRows.some((otherRow) => otherRow !== row && row.contains(otherRow)));
}

function findWhatsAppChatRow(element: HTMLElement, sidebar: HTMLElement, sidebarRect: DOMRect) {
  let current: HTMLElement | null = element;
  let best: HTMLElement | null = null;

  for (let depth = 0; current && depth < 8; depth += 1) {
    if (isVisibleChatRow(current, sidebarRect)) {
      best = current;
      break;
    }
    if (current.parentElement === sidebar) break;
    current = current.parentElement;
  }

  return best;
}

function isVisibleChatRow(element: HTMLElement, sidebarRect: DOMRect) {
  const rect = element.getBoundingClientRect();
  const text = normalizeText(getElementText(element));
  const isInSidebar = rect.left >= sidebarRect.left - 4 && rect.right <= sidebarRect.right + 36;
  const hasChatShape = rect.width >= sidebarRect.width * 0.56 && rect.height >= 42 && rect.height <= 128;
  return isInSidebar && hasChatShape && text && !isNonChatRowText(text);
}

function getStatusForChatRow(row: HTMLElement) {
  const waChatId = extractWhatsAppChatIdFromElement(row);
  if (waChatId) {
    const byWaChatId = chatStatusIndex.byWaChatId.get(waChatId);
    if (byWaChatId) return byWaChatId;
    const byWaChatKey = chatStatusIndex.byChatId.get(createChatId(`wa:${waChatId}`));
    if (byWaChatKey) return byWaChatKey;
    const byWaPhone = chatStatusIndex.byPhone.get(normalizePhone(waChatId));
    if (byWaPhone) return byWaPhone;
  }

  const phone = normalizePhone(getElementText(row));
  const rowText = normalizeTitle(getElementText(row));
  if (phone) {
    const byPhone = chatStatusIndex.byPhone.get(phone);
    if (byPhone) return byPhone;
    const byPhoneChatId = chatStatusIndex.byChatId.get(createChatId(`phone:${phone}`));
    if (byPhoneChatId) return byPhoneChatId;
    const byPhoneTail = getStatusByPhoneTail(phone);
    if (byPhoneTail) return byPhoneTail;
  }

  const title = getChatRowTitle(row);
  if (title) {
    const titleChatIdStatus = chatStatusIndex.byChatId.get(createChatId(`title:${title}`));
    if (titleChatIdStatus) return titleChatIdStatus;
    const titleKey = normalizeTitle(title);
    if (titleKey && !chatStatusIndex.ambiguousTitles.has(titleKey)) {
      const byTitle = chatStatusIndex.byTitle.get(titleKey);
      if (byTitle) return byTitle;
    }
    const byExactTitle = getStatusByExactTitle(title);
    if (byExactTitle) return byExactTitle;
  }

  return inferStatusFromVisibleChatRowText(rowText);
}

function getChatIdentityForRow(row: HTMLElement) {
  const waChatId = extractWhatsAppChatIdFromElement(row);
  const rowText = getElementText(row);
  const phone = normalizePhone(waChatId) || normalizePhone(rowText);
  const title = getChatRowTitle(row);
  const chatId = waChatId
    ? createChatId(`wa:${waChatId}`)
    : phone
      ? createChatId(`phone:+${phone}`)
      : createChatId(`title:${title || "active-chat"}`);
  return { chatId, phone, title, waChatId };
}

function openManualStatusMenu(row: HTMLElement, badge: HTMLElement, currentStatus: ChatStatusItem) {
  closeManualStatusMenu();
  const identity = getChatIdentityForRow(row);
  const menu = document.createElement("div");
  menu.className = "gpb-wa-chat-status-menu";
  MANUAL_CHAT_STATUS_OPTIONS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `is-${option.tone}`;
    button.textContent = option.label;
    button.disabled = option.label === currentStatus.label || option.value === currentStatus.manualStatus;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void saveManualChatStatus(identity, option).finally(closeManualStatusMenu);
    });
    menu.appendChild(button);
  });

  const rect = badge.getBoundingClientRect();
  menu.style.top = `${Math.min(window.innerHeight - 320, Math.max(8, rect.bottom + 4))}px`;
  menu.style.left = `${Math.min(window.innerWidth - 210, Math.max(8, rect.right - 190))}px`;
  document.body.appendChild(menu);
  manualStatusMenu = menu;
}

function closeManualStatusMenuOnOutsideClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest(".gpb-wa-chat-status-menu") || target.closest(".gpb-wa-chat-status-badge")) return;
  closeManualStatusMenu();
}

function closeManualStatusMenu() {
  manualStatusMenu?.remove();
  manualStatusMenu = null;
}

async function saveManualChatStatus(
  identity: { chatId: string; phone: string; title: string; waChatId: string },
  option: { value: ManualChatStatus; label: string; tone: ChatStatusTone }
) {
  const now = new Date().toISOString();
  const status = option.value === "none"
    ? { ...EMPTY_CHAT_STATUS, updatedAt: now }
    : { label: option.label, manualStatus: option.value, tone: option.tone, updatedAt: now };
  setLatestStatus(chatStatusIndex.byChatId, identity.chatId, status);
  setLatestStatus(chatStatusIndex.byWaChatId, identity.waChatId, status);
  setLatestStatus(chatStatusIndex.byPhone, identity.phone, status);
  setLatestTitleStatus(chatStatusIndex, identity.title, status);
  scheduleApplyChatStatuses();

  const existingDraft = await fetchServerChatDraft(identity.chatId).catch(() => null);
  const phone = identity.phone ? `+${identity.phone}` : "";
  const draft = normalizeDraftForManualStatus(existingDraft, {
    guestFirstName: getGuestNameFallbackFromPhone(phone) || identity.title || "Гость",
    manualStatus: option.value,
    manualStatusAt: now,
    phone,
    waChatId: identity.waChatId
  });

  await fetchWithTimeout(`${API_BASE_URL}/api/chat-drafts/${encodeURIComponent(identity.chatId)}`, 8000, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft })
  });

  setLatestStatus(chatStatusIndex.byChatId, identity.chatId, status);
  setLatestStatus(chatStatusIndex.byWaChatId, identity.waChatId, status);
  setLatestStatus(chatStatusIndex.byPhone, identity.phone, status);
  setLatestTitleStatus(chatStatusIndex, identity.title, status);
  scheduleApplyChatStatuses();
  void refreshChatStatusIndex();
}

async function fetchServerChatDraft(chatId: string): Promise<ChatBookingDraft | null> {
  if (!chatId) return null;
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/chat-drafts/${encodeURIComponent(chatId)}`, 8000);
  if (!response.ok) return null;
  const payload = await response.json();
  return (payload as { draft?: ChatBookingDraft })?.draft ?? null;
}

function normalizeDraftForManualStatus(
  existingDraft: ChatBookingDraft | null,
  patch: { guestFirstName: string; manualStatus: ManualChatStatus; manualStatusAt: string; phone: string; waChatId: string }
): ChatBookingDraft {
  return {
    selectedRoomId: "",
    selectedBookingRoomIds: [],
    checkIn: "",
    checkOut: "",
    checkInTime: "13:00",
    checkOutTime: "12:00",
    comment: "",
    adults: 0,
    teenagers: 0,
    children: 0,
    hasPet: false,
    extraBed: false,
    extraBedType: "air-bed",
    airMattressCount: 0,
    rollawayCount: 0,
    extraInventoryByRoomId: {},
    hourlyHours: 2,
    discountPercent: 0,
    breakfastIncluded: true,
    manualTotalAmount: 0,
    manualSaleOpen: false,
    manualSaleAmount: 0,
    manualSaleComment: "",
    manualSalePaymentMethod: "",
    manualSalePeriod: "day",
    prepaymentAlreadyPaid: false,
    agreementSent: false,
    lastReservation: null,
    ...(existingDraft ?? {}),
    guestFirstName: existingDraft?.guestFirstName || patch.guestFirstName,
    manualStatus: patch.manualStatus,
    manualStatusAt: patch.manualStatusAt,
    phone: existingDraft?.phone || patch.phone,
    updatedAt: patch.manualStatusAt,
    waChatId: patch.waChatId || existingDraft?.waChatId
  };
}

function inferStatusFromVisibleChatRowText(rowText: string): ChatStatusItem | null {
  if (!rowText) return null;
  if (/(^|\s)номер\s+\d{3}\s*[\/|]/i.test(rowText)) {
    return { label: "Номер отправлен", tone: "info", updatedAt: "" };
  }
  if (/бронирование\s+на\s+согласован/i.test(rowText)) {
    return { label: "На согласовании", tone: "pending", updatedAt: "" };
  }
  return null;
}

function getStatusByPhoneTail(phone: string) {
  const phoneTail = phone.slice(-10);
  if (phoneTail.length < 10) return null;
  const matches = chatStatusIndex.items.filter((item) => item.phone.slice(-10) === phoneTail);
  return getOnlyMatchingStatus(matches);
}

function getStatusByExactTitle(title: string) {
  const titleKey = normalizeTitle(title);
  if (!titleKey) return null;
  const matches = chatStatusIndex.items.filter((item) => normalizeTitle(item.title) === titleKey);
  if (!matches.length) return null;
  const phones = new Set(matches.map((item) => item.phone).filter(Boolean));
  if (phones.size > 1) return null;
  return getLatestMatchingStatus(matches);
}

function getOnlyMatchingStatus(matches: Array<{ status: ChatStatusItem }>) {
  const labels = new Set(matches.map((item) => item.status.label));
  if (matches.length && labels.size === 1) {
    return getLatestMatchingStatus(matches);
  }
  return null;
}

function getLatestMatchingStatus(matches: Array<{ status: ChatStatusItem }>) {
  return matches.sort((left, right) => String(getStatusUpdatedAt(right.status)).localeCompare(String(getStatusUpdatedAt(left.status))))[0]?.status ?? null;
}

function updateChatStatusDebug(rows: number, applied: number) {
  chatStatusDebug = {
    applied,
    rows,
    serverDrafts: chatStatusDebug.serverDrafts,
    serverReservations: chatStatusDebug.serverReservations,
    statuses: chatStatusIndex.items.length,
    updatedAt: new Date().toISOString()
  };
  try {
    Object.assign(window, { __gpbChatStatusDebug: chatStatusDebug });
  } catch {
    return;
  }
}

function updateChatStatusSourceDebug(serverDrafts: number, serverReservations: number) {
  chatStatusDebug = {
    ...chatStatusDebug,
    serverDrafts,
    serverReservations
  };
}

function getChatRowTitle(row: HTMLElement) {
  const candidates = Array.from(row.querySelectorAll<HTMLElement>("[title], span[dir='auto']"))
    .map((element) => element.getAttribute("title") || element.textContent || "")
    .map(normalizeText)
    .filter((value) => value && !extractPhoneFromText(value) && !isNonChatRowText(value));
  return candidates[0] ?? "";
}

function getDraftStatusItem(draft: ChatBookingDraft): ChatStatusItem | null {
  const manualStatus = getManualChatStatusItem(draft.manualStatus, draft.manualStatusAt || draft.updatedAt);
  if (manualStatus && draft.manualStatusAt) return manualStatus;
  if (draft.agreementEverSent || draft.agreementSent) return { label: "На согласовании", tone: "pending", updatedAt: draft.updatedAt };
  if (draft.catalogStatus === "room-sent") return { label: "Номер отправлен", tone: "info", updatedAt: draft.catalogStatusAt || draft.updatedAt };
  if (draft.catalogStatus === "price-sent") return { label: "Прайс отправлен", tone: "info", updatedAt: draft.catalogStatusAt || draft.updatedAt };
  if (draft.chatStartedAt) return { label: "Чат начат", tone: "info", updatedAt: draft.chatStartedAt };
  return manualStatus;
}

function getManualChatStatusItem(status: ChatBookingDraft["manualStatus"], updatedAt = ""): ChatStatusItem | null {
  switch (status) {
    case "none":
      return { label: "Без статуса", manualStatus: status, tone: "muted", updatedAt };
    case "chat-started":
      return { label: "Чат начат", manualStatus: status, tone: "info", updatedAt };
    case "room-sent":
      return { label: "Номер отправлен", manualStatus: status, tone: "info", updatedAt };
    case "price-sent":
      return { label: "Прайс отправлен", manualStatus: status, tone: "info", updatedAt };
    case "agreement":
      return { label: "На согласовании", manualStatus: status, tone: "pending", updatedAt };
    case "prepayment":
      return { label: "Предоплата получена", manualStatus: status, tone: "success", updatedAt };
    case "booked":
      return { label: "Забронировано", manualStatus: status, tone: "success", updatedAt };
    case "checked-in":
      return { label: "Въехал", manualStatus: status, tone: "success", updatedAt };
    case "checked-out":
      return { label: "Выехал", manualStatus: status, tone: "muted", updatedAt };
    case "cancelled":
      return { label: "Снято с брони", manualStatus: status, tone: "danger", updatedAt };
    default:
      return null;
  }
}

function getReservationStatusItem(reservation: Reservation): ChatStatusItem {
  const updatedAt = getReservationStatusUpdatedAt(reservation);
  if (reservation.noShowAt) return { label: "Незаезд", tone: "danger", updatedAt: reservation.noShowAt };
  if (reservation.status === "cancelled") return { label: "Снято с брони", tone: "danger", updatedAt };
  if (isReservationCheckedOut(reservation)) return { label: "Выехал", tone: "muted", updatedAt: reservation.checkedOutAt || getReservationScheduledCheckOutIso(reservation) || updatedAt };
  if (reservation.extendedAt) return { label: "Продлен", tone: "extended", updatedAt: reservation.extendedAt };
  if (reservation.checkedInAt) return { label: "Въехал", tone: "success", updatedAt: reservation.checkedInAt };
  if (reservation.status === "booked") return { label: "Забронировано", tone: "success", updatedAt };
  if (reservation.prepaymentReceivedAt) return { label: "Предоплата получена", tone: "success", updatedAt: reservation.prepaymentReceivedAt };
  return { label: "На согласовании", tone: "pending", updatedAt };
}

function getReservationStatusUpdatedAt(reservation: Reservation) {
  return reservation.checkedOutAt ||
    reservation.checkedInAt ||
    reservation.extendedAt ||
    reservation.balancePaidAt ||
    reservation.prepaymentReceivedAt ||
    reservation.updatedAt ||
    reservation.createdAt ||
    "";
}

function createEmptyChatStatusIndex(): ChatStatusIndex {
  return {
    ambiguousTitles: new Set(),
    byChatId: new Map(),
    byWaChatId: new Map(),
    byPhone: new Map(),
    byTitle: new Map(),
    items: []
  };
}

function setLatestStatus(map: Map<string, ChatStatusItem>, key: string, status: ChatStatusItem) {
  if (!key) return;
  const current = map.get(key);
  if (
    !current ||
    getStatusPriority(status) > getStatusPriority(current) ||
    (getStatusPriority(status) === getStatusPriority(current) &&
      String(getStatusUpdatedAt(status)).localeCompare(String(getStatusUpdatedAt(current))) >= 0)
  ) {
    map.set(key, status);
  }
}

function getStatusUpdatedAt(status: ChatStatusItem | null | undefined) {
  return typeof status?.updatedAt === "string" ? status.updatedAt : "";
}

function setLatestTitleStatus(index: ChatStatusIndex, title: string, status: ChatStatusItem) {
  const titleKey = normalizeTitle(title);
  if (!titleKey) return;
  const current = index.byTitle.get(titleKey);
  if (current && current.label !== status.label && getStatusPriority(current) === getStatusPriority(status)) {
    index.ambiguousTitles.add(titleKey);
    return;
  }
  setLatestStatus(index.byTitle, titleKey, status);
}

function getStatusPriority(status: ChatStatusItem | null | undefined) {
  if (status?.manualStatus) return 100;
  switch (status?.label) {
    case "Незаезд":
    case "Снято с брони":
    case "Выехал":
      return 60;
    case "Предоплата получена":
    case "Забронировано":
    case "Въехал":
    case "Продлен":
      return 50;
    case "На согласовании":
      return 40;
    case "Номер отправлен":
    case "Прайс отправлен":
      return 30;
    case "Чат начат":
      return 20;
    default:
      return 0;
  }
}

function addStatusIndexItem(index: ChatStatusIndex, item: { phone: string; status: ChatStatusItem; title: string }) {
  if (!item.phone && !item.title) return;
  index.items.push(item);
}

function extractDraftTitleFromChatId(chatId: string) {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId.startsWith("title:")) return "";
  return normalizedChatId.slice("title:".length).replace(/-/g, " ");
}

function extractWaChatIdFromChatId(chatId: string) {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId.startsWith("wa:")) return "";
  return normalizeWhatsAppChatId(normalizedChatId.slice("wa:".length));
}

function isGenericGuestTitle(title: string) {
  return /^гость\s+\d{4}$/i.test(normalizeText(title));
}

function isReservationCheckedOut(reservation: Pick<Reservation, "checkedInAt" | "checkedOutAt" | "checkOut" | "checkOutTime">) {
  if (reservation.checkedOutAt) return true;
  if (!reservation.checkedInAt || !reservation.checkOut) return false;
  const scheduledCheckOut = getReservationScheduledCheckOutDate(reservation);
  return Boolean(scheduledCheckOut && Date.now() >= scheduledCheckOut.getTime());
}

function getReservationScheduledCheckOutIso(reservation: Pick<Reservation, "checkOut" | "checkOutTime">) {
  const checkOutDate = getReservationScheduledCheckOutDate(reservation);
  return checkOutDate ? checkOutDate.toISOString() : "";
}

function getReservationScheduledCheckOutDate(reservation: Pick<Reservation, "checkOut" | "checkOutTime">) {
  if (!reservation.checkOut) return null;
  const [hours, minutes] = (reservation.checkOutTime || "12:00").split(":").map((part) => Number(part));
  const [year, month, day] = reservation.checkOut.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const checkOutDate = new Date(year, month - 1, day);
  checkOutDate.setHours(Number.isFinite(hours) ? hours : 12, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return checkOutDate;
}

function normalizeChatDrafts(value: unknown): Record<string, ChatBookingDraft> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, ChatBookingDraft> : {};
}

function normalizeReservations(value: unknown): Reservation[] {
  return Array.isArray(value) ? value.filter((item): item is Reservation => Boolean(item && typeof item === "object")) : [];
}

function createChatId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160);
}

function normalizeTitle(value: string | undefined) {
  return normalizeText(value ?? "").toLowerCase();
}

function normalizePhone(value: string | undefined) {
  return extractPhoneFromText(value ?? "");
}

function getGuestNameFallbackFromPhone(phone: string) {
  const digits = normalizePhone(phone);
  return digits ? `Гость ${digits.slice(-4)}` : "";
}

function extractPhoneFromText(value: string) {
  const match = value.match(/(?:\+|00)?\d[\d\s().-]{6,}\d/);
  return match ? match[0].replace(/\D/g, "") : "";
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getElementText(element: HTMLElement) {
  return [
    element.innerText || "",
    element.getAttribute("title") || "",
    element.getAttribute("aria-label") || "",
    element.getAttribute("data-id") || "",
    element.getAttribute("data-chat-id") || "",
    ...Array.from(element.querySelectorAll<HTMLElement>("[title], [aria-label], [data-id]")).map((item) =>
      [
        item.getAttribute("title"),
        item.getAttribute("aria-label"),
        item.getAttribute("data-id"),
        item.getAttribute("data-chat-id")
      ].filter(Boolean).join(" ")
    )
  ].join(" ");
}

function extractWhatsAppChatIdFromElement(root?: HTMLElement | null) {
  if (!root) return "";
  const values = [
    root.getAttribute("data-id"),
    root.getAttribute("data-chat-id"),
    root.getAttribute("href"),
    root.getAttribute("aria-label"),
    ...Array.from(root.querySelectorAll<HTMLElement>("[data-id], [data-chat-id], [href], [aria-label]")).flatMap((item) => [
      item.getAttribute("data-id"),
      item.getAttribute("data-chat-id"),
      item.getAttribute("href"),
      item.getAttribute("aria-label")
    ])
  ].filter((value): value is string => Boolean(value));

  for (const value of values) {
    const chatId = extractWhatsAppChatIdFromText(value);
    if (chatId) return chatId;
  }
  return "";
}

function extractWhatsAppChatIdFromText(value: string) {
  const match = value.match(/(?:phone:)?(\d{8,15}@(c\.us|s\.whatsapp\.net))/i) ||
    value.match(/(?:chat|conversation)[^0-9]*(\d{8,15})/i);
  return normalizeWhatsAppChatId(match?.[1] || "");
}

function normalizeWhatsAppChatId(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return "";
  const withDomain = text.match(/(\d{8,15}@(c\.us|s\.whatsapp\.net))/i)?.[1];
  if (withDomain) return withDomain.toLowerCase();
  const digits = text.match(/\d{8,15}/)?.[0] ?? "";
  return digits ? `${digits}@c.us` : "";
}

function isNonChatRowText(value: string) {
  return /^(все|непрочитанное|избранное|группы)$/i.test(value) ||
    /новая\s+группа|новый\s+контакт|new\s+group|new\s+contact|поиск|search|чаты,\s*контакты\s*и\s*сообщения\s*не\s*найдены|not\s*found/i.test(value);
}

function waitForWhatsApp() {
  if (document.querySelector("#app")) {
    mountPanel();
    startWhatsAppChatStatusOverlay();
    return;
  }

  const observer = new MutationObserver(() => {
    const app = document.querySelector("#app");
    if (app) {
      observer.disconnect();
      mountPanel();
      startWhatsAppChatStatusOverlay();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

waitForWhatsApp();
