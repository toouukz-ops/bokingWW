import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeChatDraftIdentity,
  mergeChatDraftUpdate,
  normalizeKazakhstanPhone
} from "./chatDraftDomain.js";

test("Kazakhstan phone normalization removes a WhatsApp row time suffix", () => {
  assert.equal(normalizeKazakhstanPhone("+7 708 807 1123 11:46"), "77088071123");
  assert.equal(normalizeKazakhstanPhone("+7708807112311"), "77088071123");
});

test("chat draft identity prefers a valid draft phone over a corrupted key", () => {
  const normalized = canonicalizeChatDraftIdentity(
    "phone:+703420210433681",
    { guestFirstName: "Гость 5418", phone: "+77024815418" }
  );
  assert.equal(normalized.chatId, "phone:+77024815418");
  assert.equal(normalized.draft.phone, "+77024815418");
  assert.equal(normalized.draft.guestFirstName, "Гость 5418");
});

test("chat draft identity repairs a guest suffix corrupted by the message hour", () => {
  const normalized = canonicalizeChatDraftIdentity(
    "phone:+7708807112311",
    { guestFirstName: "Гость 2311", phone: "+7708807112311" }
  );
  assert.equal(normalized.chatId, "phone:+77088071123");
  assert.equal(normalized.draft.phone, "+77088071123");
  assert.equal(normalized.draft.guestFirstName, "Гость 1123");
});

test("contact refresh cannot erase an existing reservation link", () => {
  const existing = {
    agreementEverSent: true,
    agreementSent: true,
    guestFirstName: "Гость 6698",
    lastReservation: { id: "reservation-1785154339458", status: "pending" },
    phone: "+77054886698"
  };
  const merged = mergeChatDraftUpdate(existing, {
    agreementSent: false,
    guestFirstName: "Гость 6698",
    lastReservation: null,
    phone: "+77054886698"
  });
  assert.deepEqual(merged.lastReservation, existing.lastReservation);
  assert.equal(merged.agreementEverSent, true);
});

test("a newer real reservation replaces the previous link", () => {
  const merged = mergeChatDraftUpdate(
    { lastReservation: { id: "old" } },
    { lastReservation: { id: "new" } }
  );
  assert.deepEqual(merged.lastReservation, { id: "new" });
});
