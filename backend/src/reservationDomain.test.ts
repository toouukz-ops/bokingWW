import assert from "node:assert/strict";
import test from "node:test";
import { applyReservationAction, hasReservationPayment, isBlockingReservation, reservationPaymentTotal } from "./reservationDomain.js";

test("agreement does not block a room even after prepayment", () => {
  assert.equal(isBlockingReservation({
    status: "pending",
    paidAmount: 15_450,
    prepaymentReceivedAt: "2026-07-27T12:12:20.918Z"
  }), false);
});

test("confirmed booking blocks a room", () => {
  assert.equal(isBlockingReservation({ status: "booked" }), true);
});

test("add-on sales and no-shows never block a room", () => {
  assert.equal(isBlockingReservation({ isAddOnSale: true, status: "booked" }), false);
  assert.equal(isBlockingReservation({ noShowAt: "2026-07-27T12:00:00.000Z", status: "booked" }), false);
});

test("payment facts remain detectable without changing occupancy", () => {
  const reservation = {
    status: "pending",
    payments: [
      { amount: 5_000 },
      { amount: 10_450 },
      { amount: -1 }
    ]
  };
  assert.equal(reservationPaymentTotal(reservation), 15_450);
  assert.equal(hasReservationPayment(reservation), true);
  assert.equal(isBlockingReservation(reservation), false);
});

test("reservation actions are idempotent and keep one payment per type", () => {
  const now = "2026-07-27T12:00:00.000Z";
  const pending = { id: "r1", status: "pending", prepayment: 5_000, total: 15_000, items: [{ total: 15_000 }] };
  const prepaid = applyReservationAction(pending, "prepayment", { amount: 5_000, method: "cash", now });
  const prepaidAgain = applyReservationAction(prepaid, "prepayment", { amount: 5_000, method: "cash", now: "later" });
  assert.deepEqual(prepaidAgain, prepaid);

  const booked = applyReservationAction(prepaid, "confirm", { now });
  const paid = applyReservationAction(booked, "balance", { method: "cash", now });
  const paidAgain = applyReservationAction(paid, "balance", { method: "cash", now: "later" });
  assert.deepEqual(paidAgain, paid);
  assert.equal((paid.payments as unknown[]).length, 2);
  assert.equal(paid.paidAmount, 15_000);
});

test("repeated prepayment repairs stale paid totals from the payment journal", () => {
  const repaired = applyReservationAction({
    id: "r1",
    status: "booked",
    total: 30_900,
    prepayment: 15_450,
    prepaymentReceivedAt: "2026-07-27T12:00:00.000Z",
    paidAmount: 0,
    items: [{ total: 30_900, prepayment: 15_450, paidAmount: 0 }],
    payments: [{ type: "prepayment", amount: 15_450 }]
  }, "prepayment", { now: "2026-07-27T13:00:00.000Z" });
  assert.equal(repaired.paidAmount, 15_450);
  assert.equal((repaired.items as Array<{ paidAmount: number }>)[0].paidAmount, 15_450);
});

test("check-in requires booking and check-out requires check-in", () => {
  const now = "2026-07-27T12:00:00.000Z";
  assert.throws(() => applyReservationAction({ status: "pending" }, "check-in", { now }), /NOT_CHECK_IN_READY/);
  assert.throws(() => applyReservationAction({ status: "booked" }, "check-out", { now }), /NOT_CHECK_OUT_READY/);
  const checkedIn = applyReservationAction({ status: "booked", items: [{}] }, "check-in", { now });
  const checkedOut = applyReservationAction(checkedIn, "check-out", { now });
  assert.equal(checkedOut.checkedOutAt, now);
});
