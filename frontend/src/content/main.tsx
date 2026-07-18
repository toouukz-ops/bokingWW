import { createRoot } from "react-dom/client";
import { BookingPanel } from "../panel/BookingPanel";
import type { ChatBookingDraft, Reservation } from "../shared/types";

const ROOT_ID = "gpb-booking-extension-root";
const LOCAL_CHAT_DRAFTS_STORAGE_KEY = "gpb-chat-booking-drafts";
const LOCAL_RESERVATIONS_STORAGE_KEY = "gpb-booking-reservations";

type ChatStatusTone = "info" | "pending" | "success" | "extended" | "muted" | "danger";
type ChatStatusItem = {
  label: string;
  tone: ChatStatusTone;
  updatedAt: string;
};
type ChatStatusIndex = {
  byPhone: Map<string, ChatStatusItem>;
  byTitle: Map<string, ChatStatusItem>;
  byChatId: Map<string, ChatStatusItem>;
  ambiguousTitles: Set<string>;
  items: Array<{ phone: string; status: ChatStatusItem; title: string }>;
};

let chatStatusIndex: ChatStatusIndex = createEmptyChatStatusIndex();
let chatStatusRefreshTimer: number | null = null;
let chatStatusOverlayStarted = false;
let chatStatusPollTimer: number | null = null;
let chatStatusDebug = {
  applied: 0,
  rows: 0,
  statuses: 0,
  updatedAt: ""
};

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

  void refreshChatStatusIndex();

  const observer = new MutationObserver((mutations) => {
    if (mutations.length && mutations.every(isOwnChatStatusMutation)) return;
    scheduleApplyChatStatuses();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("scroll", scheduleApplyChatStatuses, true);
  window.addEventListener("resize", scheduleApplyChatStatuses);
  chatStatusPollTimer = window.setInterval(() => {
    void refreshChatStatusIndex();
  }, 2500);
  scheduleApplyChatStatuses();

  try {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (!changes[LOCAL_CHAT_DRAFTS_STORAGE_KEY] && !changes[LOCAL_RESERVATIONS_STORAGE_KEY]) return;
      void refreshChatStatusIndex();
    });
  } catch {
    if (chatStatusPollTimer) window.clearInterval(chatStatusPollTimer);
    chatStatusPollTimer = null;
    chatStatusOverlayStarted = false;
    observer.disconnect();
  }
}

function scheduleApplyChatStatuses() {
  if (chatStatusRefreshTimer) return;
  chatStatusRefreshTimer = window.setTimeout(() => {
    chatStatusRefreshTimer = null;
    applyChatStatusesToWhatsAppList();
  }, 180);
}

async function refreshChatStatusIndex() {
  try {
    chatStatusIndex = await buildChatStatusIndex();
  } catch {
    chatStatusIndex = createEmptyChatStatusIndex();
  }
  scheduleApplyChatStatuses();
}

function buildChatStatusIndex(): Promise<ChatStatusIndex> {
  return new Promise((resolve) => {
    try {
      if (!canUseChromeStorage()) {
        resolve(createEmptyChatStatusIndex());
        return;
      }
      chrome.storage.local.get([LOCAL_CHAT_DRAFTS_STORAGE_KEY, LOCAL_RESERVATIONS_STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          resolve(createEmptyChatStatusIndex());
          return;
        }

        const drafts = normalizeChatDrafts(result[LOCAL_CHAT_DRAFTS_STORAGE_KEY]);
        const reservations = normalizeReservations(result[LOCAL_RESERVATIONS_STORAGE_KEY]);
        const index = createEmptyChatStatusIndex();

        Object.entries(drafts).forEach(([chatId, draft]) => {
          const status = getDraftStatusItem(draft);
          if (!status) return;
          setLatestStatus(index.byChatId, chatId, status);
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
          setForcedStatus(index.byPhone, phone, status);
          if (reservation.phone) setForcedStatus(index.byChatId, createChatId(`phone:${reservation.phone}`), status);
          setLatestTitleStatus(index, reservation.guestFirstName, status);
          addStatusIndexItem(index, { phone, status, title: reservation.guestFirstName });
        });

        resolve(index);
      });
    } catch {
      resolve(createEmptyChatStatusIndex());
    }
  });
}

function applyChatStatusesToWhatsAppList() {
  const sidebar = getWhatsAppSidebar();
  if (!sidebar) return;

  const rows = getWhatsAppChatRows(sidebar);
  let applied = 0;
  const visibleRows = new Set(rows);
  sidebar.querySelectorAll<HTMLElement>(".gpb-wa-chat-status-row").forEach((row) => {
    if (!visibleRows.has(row)) clearChatStatusRow(row);
  });

  rows.forEach((row) => {
    const status = getStatusForChatRow(row);
    if (!status) {
      if (row.classList.contains("gpb-wa-chat-status-row")) clearChatStatusRow(row);
      return;
    }
    applyChatStatusToRow(row, status);
    applied += 1;
  });
  updateChatStatusDebug(rows.length, applied);
}

function getWhatsAppSidebar() {
  return document.querySelector<HTMLElement>("#pane-side") ??
    document.querySelector<HTMLElement>("#side");
}

function applyChatStatusToRow(row: HTMLElement, status: ChatStatusItem) {
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
    if (titleKey && !chatStatusIndex.ambiguousTitles.has(titleKey) && !isGenericGuestTitle(title)) {
      const byTitle = chatStatusIndex.byTitle.get(titleKey);
      if (byTitle) return byTitle;
    }
    const byExactTitle = getStatusByExactTitle(title);
    if (byExactTitle) return byExactTitle;
  }

  return getStatusByVisibleText(rowText);
}

function getStatusByPhoneTail(phone: string) {
  const phoneTail = phone.slice(-10);
  if (phoneTail.length < 10) return null;
  const matches = chatStatusIndex.items.filter((item) => item.phone.slice(-10) === phoneTail);
  return getOnlyMatchingStatus(matches);
}

function getStatusByVisibleText(rowText: string) {
  if (!rowText) return null;
  const matches = chatStatusIndex.items.filter((item) => {
    const title = normalizeTitle(item.title);
    if (!title || title.length < 5) return false;
    if (chatStatusIndex.ambiguousTitles.has(title)) return false;
    return rowText.includes(title) || title.includes(rowText);
  });
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
    statuses: chatStatusIndex.items.length,
    updatedAt: new Date().toISOString()
  };
  try {
    Object.assign(window, { __gpbChatStatusDebug: chatStatusDebug });
  } catch {
    return;
  }
}

function getChatRowTitle(row: HTMLElement) {
  const candidates = Array.from(row.querySelectorAll<HTMLElement>("[title], span[dir='auto']"))
    .map((element) => element.getAttribute("title") || element.textContent || "")
    .map(normalizeText)
    .filter((value) => value && !extractPhoneFromText(value) && !isNonChatRowText(value));
  return candidates[0] ?? "";
}

function getDraftStatusItem(draft: ChatBookingDraft): ChatStatusItem | null {
  if (draft.lastReservation) return getReservationStatusItem(draft.lastReservation);
  if (draft.agreementEverSent || draft.agreementSent) return { label: "На согласовании", tone: "pending", updatedAt: draft.updatedAt };
  if (draft.catalogStatus === "room-sent") return { label: "Номер отправлен", tone: "info", updatedAt: draft.catalogStatusAt || draft.updatedAt };
  if (draft.catalogStatus === "price-sent") return { label: "Прайс отправлен", tone: "info", updatedAt: draft.catalogStatusAt || draft.updatedAt };
  if (draft.chatStartedAt) return { label: "Чат начат", tone: "info", updatedAt: draft.chatStartedAt };
  return null;
}

function getReservationStatusItem(reservation: Reservation): ChatStatusItem {
  const updatedAt = reservation.checkedOutAt || reservation.checkedInAt || reservation.balancePaidAt || reservation.prepaymentReceivedAt || reservation.createdAt;
  if (reservation.noShowAt) return { label: "Незаезд", tone: "danger", updatedAt: reservation.noShowAt };
  if (reservation.status === "cancelled") return { label: "Снято с брони", tone: "danger", updatedAt };
  if (isReservationCheckedOut(reservation)) return { label: "Выехал", tone: "muted", updatedAt: reservation.checkedOutAt || getReservationScheduledCheckOutIso(reservation) || updatedAt };
  if (reservation.extendedAt) return { label: "Продлен", tone: "extended", updatedAt: reservation.extendedAt };
  if (reservation.checkedInAt) return { label: "Въехал", tone: "success", updatedAt: reservation.checkedInAt };
  if (reservation.prepaymentReceivedAt) return { label: "Предоплата получена", tone: "success", updatedAt: reservation.prepaymentReceivedAt };
  if (reservation.status === "booked") return { label: "Забронировано", tone: "success", updatedAt };
  return { label: "На согласовании", tone: "pending", updatedAt };
}

function createEmptyChatStatusIndex(): ChatStatusIndex {
  return {
    ambiguousTitles: new Set(),
    byChatId: new Map(),
    byPhone: new Map(),
    byTitle: new Map(),
    items: []
  };
}

function setLatestStatus(map: Map<string, ChatStatusItem>, key: string, status: ChatStatusItem) {
  if (!key) return;
  const current = map.get(key);
  if (!current || String(getStatusUpdatedAt(status)).localeCompare(String(getStatusUpdatedAt(current))) >= 0) {
    map.set(key, status);
  }
}

function getStatusUpdatedAt(status: ChatStatusItem | null | undefined) {
  return typeof status?.updatedAt === "string" ? status.updatedAt : "";
}

function setForcedStatus(map: Map<string, ChatStatusItem>, key: string, status: ChatStatusItem) {
  if (!key) return;
  map.set(key, status);
}

function setLatestTitleStatus(index: ChatStatusIndex, title: string, status: ChatStatusItem) {
  const titleKey = normalizeTitle(title);
  if (!titleKey) return;
  const current = index.byTitle.get(titleKey);
  if (current && current.label !== status.label) {
    index.ambiguousTitles.add(titleKey);
    return;
  }
  setLatestStatus(index.byTitle, titleKey, status);
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
    ...Array.from(element.querySelectorAll<HTMLElement>("[title], [aria-label], [data-id]")).map((item) =>
      [
        item.getAttribute("title"),
        item.getAttribute("aria-label"),
        item.getAttribute("data-id")
      ].filter(Boolean).join(" ")
    )
  ].join(" ");
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
