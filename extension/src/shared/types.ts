export type BookingDraftStatus =
  | "new-message"
  | "needs-details"
  | "offer-ready"
  | "waiting-payment"
  | "booked";

export interface BookingDraft {
  status: BookingDraftStatus;
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

