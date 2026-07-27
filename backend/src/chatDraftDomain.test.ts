import assert from "node:assert/strict";
import test from "node:test";
import { mergeChatDraftUpdate } from "./chatDraftDomain.js";

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
