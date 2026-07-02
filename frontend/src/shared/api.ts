import type { ActiveDialog, BookingDraft, ChatBookingDraft, ChatMessageDialog, ChatMessageLogItem, ExpenseCategory, ExpenseEntry, GuestContact, MenuItem, PaymentSettings, Reservation, Room, RoomHold } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://bokingww.onrender.com";
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

export function getRealtimeEventsUrl(clientId: string) {
  const params = new URLSearchParams({ clientId });
  return `${API_BASE_URL}/api/events?${params.toString()}`;
}

export async function getActiveDialogs(): Promise<ActiveDialog[]> {
  const response = await fetch(`${API_BASE_URL}/api/active-dialogs`);
  if (!response.ok) {
    throw new Error(`Active dialogs request failed: ${response.status}`);
  }
  return response.json();
}

export async function claimActiveDialog(dialog: Pick<ActiveDialog, "chatKey" | "chatTitle" | "clientId" | "operatorName" | "phone"> & { force?: boolean }): Promise<ActiveDialog> {
  const response = await fetch(`${API_BASE_URL}/api/active-dialogs/${encodeURIComponent(dialog.chatKey)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dialog)
  });
  if (!response.ok) {
    throw new Error(`Active dialog claim failed: ${response.status}`);
  }
  return response.json();
}

export async function releaseActiveDialog(chatKey: string, clientId: string): Promise<void> {
  const params = new URLSearchParams({ clientId });
  const response = await fetch(`${API_BASE_URL}/api/active-dialogs/${encodeURIComponent(chatKey)}?${params.toString()}`, {
    method: "DELETE"
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Active dialog release failed: ${response.status}`);
  }
}

export async function getChatMessageDialogs(): Promise<ChatMessageDialog[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-messages`);
    if (!response.ok) throw new Error(`Chat messages request failed: ${response.status}`);
    const payload = (await response.json()) as { dialogs?: ChatMessageDialog[] };
    return Array.isArray(payload.dialogs) ? payload.dialogs : [];
  } catch {
    return [];
  }
}

export async function saveChatMessages(chatKey: string, payload: {
  chatTitle: string;
  clientId: string;
  messages: ChatMessageLogItem[];
  operatorName: string;
  phone: string;
}): Promise<boolean> {
  if (!chatKey || !payload.messages.length) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-messages/${encodeURIComponent(chatKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch {
    return false;
  }
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
    const localRooms = await getLocalRooms();
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
    return await saveRoomToServer(room);
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

export async function getReservations(): Promise<Reservation[]> {
  const localReservations = await getLocalReservations();
  try {
    const reservations = await fetchReservationsWithRetry();
    await saveReservations(reservations);
    return reservations;
  } catch {
    return localReservations;
  }
}

async function fetchReservationsWithRetry(): Promise<Reservation[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/reservations`);
      if (!response.ok) throw new Error(`Reservations request failed: ${response.status}`);
      return (await response.json()) as Reservation[];
    } catch (error) {
      lastError = error;
      await delay(Math.min(500 * 2 ** attempt, 4000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Reservations request failed");
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function saveReservation(reservation: Reservation, options: { requireRemote?: boolean } = {}): Promise<Reservation> {
  const reservations = await getLocalReservations();
  await saveReservations(reservations.filter((item) => item.id !== reservation.id).concat(reservation));
  try {
    const response = await fetch(`${API_BASE_URL}/api/reservations/${encodeURIComponent(reservation.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reservation)
    });
    if (!response.ok) throw new Error(`Reservation save failed: ${response.status}`);
  } catch (error) {
    if (options.requireRemote) throw (error instanceof Error ? error : new Error("Reservation save failed"));
    return reservation;
  }
  return reservation;
}

export async function deleteReservation(reservationId: string): Promise<void> {
  const reservations = await getLocalReservations();
  await saveReservations(reservations.filter((item) => item.id !== reservationId));
  try {
    await fetch(`${API_BASE_URL}/api/reservations/${encodeURIComponent(reservationId)}`, { method: "DELETE" });
  } catch {
    return;
  }
}

export async function getRoomHolds(): Promise<RoomHold[]> {
  const response = await fetch(`${API_BASE_URL}/api/room-holds`);
  if (!response.ok) throw new Error(`Room holds request failed: ${response.status}`);
  return response.json() as Promise<RoomHold[]>;
}

export async function saveRoomHold(hold: RoomHold): Promise<RoomHold> {
  const response = await fetch(`${API_BASE_URL}/api/room-holds/${encodeURIComponent(hold.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hold)
  });
  if (!response.ok) throw new Error(`Room hold save failed: ${response.status}`);
  return response.json() as Promise<RoomHold>;
}

export async function deleteRoomHold(holdId: string, clientId = ""): Promise<void> {
  const params = new URLSearchParams();
  if (clientId) params.set("clientId", clientId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/api/room-holds/${encodeURIComponent(holdId)}${suffix}`, {
    method: "DELETE"
  });
  if (!response.ok && response.status !== 404) throw new Error(`Room hold delete failed: ${response.status}`);
}

export async function clearBookingStatistics(): Promise<void> {
  await saveReservations([]);
  await saveChatBookingDrafts({});
  await Promise.allSettled([
    saveReservationsToServer([]),
    saveChatBookingDraftsToServer({})
  ]);
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const localSettings = await getLocalPaymentSettingsValue();
  try {
    const response = await fetch(`${API_BASE_URL}/api/payment-settings`);
    if (!response.ok) throw new Error(`Payment settings request failed: ${response.status}`);
    const payload = (await response.json()) as { settings?: unknown };
    if (payload.settings && isPlainObject(payload.settings)) {
      const settings = normalizePaymentSettings(payload.settings);
      await saveLocalPaymentSettings(settings);
      return settings;
    }
  } catch {
    return normalizePaymentSettings(localSettings);
  }

  return normalizePaymentSettings(localSettings);
}

function normalizePaymentSettings(settings: any): PaymentSettings {
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
      const inventoryCustomCounts = settings?.inventoryCustomCounts && typeof settings.inventoryCustomCounts === "object" && !Array.isArray(settings.inventoryCustomCounts)
        ? Object.fromEntries(
          Object.entries(settings.inventoryCustomCounts)
            .map(([key, value]) => [key, typeof value === "number" ? Math.max(0, Math.round(value)) : Number.parseInt(String(value), 10)])
            .filter((entry): entry is [string, number] => typeof entry[0] === "string" && Number.isFinite(entry[1]) && entry[1] >= 0)
        )
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
      const objectGalleryPhotoDescriptions = settings?.objectGalleryPhotoDescriptions && typeof settings.objectGalleryPhotoDescriptions === "object" && !Array.isArray(settings.objectGalleryPhotoDescriptions)
        ? Object.fromEntries(
          Object.entries(settings.objectGalleryPhotoDescriptions).filter(
            (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
          )
        )
        : {};
      const objectGallerySelectedPhotoPaths = Array.isArray(settings?.objectGallerySelectedPhotoPaths)
        ? settings.objectGallerySelectedPhotoPaths.filter((path: unknown): path is string => typeof path === "string" && objectGalleryPhotoPaths.includes(path))
        : objectGalleryPhotoPaths;
      const objectGalleryVideoPaths = Array.isArray(settings?.objectGalleryVideoPaths)
        ? settings.objectGalleryVideoPaths.filter((path: unknown): path is string => typeof path === "string" && path.trim().length > 0)
        : [];
      const includedCardPages = Array.isArray(settings?.includedCardPages)
        ? settings.includedCardPages
          .map((page: unknown) => normalizeIncludedCardPage(page, objectGalleryPhotoPaths))
          .filter((page): page is PaymentSettings["includedCardPages"][number] => Boolean(page))
        : [];
      const menuItems = Array.isArray(settings?.menuItems)
        ? settings.menuItems.map(normalizeMenuItem).filter((item: MenuItem | null): item is MenuItem => Boolean(item))
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
      return {
        paymentLink: typeof settings?.paymentLink === "string" ? settings.paymentLink : "",
        paymentMethods,
        linkMethods,
        companyRequisites,
        objectGalleryPhotoDescriptions,
        objectGalleryPhotoPaths,
        objectGallerySelectedPhotoPaths,
        objectGalleryVideoPaths,
        includedCardPages,
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
        inventoryAirBedPrice: typeof settings?.inventoryAirBedPrice === "number" ? settings.inventoryAirBedPrice : 0,
        inventoryRollawayPrice: typeof settings?.inventoryRollawayPrice === "number" ? settings.inventoryRollawayPrice : 0,
        inventoryExtraPlacePrice: typeof settings?.inventoryExtraPlacePrice === "number" ? settings.inventoryExtraPlacePrice : 0,
        inventoryExtraPlaceAdultPercent: typeof settings?.inventoryExtraPlaceAdultPercent === "number" ? settings.inventoryExtraPlaceAdultPercent : 100,
        inventoryExtraPlaceTeenPercent: typeof settings?.inventoryExtraPlaceTeenPercent === "number" ? settings.inventoryExtraPlaceTeenPercent : 50,
        inventoryExtraPlaceChildPercent: typeof settings?.inventoryExtraPlaceChildPercent === "number" ? settings.inventoryExtraPlaceChildPercent : 0,
        inventoryCustomFields,
        inventoryCustomCounts,
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
        servicePassword: typeof settings?.servicePassword === "string" && settings.servicePassword.trim() ? settings.servicePassword : "0000",
        agreementHoldMinutes: typeof settings?.agreementHoldMinutes === "number" && Number.isFinite(settings.agreementHoldMinutes)
          ? Math.max(1, Math.round(settings.agreementHoldMinutes))
          : 30,
        reservationReminderTime: typeof settings?.reservationReminderTime === "string" && /^\d{2}:\d{2}$/.test(settings.reservationReminderTime)
          ? settings.reservationReminderTime
          : "09:00",
        reservationReminderRepeatHours: typeof settings?.reservationReminderRepeatHours === "number" && Number.isFinite(settings.reservationReminderRepeatHours)
          ? Math.max(0, Math.min(24, Math.round(settings.reservationReminderRepeatHours)))
          : 0
      };
}

export async function savePaymentSettings(settings: PaymentSettings): Promise<void> {
  await saveLocalPaymentSettings(settings);
  await savePaymentSettingsToServer(settings);
}

export async function getExpenseCategories(): Promise<ExpenseCategory[]> {
  const localCategories = await getLocalExpenseCategories();
  try {
    const response = await fetch(`${API_BASE_URL}/api/expense-categories`);
    if (!response.ok) throw new Error(`Expense categories request failed: ${response.status}`);
    const categories = (await response.json()) as ExpenseCategory[];
    await saveLocalExpenseCategories(categories);
    return categories;
  } catch {
    return localCategories;
  }
}

export async function saveExpenseCategories(categories: ExpenseCategory[]): Promise<void> {
  await saveLocalExpenseCategories(categories);
  await saveExpenseCategoriesToServer(categories);
}

export async function getExpenseEntries(): Promise<ExpenseEntry[]> {
  const localEntries = await getLocalExpenseEntries();
  try {
    const response = await fetch(`${API_BASE_URL}/api/expense-entries`);
    if (!response.ok) throw new Error(`Expense entries request failed: ${response.status}`);
    const entries = (await response.json()) as ExpenseEntry[];
    await saveLocalExpenseEntries(entries);
    return entries;
  } catch {
    return localEntries;
  }
}

export async function saveExpenseEntries(entries: ExpenseEntry[]): Promise<void> {
  await saveLocalExpenseEntries(entries);
  await saveExpenseEntriesToServer(entries);
}

export async function getChatBookingDraft(chatId: string): Promise<ChatBookingDraft | null> {
  const localDrafts = await getChatBookingDrafts();
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-drafts/${encodeURIComponent(chatId)}`);
    if (!response.ok) throw new Error(`Chat draft request failed: ${response.status}`);
    const payload = (await response.json()) as { draft?: ChatBookingDraft | null };
    const draft = payload.draft && typeof payload.draft === "object" && !Array.isArray(payload.draft) ? payload.draft : null;
    if (draft) {
      await saveChatBookingDrafts({ ...localDrafts, [chatId]: draft });
    }
    return draft ?? localDrafts[chatId] ?? null;
  } catch {
    return localDrafts[chatId] ?? null;
  }
}

export async function getAllChatBookingDrafts(): Promise<Record<string, ChatBookingDraft>> {
  const localDrafts = await getChatBookingDrafts();
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat-drafts`);
    if (!response.ok) throw new Error(`Chat drafts request failed: ${response.status}`);
    const payload = (await response.json()) as { drafts?: Record<string, ChatBookingDraft> };
    const serverDrafts = payload.drafts && typeof payload.drafts === "object" && !Array.isArray(payload.drafts) ? payload.drafts : {};
    await saveChatBookingDrafts(serverDrafts);
    return serverDrafts;
  } catch {
    return localDrafts;
  }
}

export async function saveChatBookingDraft(chatId: string, draft: ChatBookingDraft): Promise<void> {
  const drafts = await getChatBookingDrafts();
  drafts[chatId] = draft;
  await saveChatBookingDrafts(drafts);
  await saveChatBookingDraftToServer(chatId, draft);
}

export async function deleteChatBookingDraft(chatId: string): Promise<void> {
  const drafts = await getChatBookingDrafts();
  delete drafts[chatId];
  await saveChatBookingDrafts(drafts);
  await deleteChatBookingDraftFromServer(chatId);
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

function getLocalReservations(): Promise<Reservation[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_RESERVATIONS_STORAGE_KEY], (result) => {
      const reservations = result[LOCAL_RESERVATIONS_STORAGE_KEY];
      resolve(Array.isArray(reservations) ? reservations : []);
    });
  });
}

function saveReservations(reservations: Reservation[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_RESERVATIONS_STORAGE_KEY]: reservations }, () => resolve());
  });
}

async function saveReservationsToServer(reservations: Reservation[]): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/reservations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: reservations })
    });
  } catch {
    return;
  }
}

function getLocalPaymentSettingsValue(): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_PAYMENT_SETTINGS_STORAGE_KEY], (result) => {
      resolve(result[LOCAL_PAYMENT_SETTINGS_STORAGE_KEY] ?? null);
    });
  });
}

function saveLocalPaymentSettings(settings: PaymentSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_PAYMENT_SETTINGS_STORAGE_KEY]: settings }, () => resolve());
  });
}

async function savePaymentSettingsToServer(settings: PaymentSettings): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/payment-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings })
    });
  } catch {
    return;
  }
}

function getLocalExpenseCategories(): Promise<ExpenseCategory[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY], (result) => {
      const categories = result[LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY];
      resolve(Array.isArray(categories) ? categories : []);
    });
  });
}

function saveLocalExpenseCategories(categories: ExpenseCategory[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_EXPENSE_CATEGORIES_STORAGE_KEY]: categories }, () => resolve());
  });
}

async function saveExpenseCategoriesToServer(categories: ExpenseCategory[]): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/expense-categories`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: categories })
    });
  } catch {
    return;
  }
}

function getLocalExpenseEntries(): Promise<ExpenseEntry[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([LOCAL_EXPENSE_ENTRIES_STORAGE_KEY], (result) => {
      const entries = result[LOCAL_EXPENSE_ENTRIES_STORAGE_KEY];
      resolve(Array.isArray(entries) ? entries : []);
    });
  });
}

function saveLocalExpenseEntries(entries: ExpenseEntry[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [LOCAL_EXPENSE_ENTRIES_STORAGE_KEY]: entries }, () => resolve());
  });
}

async function saveExpenseEntriesToServer(entries: ExpenseEntry[]): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/expense-entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: entries })
    });
  } catch {
    return;
  }
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

async function saveChatBookingDraftsToServer(drafts: Record<string, ChatBookingDraft>): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/chat-drafts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drafts })
    });
  } catch {
    return;
  }
}

async function saveChatBookingDraftToServer(chatId: string, draft: ChatBookingDraft): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/chat-drafts/${encodeURIComponent(chatId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft })
    });
  } catch {
    return;
  }
}

async function deleteChatBookingDraftFromServer(chatId: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/chat-drafts/${encodeURIComponent(chatId)}`, { method: "DELETE" });
  } catch {
    return;
  }
}

async function replaceLocalRoom(room: Room) {
  const localRooms = await getLocalRooms();
  await saveLocalRooms(localRooms.filter((item) => item.id !== room.id).concat(room));
}

async function saveRoomToServer(room: Room): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${encodeURIComponent(room.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(room)
  });

  if (!response.ok) {
    throw new Error(`Room save failed: ${response.status}`);
  }

  return response.json();
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
    inventoryCustomCounts: mergeRecords(currentValue.inventoryCustomCounts, incomingValue.inventoryCustomCounts),
    linkMethods: mergeRecords(currentValue.linkMethods, incomingValue.linkMethods),
    objectGalleryPhotoDescriptions: mergeRecords(currentValue.objectGalleryPhotoDescriptions, incomingValue.objectGalleryPhotoDescriptions),
    objectGalleryPhotoPaths: mergeStringArrays(currentValue.objectGalleryPhotoPaths, incomingValue.objectGalleryPhotoPaths),
    objectGallerySelectedPhotoPaths: mergeStringArrays(currentValue.objectGallerySelectedPhotoPaths, incomingValue.objectGallerySelectedPhotoPaths),
    objectGalleryVideoPaths: mergeStringArrays(currentValue.objectGalleryVideoPaths, incomingValue.objectGalleryVideoPaths),
    includedCardPages: Array.isArray(currentValue.includedCardPages) ? currentValue.includedCardPages : incomingValue.includedCardPages,
    menuItems: mergeById(currentValue.menuItems, incomingValue.menuItems),
    packageCustomFields: mergeRecords(currentValue.packageCustomFields, incomingValue.packageCustomFields),
    paymentMethods: mergeRecords(currentValue.paymentMethods, incomingValue.paymentMethods),
    pricePdfLinkIds: mergeStringArrays(currentValue.pricePdfLinkIds, incomingValue.pricePdfLinkIds),
    pricePdfRoomIds: mergeStringArrays(currentValue.pricePdfRoomIds, incomingValue.pricePdfRoomIds),
    pricePdfSummaryOptions: mergeStringArrays(currentValue.pricePdfSummaryOptions, incomingValue.pricePdfSummaryOptions),
    quickPhrases: Array.isArray(currentValue.quickPhrases) ? currentValue.quickPhrases : incomingValue.quickPhrases
  };
}

function normalizeIncludedCardPage(page: unknown, photoPaths: string[]): PaymentSettings["includedCardPages"][number] | null {
  if (!isPlainObject(page)) return null;
  const id = typeof page.id === "string" && page.id.trim() ? page.id : `included-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const template = page.template === "photo-description" ? "photo-description" : "hero-thumbs-description";
  const mainPhotoPath = typeof page.mainPhotoPath === "string" && photoPaths.includes(page.mainPhotoPath) ? page.mainPhotoPath : "";
  const thumbnailPaths = Array.isArray(page.thumbnailPaths)
    ? page.thumbnailPaths.filter((path: unknown): path is string => typeof path === "string" && photoPaths.includes(path) && path !== mainPhotoPath).slice(0, 8)
    : [];
  const thumbnailRows = typeof page.thumbnailRows === "number" && Number.isFinite(page.thumbnailRows)
    ? Math.min(2, Math.max(1, Math.round(page.thumbnailRows)))
    : thumbnailPaths.length > 4 ? 2 : 1;
  const description = typeof page.description === "string" ? page.description : "";
  if (!mainPhotoPath && !thumbnailPaths.length && !description.trim()) return null;
  return { description, id, mainPhotoPath, template, thumbnailRows, thumbnailPaths: thumbnailPaths.slice(0, thumbnailRows * 4) };
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
