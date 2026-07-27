export type ReservationDomainRecord = Record<string, unknown>;
export type ReservationAction = "confirm" | "prepayment" | "balance" | "check-in" | "check-out";

/**
 * An agreement is not occupancy. Temporary agreement protection is represented
 * by room holds; only a confirmed booking may block the availability calendar.
 */
export function isBlockingReservation(reservation: ReservationDomainRecord) {
  if (reservation.isAddOnSale || reservation.noShowAt) return false;
  return String(reservation.status ?? "").trim() === "booked";
}

export function reservationPaymentTotal(reservation: ReservationDomainRecord) {
  const payments = Array.isArray(reservation.payments) ? reservation.payments : [];
  return payments.reduce((total, payment) => {
    if (!payment || typeof payment !== "object" || Array.isArray(payment)) return total;
    const amount = Number((payment as ReservationDomainRecord).amount ?? 0);
    return Number.isFinite(amount) && amount > 0 ? total + amount : total;
  }, 0);
}

export function hasReservationPayment(reservation: ReservationDomainRecord) {
  return Boolean(
    String(reservation.prepaymentReceivedAt ?? "").trim() ||
    String(reservation.balancePaidAt ?? "").trim() ||
    Number(reservation.paidAmount ?? 0) > 0 ||
    reservationPaymentTotal(reservation) > 0
  );
}

export function applyReservationAction(
  reservation: ReservationDomainRecord,
  action: ReservationAction,
  input: { amount?: unknown; method?: unknown; now: string }
) {
  const now = input.now;
  const items = Array.isArray(reservation.items) ? reservation.items : [];
  const payments = Array.isArray(reservation.payments) ? reservation.payments : [];
  const method = String(input.method ?? reservation.paymentMethod ?? "").trim() || undefined;

  if (action === "confirm") {
    if (reservation.status === "cancelled" || reservation.noShowAt) {
      throw new Error("RESERVATION_NOT_CONFIRMABLE");
    }
    return { ...reservation, status: "booked", updatedAt: now };
  }

  if (action === "prepayment") {
    if (reservation.status === "cancelled" || reservation.noShowAt) throw new Error("RESERVATION_NOT_PAYABLE");
    if (reservation.prepaymentReceivedAt) {
      const paymentTotal = reservationPaymentTotal(reservation);
      const acceptedAmount = Math.max(
        0,
        paymentTotal,
        Number(reservation.prepayment ?? 0),
        Number(reservation.paidAmount ?? 0)
      );
      const normalizedItems = items.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const record = item as ReservationDomainRecord;
        const itemPaid = Math.max(0, Number(record.paidAmount ?? 0), Number(record.prepayment ?? 0));
        return itemPaid === Number(record.paidAmount ?? 0) ? item : { ...record, paidAmount: itemPaid };
      });
      if (
        acceptedAmount === Number(reservation.paidAmount ?? 0) &&
        normalizedItems.every((item, index) => item === items[index])
      ) {
        return reservation;
      }
      return {
        ...reservation,
        items: normalizedItems,
        paidAmount: acceptedAmount,
        updatedAt: now
      };
    }
    const requestedAmount = Number(input.amount ?? reservation.prepayment ?? 0);
    const amount = Number.isFinite(requestedAmount) ? Math.max(0, requestedAmount) : 0;
    if (!amount) throw new Error("PAYMENT_AMOUNT_REQUIRED");
    const payment = { id: `prepayment:${String(reservation.id ?? "")}`, type: "prepayment", amount, method, paidAt: now };
    return {
      ...reservation,
      paidAmount: Math.max(Number(reservation.paidAmount ?? 0), amount),
      paymentMethod: method,
      payments: payments.filter((item) => !isPaymentOfType(item, "prepayment")).concat(payment),
      prepayment: amount,
      prepaymentReceivedAt: now,
      updatedAt: now
    };
  }

  if (action === "balance") {
    if (reservation.status !== "booked" || reservation.noShowAt) throw new Error("RESERVATION_NOT_PAYABLE");
    if (reservation.balancePaidAt) return reservation;
    const total = Math.max(0, Number(reservation.total ?? 0));
    const paid = Math.max(0, Number(reservation.paidAmount ?? 0));
    const amount = Math.max(0, total - paid);
    const payment = { id: `balance:${String(reservation.id ?? "")}`, type: "balance", amount, method, paidAt: now };
    return {
      ...reservation,
      balancePaidAt: now,
      items: items.map((item) => item && typeof item === "object" && !Array.isArray(item)
        ? { ...item, balancePaidAt: now, paidAmount: Number((item as ReservationDomainRecord).total ?? 0) }
        : item),
      paidAmount: total,
      paymentMethod: method,
      payments: payments.filter((item) => !isPaymentOfType(item, "balance")).concat(payment),
      updatedAt: now
    };
  }

  if (action === "check-in") {
    if (reservation.status !== "booked" || reservation.noShowAt) throw new Error("RESERVATION_NOT_CHECK_IN_READY");
    if (reservation.checkedInAt) return reservation;
    return {
      ...reservation,
      checkedInAt: now,
      items: items.map((item) => item && typeof item === "object" && !Array.isArray(item) ? { ...item, checkedInAt: now } : item),
      updatedAt: now
    };
  }

  if (reservation.status !== "booked" || !reservation.checkedInAt || reservation.noShowAt) {
    throw new Error("RESERVATION_NOT_CHECK_OUT_READY");
  }
  if (reservation.checkedOutAt) return reservation;
  return {
    ...reservation,
    checkedOutAt: now,
    items: items.map((item) => item && typeof item === "object" && !Array.isArray(item) ? { ...item, checkedOutAt: now } : item),
    updatedAt: now
  };
}

function isPaymentOfType(payment: unknown, type: string) {
  return Boolean(payment && typeof payment === "object" && !Array.isArray(payment) && (payment as ReservationDomainRecord).type === type);
}
