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

export interface Reservation {
  id: string;
  roomIds: string[];
  items?: ReservationItem[];
  payments?: ReservationPayment[];
  guestFirstName: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  comment: string;
  adminComment?: string;
  adults: number;
  teenagers?: number;
  children: number;
  hasPet: boolean;
  extraBed: boolean;
  extraBedType?: "air-bed" | "rollaway";
  airMattressCount: number;
  rollawayCount?: number;
  extraInventoryByRoomId?: Record<string, ExtraInventoryItem>;
  extraInventoryChargeEnabled?: boolean;
  inventoryAirBedPrice?: number;
  inventoryRollawayPrice?: number;
  inventoryExtraPlacePrice?: number;
  inventoryExtraPlaceAdultPercent?: number;
  inventoryExtraPlaceTeenPercent?: number;
  inventoryExtraPlaceChildPercent?: number;
  extraInventoryManual?: boolean;
  hourlyHours: number;
  discountPercent: number;
  subtotal: number;
  discountAmount: number;
  total: number;
  prepayment: number;
  paidAmount?: number;
  paymentLink: string;
  paymentMethod?: string;
  breakfastIncluded?: boolean;
  breakfastDiscountAmount?: number;
  isManualSale?: boolean;
  isAddOnSale?: boolean;
  parentReservationId?: string;
  status: "pending" | "booked" | "cancelled";
  prepaymentReceivedAt?: string;
  balancePaidAt?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  extendedAt?: string;
  noShowAt?: string;
  createdAt: string;
}

export interface ReservationItem {
  id: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  checkInTime?: string;
  checkOutTime?: string;
  priceSnapshot?: {
    capturedAt: string;
    dailyPrices: Array<{ date: string; price: number; priceType: "weekday" | "weekend" | "holiday" }>;
    roomSubtotal: number;
    extraInventoryTotal: number;
  };
  subtotal: number;
  discountAmount?: number;
  total: number;
  prepayment?: number;
  paidAmount?: number;
  balancePaidAt?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
}

export type ExtraGuestType = "adult" | "teen" | "child";

export interface ExtraInventoryPlacement {
  id: string;
  typeId: string;
  label: string;
  guestType: ExtraGuestType;
}

export interface ExtraInventoryItem {
  airBeds: number;
  rollaways: number;
  extraPlaces?: number;
  items?: ExtraInventoryPlacement[];
}

export interface ReservationPayment {
  id: string;
  type: "prepayment" | "balance" | "extra";
  roomId?: string;
  amount: number;
  method?: string;
  paidAt: string;
}

export interface RoomHold {
  id: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  ownerId: string;
  ownerTitle: string;
  guestName: string;
  phone: string;
  clientId?: string;
  createdAt: string;
  expiresAt: string;
}

export interface ActiveDialog {
  chatKey: string;
  chatTitle: string;
  phone: string;
  clientId: string;
  operatorName: string;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ChatMessageLogItem {
  author: string;
  chatKey?: string;
  chatTitle?: string;
  createdAt?: string;
  fromMe: boolean;
  id: string;
  messageKey?: string;
  operatorName?: string;
  phone?: string;
  sortKey?: string;
  text: string;
  timestamp: string;
  type: string;
  updatedAt?: string;
}

export interface ChatMessageDialog {
  chatKey: string;
  chatTitle: string;
  phone: string;
  messages: ChatMessageLogItem[];
}

export interface AiReplySuggestions {
  answers: string[];
  reason: string;
  recommended: number;
}

export interface PaymentSettings {
  paymentLink: string;
  paymentMethods: Record<string, string>;
  linkMethods: Record<string, string>;
  companyRequisites: Record<string, string>;
  objectGalleryPhotoDescriptions: Record<string, string>;
  objectGalleryPhotoPaths: string[];
  objectGallerySelectedPhotoPaths: string[];
  objectGalleryVideoPaths: string[];
  includedCardPages: IncludedCardPage[];
  menuItems: MenuItem[];
  pricePdfRoomIds: string[];
  pricePdfSummaryOptions: string[];
  pricePdfLinkIds: string[];
  pricePdfIncludeGallery: boolean;
  pricePdfGroupPeriodTotals: boolean;
  quickPhrases: string[];
  customAmenityOptions: string[];
  customFoodOptions: string[];
  customSleepingPlaceOptions: string[];
  defaultCheckInTime: string;
  defaultCheckOutTime: string;
  weatherLocationName: string;
  weatherLatitude: number;
  weatherLongitude: number;
  customHolidayDates: string[];
  inventoryAirBeds: number;
  inventoryRollaways: number;
  inventoryAirBedPrice: number;
  inventoryRollawayPrice: number;
  inventoryExtraPlacePrice: number;
  inventoryExtraPlaceAdultPercent: number;
  inventoryExtraPlaceTeenPercent: number;
  inventoryExtraPlaceChildPercent: number;
  inventoryCustomFields: Record<string, string>;
  inventoryCustomCounts: Record<string, number>;
  packageDiscountPercent: number;
  packagePeriodDiscountPercent: number;
  packagePeriodDiscountFrom: string;
  packagePeriodDiscountTo: string;
  dynamicPricingEnabled: boolean;
  dynamicPricingMarginPercent: number;
  dynamicPricingSeasonEnd: string;
  breakfastPricePerPerson: number;
  packageGiftText: string;
  packageMinRooms: number;
  packageIncludeAmenities: boolean;
  packageCustomFields: Record<string, string>;
  servicePassword: string;
  agreementHoldMinutes: number;
  reservationReminderTime: string;
  reservationReminderRepeatHours: number;
}

export type IncludedCardTemplate = "hero-thumbs-description" | "photo-description";

export interface IncludedCardPage {
  description: string;
  id: string;
  mainPhotoPath: string;
  template: IncludedCardTemplate;
  thumbnailRows?: number;
  thumbnailPaths: string[];
}

export interface MenuItem {
  id: string;
  title: string;
  photoPath: string;
  price: number;
  cookingTime: string;
  composition: string;
}

export interface ActiveChat {
  id: string;
  title: string;
  phone?: string;
}

export interface GuestContact {
  phone: string;
  appeal: string;
  inquiryDate: string;
}

export type ExpenseType = "fixed" | "variable";

export interface ExpenseCategory {
  id: string;
  type: ExpenseType;
  title: string;
  createdAt: string;
}

export interface ExpenseEntry {
  id: string;
  categoryId: string;
  type: ExpenseType;
  title: string;
  amount: number;
  paymentDate: string;
  note: string;
  createdAt: string;
}

export interface ChatBookingDraft {
  selectedRoomId: string;
  selectedBookingRoomIds: string[];
  roomDateOverrides?: Record<string, { checkIn: string; checkOut: string }>;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  comment: string;
  adminComment?: string;
  guestFirstName: string;
  phone: string;
  adults: number;
  teenagers?: number;
  children: number;
  hasPet: boolean;
  extraBed: boolean;
  extraBedType?: "air-bed" | "rollaway";
  airMattressCount: number;
  rollawayCount?: number;
  extraInventoryByRoomId?: Record<string, ExtraInventoryItem>;
  extraInventoryChargeEnabled?: boolean;
  inventoryAirBedPrice?: number;
  inventoryRollawayPrice?: number;
  inventoryExtraPlacePrice?: number;
  inventoryExtraPlaceAdultPercent?: number;
  inventoryExtraPlaceTeenPercent?: number;
  inventoryExtraPlaceChildPercent?: number;
  extraInventoryManual?: boolean;
  hourlyHours: number;
  discountPercent: number;
  packageDiscountEnabled?: boolean;
  periodDiscountEnabled?: boolean;
  pricePdfPeriodDiscountApplied?: boolean;
  breakfastIncluded?: boolean;
  manualTotalAmount: number;
  manualSaleOpen?: boolean;
  manualSaleAmount: number;
  manualSaleComment: string;
  manualSalePaymentMethod: string;
  manualSalePeriod: "day" | "half-day";
  prepaymentAlreadyPaid: boolean;
  chatStartedAt?: string;
  catalogStatus?: "price-sent" | "room-sent";
  catalogStatusAt?: string;
  agreementSent: boolean;
  agreementEverSent?: boolean;
  lastReservation: Reservation | null;
  updatedAt: string;
}

export type RoomStatus = "active" | "hidden" | "repair";
export type CatalogItemCategory = "guest-room" | "staff-room" | "amenity";
export type CatalogObjectType = "room" | "house" | "amenity" | "staff" | "sauna" | "gazebo" | "bbq" | "firepit" | "parking" | "dining";
export type BathroomType = "inside-room" | "private-on-floor" | "shared-on-floor" | "none";
export type SleepingPlaceType = "double-bed" | "single-bed" | "sofa" | "fixed-sofa" | "sofa-bed" | "rollaway" | "air-bed" | "custom";

export interface SleepingPlace {
  id: string;
  type: SleepingPlaceType;
  title: string;
  count: number;
  placesCount?: number;
  normalCapacity: number;
  denseCapacity: number;
  isMain: boolean;
  allowSharedSameGender: boolean;
  pairOnly: boolean;
  childFriendly: boolean;
  adultFriendly: boolean;
  needsPreparation: boolean;
  extraPrice: number;
  notes: string;
}

export interface Room {
  id: string;
  number: string;
  title: string;
  sortOrder: number;
  group: string;
  category: CatalogItemCategory;
  objectType: CatalogObjectType;
  bookable: boolean;
  includedInStay: boolean;
  status: RoomStatus;
  excludeFromBookingSummary: boolean;
  hideInBookingPanel: boolean;
  basePrice: number;
  weekdayPrice: number;
  weekendPrice: number;
  holidayPrice: number;
  dynamicPricingApplied?: boolean;
  dynamicPricingBasePrice?: number;
  dynamicPricesByDate?: Record<string, number>;
  floor: string;
  occupancyLabel: string;
  bathroomType: BathroomType;
  capacityAdults: number;
  capacityChildren: number;
  extraBeds: number;
  extraBedEnabled: boolean;
  extraBedPrice: number;
  extraBedDescription: string;
  beds: string;
  sleepingPlaces: SleepingPlace[];
  description: string;
  amenities: string;
  adminNotes: string;
  photoPaths: string[];
  videoPaths: string[];
}
