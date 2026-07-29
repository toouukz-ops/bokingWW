export type ChatDraftRecord = Record<string, unknown>;

export function normalizeKazakhstanPhone(value: unknown) {
  let digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length >= 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length >= 11 && digits.startsWith("7")) return digits.slice(0, 11);
  return digits;
}

export function canonicalizeChatDraftIdentity(
  chatId: string,
  draft: unknown
): { chatId: string; draft: ChatDraftRecord } {
  const record = draft && typeof draft === "object" && !Array.isArray(draft)
    ? draft as ChatDraftRecord
    : {};
  const isPhoneIdentity = chatId.startsWith("phone:");
  const keyPhone = isPhoneIdentity ? normalizeKazakhstanPhone(chatId.slice("phone:".length)) : "";
  const draftPhone = normalizeKazakhstanPhone(record.phone);
  const phone = isKazakhstanPhone(draftPhone)
    ? draftPhone
    : isKazakhstanPhone(keyPhone)
      ? keyPhone
      : "";
  if (!phone) return { chatId, draft: record };

  const guestFirstName = typeof record.guestFirstName === "string" &&
    isPhoneIdentity &&
    /^гость\s+\d{4}$/i.test(record.guestFirstName.trim())
    ? `Гость ${phone.slice(-4)}`
    : record.guestFirstName;
  return {
    chatId: isPhoneIdentity ? `phone:+${phone}` : chatId,
    draft: {
      ...record,
      ...(guestFirstName ? { guestFirstName } : {}),
      phone: `+${phone}`
    }
  };
}

function isKazakhstanPhone(value: string) {
  return value.length === 11 && value.startsWith("7");
}

/**
 * Contact extraction and stale client snapshots may update presentation fields,
 * but they must not silently sever a live reservation link.
 */
export function mergeChatDraftUpdate(existing: unknown, incoming: ChatDraftRecord) {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) return incoming;
  const previous = existing as ChatDraftRecord;
  const previousReservation = previous.lastReservation;
  const incomingReservation = incoming.lastReservation;
  const mustPreserveReservation = Boolean(
    previousReservation &&
    typeof previousReservation === "object" &&
    !Array.isArray(previousReservation) &&
    (!incomingReservation || typeof incomingReservation !== "object" || Array.isArray(incomingReservation))
  );
  if (!mustPreserveReservation) return { ...previous, ...incoming };
  return {
    ...previous,
    ...incoming,
    agreementEverSent: Boolean(previous.agreementEverSent || previous.agreementSent || incoming.agreementEverSent || incoming.agreementSent),
    lastReservation: previousReservation
  };
}
