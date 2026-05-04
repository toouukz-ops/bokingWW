import { z } from "zod";

export const bookingDraftRequestSchema = z.object({
  message: z.string().min(1)
});

export interface BookingDraft {
  status: "new-message" | "needs-details" | "offer-ready" | "waiting-payment" | "booked";
  guestName?: string;
  phone?: string;
  checkIn?: string;
  checkOut?: string;
  adults: number;
  children: number;
  roomNumber?: string;
  totalPrice?: number;
  prepayment?: number;
}

export function createStubDraft(message: string): BookingDraft {
  const now = new Date();
  const dateMatch = message.match(/\b(\d{1,2})\b/);
  const day = dateMatch ? Number(dateMatch[1]) : undefined;

  let checkIn: string | undefined;
  if (day && day >= 1 && day <= 31) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), day);
    if (candidate < startOfToday(now)) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    checkIn = candidate.toISOString().slice(0, 10);
  }

  return {
    status: checkIn ? "needs-details" : "new-message",
    checkIn,
    adults: 1,
    children: 0
  };
}

function startOfToday(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

