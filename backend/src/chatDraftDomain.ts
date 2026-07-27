export type ChatDraftRecord = Record<string, unknown>;

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
