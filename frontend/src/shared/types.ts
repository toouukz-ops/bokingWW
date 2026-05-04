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

export type RoomStatus = "active" | "hidden" | "repair";
export type CatalogItemCategory = "guest-room" | "staff-room" | "amenity";

export interface Room {
  id: string;
  number: string;
  title: string;
  sortOrder: number;
  group: string;
  category: CatalogItemCategory;
  bookable: boolean;
  includedInStay: boolean;
  status: RoomStatus;
  basePrice: number;
  floor: string;
  capacityAdults: number;
  capacityChildren: number;
  extraBeds: number;
  beds: string;
  description: string;
  amenities: string;
  adminNotes: string;
  photoPaths: string[];
  videoPaths: string[];
}
