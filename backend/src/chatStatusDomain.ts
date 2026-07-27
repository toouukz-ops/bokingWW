export type ChatStatusRecord = Record<string, unknown>;

export type ResolvedChatStatus = {
  label: string;
  reservationId?: string;
  source: "draft" | "reservation";
  tone: "info" | "pending" | "success" | "extended" | "muted" | "danger";
  updatedAt: string;
};

export function resolveChatStatus(
  drafts: Record<string, unknown>,
  reservations: ChatStatusRecord[]
): ResolvedChatStatus | null {
  const latestDraft = Object.values(drafts)
    .filter(isRecord)
    .sort((left, right) => statusDate(right).localeCompare(statusDate(left)))[0] ?? null;
  const linkedReservationId = latestDraft && isRecord(latestDraft.lastReservation)
    ? text(latestDraft.lastReservation.id)
    : "";
  const linkedReservation = linkedReservationId
    ? reservations.find((reservation) => text(reservation.id) === linkedReservationId) ?? null
    : null;
  const latestReservation = linkedReservation ?? reservations
    .filter((reservation) => reservation.isAddOnSale !== true)
    .sort((left, right) => reservationStatusDate(right).localeCompare(reservationStatusDate(left)))[0] ?? null;

  if (latestReservation) return getReservationStatus(latestReservation);
  return latestDraft ? getDraftStatus(latestDraft) : null;
}

function getReservationStatus(reservation: ChatStatusRecord): ResolvedChatStatus {
  const reservationId = text(reservation.id) || undefined;
  const updatedAt = reservationStatusDate(reservation);
  if (text(reservation.noShowAt)) return { label: "Незаезд", reservationId, source: "reservation", tone: "danger", updatedAt: text(reservation.noShowAt) };
  if (text(reservation.status) === "cancelled") return { label: "Снято с брони", reservationId, source: "reservation", tone: "danger", updatedAt };
  if (isCheckedOut(reservation)) return { label: "Выехал", reservationId, source: "reservation", tone: "muted", updatedAt };
  if (text(reservation.extendedAt)) return { label: "Продлен", reservationId, source: "reservation", tone: "extended", updatedAt: text(reservation.extendedAt) };
  if (text(reservation.checkedInAt)) return { label: "Въехал", reservationId, source: "reservation", tone: "success", updatedAt: text(reservation.checkedInAt) };
  if (text(reservation.balancePaidAt)) return { label: "Доплата получена", reservationId, source: "reservation", tone: "success", updatedAt: text(reservation.balancePaidAt) };
  if (text(reservation.status) === "booked") return { label: "Забронировано", reservationId, source: "reservation", tone: "success", updatedAt };
  if (text(reservation.prepaymentReceivedAt)) return { label: "Предоплата получена", reservationId, source: "reservation", tone: "success", updatedAt: text(reservation.prepaymentReceivedAt) };
  return { label: "На согласовании", reservationId, source: "reservation", tone: "pending", updatedAt };
}

function getDraftStatus(draft: ChatStatusRecord): ResolvedChatStatus | null {
  const updatedAt = statusDate(draft);
  const manualStatus = text(draft.manualStatus);
  if (manualStatus === "cancelled") return { label: "Снято с брони", source: "draft", tone: "danger", updatedAt };
  if (draft.agreementEverSent || draft.agreementSent) return { label: "На согласовании", source: "draft", tone: "pending", updatedAt };
  const manual = manualStatusLabel(manualStatus);
  if (manual) return { ...manual, source: "draft", updatedAt };
  if (text(draft.catalogStatus) === "room-sent") return { label: "Номер отправлен", source: "draft", tone: "info", updatedAt: text(draft.catalogStatusAt) || updatedAt };
  if (text(draft.catalogStatus) === "price-sent") return { label: "Прайс отправлен", source: "draft", tone: "info", updatedAt: text(draft.catalogStatusAt) || updatedAt };
  if (text(draft.chatStartedAt)) return { label: "Чат начат", source: "draft", tone: "info", updatedAt: text(draft.chatStartedAt) };
  return null;
}

function manualStatusLabel(status: string) {
  if (status === "chat-started") return { label: "Чат начат", tone: "info" as const };
  if (status === "room-sent") return { label: "Номер отправлен", tone: "info" as const };
  if (status === "price-sent") return { label: "Прайс отправлен", tone: "info" as const };
  return null;
}

function isCheckedOut(reservation: ChatStatusRecord) {
  if (text(reservation.checkedOutAt)) return true;
  if (!text(reservation.checkedInAt) || !text(reservation.checkOut)) return false;
  const scheduled = new Date(`${text(reservation.checkOut)}T${text(reservation.checkOutTime) || "12:00"}:00`);
  return Number.isFinite(scheduled.getTime()) && Date.now() >= scheduled.getTime();
}

function reservationStatusDate(reservation: ChatStatusRecord) {
  return text(reservation.checkedOutAt) ||
    text(reservation.checkedInAt) ||
    text(reservation.extendedAt) ||
    text(reservation.balancePaidAt) ||
    text(reservation.prepaymentReceivedAt) ||
    text(reservation.updatedAt) ||
    text(reservation.createdAt);
}

function statusDate(record: ChatStatusRecord) {
  return text(record.updatedAt) || text(record.manualStatusAt) || text(record.chatStartedAt);
}

function isRecord(value: unknown): value is ChatStatusRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value.trim() : "";
}
