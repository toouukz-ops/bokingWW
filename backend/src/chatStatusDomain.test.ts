import assert from "node:assert/strict";
import test from "node:test";
import { resolveChatStatus } from "./chatStatusDomain.js";

test("linked reservation is authoritative over other reservations of the same guest", () => {
  const resolved = resolveChatStatus({
    "phone:+77054886698": {
      lastReservation: { id: "current" },
      updatedAt: "2026-07-27T14:20:00.000Z"
    }
  }, [
    { id: "old", status: "booked", updatedAt: "2026-07-27T14:30:00.000Z" },
    { id: "current", status: "cancelled", updatedAt: "2026-07-27T14:25:00.000Z" }
  ]);

  assert.equal(resolved?.label, "Снято с брони");
  assert.equal(resolved?.reservationId, "current");
});

test("latest reservation is used only when the draft has no exact link", () => {
  const resolved = resolveChatStatus({}, [
    { id: "old", status: "booked", updatedAt: "2026-07-27T14:10:00.000Z" },
    { id: "latest", status: "pending", prepaymentReceivedAt: "2026-07-27T14:20:00.000Z" }
  ]);

  assert.equal(resolved?.label, "Предоплата получена");
  assert.equal(resolved?.reservationId, "latest");
});
