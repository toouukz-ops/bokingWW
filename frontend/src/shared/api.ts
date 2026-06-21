import type { BookingDraft, ChatBookingDraft, ExpenseCategory, ExpenseEntry, GuestContact, MenuItem, PaymentSettings, Reservation, Room } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8765";
const LOCAL_ROOMS_STORAGE_KEY = "gpb-booking-rooms";
const LOCAL_RESERVATIONS_STORAGE_KEY = "gpb-booking-reservations";
const LOCAL_PAYMENT_SETTINGS_STORAGE_KEY = "gpb-payment-settings";
const LOCAL_CHAT_DRAFTS_STORAGE_KEY = "gpb-chat-booking-drafts";
const LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY = "gpb-expense-categories";
const LOCAL_EXPENSE_ENTRIES_STORAGE_KEY = "gpb-expense-entries";
const LOCAL_BACKUP_KEYS = [
  LOCAL_ROOMS_STORAGE_KEY,
  LOCAL_RESERVATIONS_STORAGE_KEY,
  LOCAL_PAYMENT_SETTINGS_STORAGE_KEY,
  LOCAL_CHAT_DRAFTS_STORAGE_KEY,
  LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY,
  LOCAL_EXPENSE_ENTRIES_STORAGE_KEY
] as const;

export type BackupExportOptions = {
  chatDrafts: boolean;
  expenses: boolean;
  guestContacts: boolean;
  localRoomsCache: boolean;
  media: boolean;
  paymentSettings: boolean;
  reservations: boolean;
  rooms: boolean;
};

export async function getHealth(): Promise<{ ok: boolean; service: string }> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`Backend health failed: ${response.status}`);
  }
  return response.json();
}

export async function createDraftFromMessage(message: string): Promise<BookingDraft> {
  const response = await fetch(`${API_BASE_URL}/api/booking/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });

  if (!response.ok) {
    throw new Error(`Draft request failed: ${response.status}`);
  }

  return response.json();
}

export async function getGuestContacts(): Promise<GuestContact[]> {
  const response = await fetch(`${API_BASE_URL}/api/guest-contacts`);
  if (!response.ok) {
    throw new Error(`Guest contacts request failed: ${response.status}`);
  }

  return response.json();
}

export async function saveGuestContact(contact: GuestContact): Promise<GuestContact> {
  const response = await fetch(`${API_BASE_URL}/api/guest-contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact)
  });

  if (!response.ok) {
    throw new Error(`Guest contact save failed: ${response.status}`);
  }

  return response.json();
}

export async function deleteGuestContact(phone: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/guest-contacts/${encodeURIComponent(phone)}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(`Guest contact delete failed: ${response.status}`);
  }
}

export async function sendDebugLog(event: string, details: Record<string, unknown> = {}): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/debug/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        details,
        timestamp: new Date().toISOString()
      })
    });
  } catch {
    return;
  }
}

export async function exportServerBackupData(options?: Partial<BackupExportOptions>): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({
    guestContacts: options?.guestContacts === false ? "0" : "1",
    media: options?.media === false ? "0" : "1",
    rooms: options?.rooms === false ? "0" : "1"
  });
  const response = await fetch(`${API_BASE_URL}/api/backup/server?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Server backup export failed: ${response.status}`);
  }

  return response.json();
}

export async function importServerBackupData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE_URL}/api/backup/server/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    throw new Error(`Server backup import failed: ${response.status}`);
  }

  return response.json();
}

export function exportLocalBackupData(options?: Partial<BackupExportOptions>): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get([...LOCAL_BACKUP_KEYS], (result) => {
      resolve({
        chatDrafts: options?.chatDrafts === false ? {} : result[LOCAL_CHAT_DRAFTS_STORAGE_KEY] ?? {},
        expenseCategories: options?.expenses === false ? [] : result[LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY] ?? [],
        expenseEntries: options?.expenses === false ? [] : result[LOCAL_EXPENSE_ENTRIES_STORAGE_KEY] ?? [],
        paymentSettings: options?.paymentSettings === false ? null : result[LOCAL_PAYMENT_SETTINGS_STORAGE_KEY] ?? null,
        reservations: options?.reservations === false ? [] : result[LOCAL_RESERVATIONS_STORAGE_KEY] ?? [],
        roomsCache: options?.localRoomsCache === false ? [] : result[LOCAL_ROOMS_STORAGE_KEY] ?? []
      });
    });
  });
}

export async function importLocalBackupData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const current = await exportLocalBackupData();
  const next = {
    [LOCAL_CHAT_DRAFTS_STORAGE_KEY]: mergeRecords(current.chatDrafts, data.chatDrafts),
    [LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY]: mergeById(current.expenseCategories, data.expenseCategories),
    [LOCAL_EXPENSE_ENTRIES_STORAGE_KEY]: mergeById(current.expenseEntries, data.expenseEntries),
    [LOCAL_PAYMENT_SETTINGS_STORAGE_KEY]: mergeSettings(current.paymentSettings, data.paymentSettings),
    [LOCAL_RESERVATIONS_STORAGE_KEY]: mergeById(current.reservations, data.reservations),
    [LOCAL_ROOMS_STORAGE_KEY]: mergeById(current.roomsCache, data.roomsCache)
  };
  await new Promise<void>((resolve) => chrome.storage.local.set(next, () => resolve()));

  return {
    chatDrafts: getMergeReport(current.chatDrafts, data.chatDrafts, "record"),
    expenseCategories: getMergeReport(current.expenseCategories, data.expenseCategories, "array"),
    expenseEntries: getMergeReport(current.expenseEntries, data.expenseEntries, "array"),
    reservations: getMergeReport(current.reservations, data.reservations, "array"),
    roomsCache: getMergeReport(current.roomsCache, data.roomsCache, "array")
  };
}

export async function getRooms(): Promise<Room[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/rooms`);
    if (!response.ok) {
      throw new Error(`Rooms request failed: ${response.status}`);
    }
    const rooms = (await response.json()) as Room[];
    await saveLocalRooms(rooms);
    return rooms;
  } catch {
    return getLocalRooms();
  }
}

export async function saveRoom(room: Room): Promise<Room> {
  const localRooms = await getLocalRooms();
  await saveLocalRooms(localRooms.filter((item) => item.id !== room.id).concat(room));

  try {
    const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(room.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(room)
    });

    if (!response.ok) {
      throw new Error(`Room save failed: ${response.status}`);
    }

    return response.json();
  } catch {
    return room;
  }
}

export async function deleteRoom(roomId: string): Promise<void> {
  const localRooms = await getLocalRooms();
  await saveLocalRooms(localRooms.filter((item) => item.id !== roomId));

  try {
    const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(roomId)}`, {
      method: "DELETE"
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Room delete failed: ${response.status}`);
    }
  } catch {
    return;
  }
}

export function getMediaUrl(path: string) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

export async function uploadRoomMedia(room: Room, file: File): Promise<Room> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(room.id)}/media`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Media upload failed: ${response.status}`);
  }

  const updatedRoom = (await response.json()) as Room;
  await replaceLocalRoom(updatedRoom);
  return updatedRoom;
}

export async function deleteRoomMedia(room: Room, path: string): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(room.id)}/media`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  });

  if (!response.ok) {
    throw new Error(`Media delete failed: ${response.status}`);
  }

  const updatedRoom = (await response.json()) as Room;
  await replaceLocalRoom(updatedRoom);
  return updatedRoom;
}

export async function uploadObjectGalleryMedia(file: File): Promise<{ mediaType: "photo" | "video"; path: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/object-gallery/media`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Object gallery upload failed: ${response.status}`);
  }

  return response.json() as Promise<{ mediaType: "photo" | "video"; path: string }>;
}

export async function deleteObjectGalleryMedia(path: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/object-gallery/media`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  });

  if (!response.ok) {
    throw new Error(`Object gallery delete failed: ${response.status}`);
  }
}

export async function ensureWhatsappVideoMedia(path: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/media/whatsapp-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  });

  if (!response.ok) {
    throw new Error(`Video conversion failed: ${response.status}`);
  }

  const data = (await response.json()) as { path?: string };
  return data.path || path;
}

export async function cropRoomMedia(
  room: Room,
  path: string,
  options: { aspectRatio: number; focalX: number; focalY: number }
): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(room.id)}/media/crop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, ...options })
  });

  if (!response.ok) {
    throw new Error(`Media crop failed: ${response.status}`);
  }

  const updatedRoom = (await response.json()) as Room;
  await replaceLocalRoom(updatedRoom);
  return updatedRoom;
}

export function getReservations(): Promise<Reservation[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_RESERVATIONS_STORAGE_KEY], (result) => {
      const reservations = result[LOCAL_RESERVATIONS_STORAGE_KEY];
      resolve(Array.isArray(reservations) ? reservations : []);
    });
  });
}

export async function saveReservation(reservation: Reservation): Promise<Reservation> {
  const reservations = await getReservations();
  await saveReservations(reservations.filter((item) => item.id !== reservation.id).concat(reservation));
  return reservation;
}

export async function deleteReservation(reservationId: string): Promise<void> {
  const reservations = await getReservations();
  await saveReservations(reservations.filter((item) => item.id !== reservationId));
}

export async function clearBookingStatistics(): Promise<void> {
  await saveReservations([]);
  await saveChatBookingDrafts({});
}

export function getPaymentSettings(): Promise<PaymentSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_PAYMENT_SETTINGS_STORAGE_KEY], (result) => {
      const settings = result[LOCAL_PAYMENT_SETTINGS_STORAGE_KEY];
      const paymentMethods = settings?.paymentMethods && typeof settings.paymentMethods === "object" && !Array.isArray(settings.paymentMethods)
        ? settings.paymentMethods
        : {};
      const linkMethods = settings?.linkMethods && typeof settings.linkMethods === "object" && !Array.isArray(settings.linkMethods)
        ? settings.linkMethods
        : {};
      const companyRequisites = settings?.companyRequisites && typeof settings.companyRequisites === "object" && !Array.isArray(settings.companyRequisites)
        ? settings.companyRequisites
        : {};
      const inventoryCustomFields = settings?.inventoryCustomFields && typeof settings.inventoryCustomFields === "object" && !Array.isArray(settings.inventoryCustomFields)
        ? settings.inventoryCustomFields
        : {};
      const packageCustomFields = settings?.packageCustomFields && typeof settings.packageCustomFields === "object" && !Array.isArray(settings.packageCustomFields)
        ? settings.packageCustomFields
        : {};
      const quickPhrases = Array.isArray(settings?.quickPhrases)
        ? settings.quickPhrases.filter((phrase: unknown): phrase is string => typeof phrase === "string" && phrase.trim().length > 0)
        : ["Здравствуйте!", "Вам на какое число?", "На сколько ночей?", "Сколько человек?", "Одну минуту..."];
      const customAmenityOptions = Array.isArray(settings?.customAmenityOptions)
        ? settings.customAmenityOptions.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const customFoodOptions = Array.isArray(settings?.customFoodOptions)
        ? settings.customFoodOptions.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const customSleepingPlaceOptions = Array.isArray(settings?.customSleepingPlaceOptions)
        ? settings.customSleepingPlaceOptions.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      const customHolidayDates = Array.isArray(settings?.customHolidayDates)
        ? settings.customHolidayDates.filter((date: unknown): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort()
        : [];
      const objectGalleryPhotoPaths = Array.isArray(settings?.objectGalleryPhotoPaths)
        ? settings.objectGalleryPhotoPaths.filter((path: unknown): path is string => typeof path === "string" && path.trim().length > 0)
        : [];
      const objectGalleryVideoPaths = Array.isArray(settings?.objectGalleryVideoPaths)
        ? settings.objectGalleryVideoPaths.filter((path: unknown): path is string => typeof path === "string" && path.trim().length > 0)
        : [];
      const menuItems = Array.isArray(settings?.menuItems)
        ? settings.menuItems.map(normalizeMenuItem).filter((item): item is MenuItem => Boolean(item))
        : [];
      const pricePdfRoomIds = Array.isArray(settings?.pricePdfRoomIds)
        ? settings.pricePdfRoomIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const pricePdfSummaryOptions = Array.isArray(settings?.pricePdfSummaryOptions)
        ? settings.pricePdfSummaryOptions.filter((key: unknown): key is string => typeof key === "string" && key.trim().length > 0)
        : [];
      const pricePdfLinkIds = Array.isArray(settings?.pricePdfLinkIds)
        ? settings.pricePdfLinkIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      resolve({
        paymentLink: typeof settings?.paymentLink === "string" ? settings.paymentLink : "",
        paymentMethods,
        linkMethods,
        companyRequisites,
        objectGalleryPhotoPaths,
        objectGalleryVideoPaths,
        menuItems,
        pricePdfRoomIds,
        pricePdfSummaryOptions,
        pricePdfLinkIds,
        pricePdfIncludeGallery: typeof settings?.pricePdfIncludeGallery === "boolean" ? settings.pricePdfIncludeGallery : false,
        pricePdfGroupPeriodTotals: typeof settings?.pricePdfGroupPeriodTotals === "boolean" ? settings.pricePdfGroupPeriodTotals : true,
        quickPhrases,
        customAmenityOptions,
        customFoodOptions,
        customSleepingPlaceOptions,
        defaultCheckInTime: typeof settings?.defaultCheckInTime === "string" ? settings.defaultCheckInTime : "15:00",
        defaultCheckOutTime: typeof settings?.defaultCheckOutTime === "string" ? settings.defaultCheckOutTime : "12:00",
        weatherLocationName: typeof settings?.weatherLocationName === "string" ? settings.weatherLocationName : "Алматы",
        weatherLatitude: typeof settings?.weatherLatitude === "number" ? settings.weatherLatitude : 43.2389,
        weatherLongitude: typeof settings?.weatherLongitude === "number" ? settings.weatherLongitude : 76.8897,
        customHolidayDates,
        inventoryAirBeds: typeof settings?.inventoryAirBeds === "number" ? settings.inventoryAirBeds : 0,
        inventoryRollaways: typeof settings?.inventoryRollaways === "number" ? settings.inventoryRollaways : 3,
        inventoryCustomFields,
        packageDiscountPercent: typeof settings?.packageDiscountPercent === "number" ? settings.packageDiscountPercent : 0,
        packagePeriodDiscountPercent: typeof settings?.packagePeriodDiscountPercent === "number" ? settings.packagePeriodDiscountPercent : 0,
        packagePeriodDiscountFrom: typeof settings?.packagePeriodDiscountFrom === "string" ? settings.packagePeriodDiscountFrom : "",
        packagePeriodDiscountTo: typeof settings?.packagePeriodDiscountTo === "string" ? settings.packagePeriodDiscountTo : "",
        dynamicPricingEnabled: typeof settings?.dynamicPricingEnabled === "boolean" ? settings.dynamicPricingEnabled : false,
        dynamicPricingMarginPercent: typeof settings?.dynamicPricingMarginPercent === "number" ? settings.dynamicPricingMarginPercent : 0,
        dynamicPricingSeasonEnd: typeof settings?.dynamicPricingSeasonEnd === "string" ? settings.dynamicPricingSeasonEnd : "",
        breakfastPricePerPerson: typeof settings?.breakfastPricePerPerson === "number" ? settings.breakfastPricePerPerson : 0,
        packageGiftText: typeof settings?.packageGiftText === "string" ? settings.packageGiftText : "",
        packageMinRooms: typeof settings?.packageMinRooms === "number" ? settings.packageMinRooms : 0,
        packageIncludeAmenities: typeof settings?.packageIncludeAmenities === "boolean" ? settings.packageIncludeAmenities : true,
        packageCustomFields,
        servicePassword: typeof settings?.servicePassword === "string" && settings.servicePassword.trim() ? settings.servicePassword : "0000"
      });
    });
  });
}

export function savePaymentSettings(settings: PaymentSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_PAYMENT_SETTINGS_STORAGE_KEY]: settings }, () => resolve());
  });
}

export function getExpenseCategories(): Promise<ExpenseCategory[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY], (result) => {
      const categories = result[LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY];
      resolve(Array.isArray(categories) ? categories : []);
    });
  });
}

export function saveExpenseCategories(categories: ExpenseCategory[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY]: categories }, () => resolve());
  });
}

export function getExpenseEntries(): Promise<ExpenseEntry[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_EXPENSE_ENTRIES_STORAGE_KEY], (result) => {
      const entries = result[LOCAL_EXPENSE_ENTRIES_STORAGE_KEY];
      resolve(Array.isArray(entries) ? entries : []);
    });
  });
}

export function saveExpenseEntries(entries: ExpenseEntry[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_EXPENSE_ENTRIES_STORAGE_KEY]: entries }, () => resolve());
  });
}

export async function getChatBookingDraft(chatId: string): Promise<ChatBookingDraft | null> {
  const drafts = await getChatBookingDrafts();
  return drafts[chatId] ?? null;
}

export async function getAllChatBookingDrafts(): Promise<Record<string, ChatBookingDraft>> {
  return getChatBookingDrafts();
}

export async function saveChatBookingDraft(chatId: string, draft: ChatBookingDraft): Promise<void> {
  const drafts = await getChatBookingDrafts();
  drafts[chatId] = draft;
  await saveChatBookingDrafts(drafts);
}

export async function deleteChatBookingDraft(chatId: string): Promise<void> {
  const drafts = await getChatBookingDrafts();
  delete drafts[chatId];
  await saveChatBookingDrafts(drafts);
}

function getLocalRooms(): Promise<Room[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_ROOMS_STORAGE_KEY], (result) => {
      const rooms = result[LOCAL_ROOMS_STORAGE_KEY];
      resolve(Array.isArray(rooms) ? rooms : []);
    });
  });
}

function saveLocalRooms(rooms: Room[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_ROOMS_STORAGE_KEY]: rooms }, () => resolve());
  });
}

function saveReservations(reservations: Reservation[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_RESERVATIONS_STORAGE_KEY]: reservations }, () => resolve());
  });
}

function getChatBookingDrafts(): Promise<Record<string, ChatBookingDraft>> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_CHAT_DRAFTS_STORAGE_KEY], (result) => {
      const drafts = result[LOCAL_CHAT_DRAFTS_STORAGE_KEY];
      resolve(drafts && typeof drafts === "object" && !Array.isArray(drafts) ? drafts : {});
    });
  });
}

function saveChatBookingDrafts(drafts: Record<string, ChatBookingDraft>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_CHAT_DRAFTS_STORAGE_KEY]: drafts }, () => resolve());
  });
}

async function replaceLocalRoom(room: Room) {
  const localRooms = await getLocalRooms();
  await saveLocalRooms(localRooms.filter((item) => item.id !== room.id).concat(room));
}

function mergeById(currentValue: unknown, incomingValue: unknown) {
  const current = Array.isArray(currentValue) ? currentValue : [];
  const incoming = Array.isArray(incomingValue) ? incomingValue : [];
  const ids = new Set(current.map((item) => getEntityId(item)).filter(Boolean));
  const additions = incoming.filter((item) => {
    const id = getEntityId(item);
    return id && !ids.has(id);
  });
  return current.concat(additions);
}

function mergeRecords(currentValue: unknown, incomingValue: unknown) {
  const current = isPlainObject(currentValue) ? currentValue : {};
  const incoming = isPlainObject(incomingValue) ? incomingValue : {};
  return Object.entries(incoming).reduce<Record<string, unknown>>((next, [key, value]) => {
    if (!(key in next)) next[key] = value;
    return next;
  }, { ...current });
}

function mergeSettings(currentValue: unknown, incomingValue: unknown) {
  if (!isPlainObject(incomingValue)) return currentValue ?? null;
  if (!isPlainObject(currentValue)) return incomingValue;
  return {
    ...incomingValue,
    ...currentValue,
    customAmenityOptions: mergeStringArrays(currentValue.customAmenityOptions, incomingValue.customAmenityOptions),
    customFoodOptions: mergeStringArrays(currentValue.customFoodOptions, incomingValue.customFoodOptions),
    customHolidayDates: mergeStringArrays(currentValue.customHolidayDates, incomingValue.customHolidayDates),
    customSleepingPlaceOptions: mergeStringArrays(currentValue.customSleepingPlaceOptions, incomingValue.customSleepingPlaceOptions),
    inventoryCustomFields: mergeRecords(currentValue.inventoryCustomFields, incomingValue.inventoryCustomFields),
    linkMethods: mergeRecords(currentValue.linkMethods, incomingValue.linkMethods),
    objectGalleryPhotoPaths: mergeStringArrays(currentValue.objectGalleryPhotoPaths, incomingValue.objectGalleryPhotoPaths),
    objectGalleryVideoPaths: mergeStringArrays(currentValue.objectGalleryVideoPaths, incomingValue.objectGalleryVideoPaths),
    menuItems: mergeById(currentValue.menuItems, incomingValue.menuItems),
    packageCustomFields: mergeRecords(currentValue.packageCustomFields, incomingValue.packageCustomFields),
    paymentMethods: mergeRecords(currentValue.paymentMethods, incomingValue.paymentMethods),
    pricePdfLinkIds: mergeStringArrays(currentValue.pricePdfLinkIds, incomingValue.pricePdfLinkIds),
    pricePdfRoomIds: mergeStringArrays(currentValue.pricePdfRoomIds, incomingValue.pricePdfRoomIds),
    pricePdfSummaryOptions: mergeStringArrays(currentValue.pricePdfSummaryOptions, incomingValue.pricePdfSummaryOptions),
    quickPhrases: mergeStringArrays(currentValue.quickPhrases, incomingValue.quickPhrases)
  };
}

function normalizeMenuItem(item: unknown): MenuItem | null {
  if (!isPlainObject(item)) return null;
  const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : "";
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!id || !title) return null;

  return {
    id,
    title,
    photoPath: typeof item.photoPath === "string" ? item.photoPath : "",
    price: typeof item.price === "number" ? item.price : 0,
    cookingTime: typeof item.cookingTime === "string" ? item.cookingTime : "",
    composition: typeof item.composition === "string" ? item.composition : ""
  };
}

function mergeStringArrays(currentValue: unknown, incomingValue: unknown) {
  const current = Array.isArray(currentValue) ? currentValue.filter((item): item is string => typeof item === "string") : [];
  const incoming = Array.isArray(incomingValue) ? incomingValue.filter((item): item is string => typeof item === "string") : [];
  return Array.from(new Set(current.concat(incoming)));
}

function getMergeReport(currentValue: unknown, incomingValue: unknown, mode: "array" | "record") {
  if (mode === "record") {
    const current = isPlainObject(currentValue) ? currentValue : {};
    const incoming = isPlainObject(incomingValue) ? incomingValue : {};
    const imported = Object.keys(incoming).filter((key) => !(key in current)).length;
    return { imported, skipped: Object.keys(incoming).length - imported };
  }

  const current = Array.isArray(currentValue) ? currentValue : [];
  const incoming = Array.isArray(incomingValue) ? incomingValue : [];
  const ids = new Set(current.map((item) => getEntityId(item)).filter(Boolean));
  const imported = incoming.filter((item) => {
    const id = getEntityId(item);
    return id && !ids.has(id);
  }).length;
  return { imported, skipped: incoming.length - imported };
}

function getEntityId(item: unknown) {
  if (!isPlainObject(item)) return "";
  return String(item.id || item.phone || item.categoryId || "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
