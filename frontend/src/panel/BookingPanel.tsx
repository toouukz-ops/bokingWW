import {
  Banknote,
  BarChart3,
  BedDouble,
  CalendarDays,
  Car,
  ClipboardPaste,
  CloudSun,
  Copy,
  Crop,
  Download,
  Eraser,
  Check,
  Plus,
  Hotel,
  Image,
  ChevronLeft,
  ChevronRight,
  Flame,
  Home,
  Mic,
  Pencil,
  MoveDown,
  MoveUp,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Settings,
  Share2,
  Trash2,
  Utensils,
  Users,
  Video,
  X
} from "lucide-react";
import { jsPDF } from "jspdf";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  clearBookingStatistics,
  cropRoomMedia,
  deleteObjectGalleryMedia,
  deleteGuestContact,
  deleteChatBookingDraft,
  deleteReservation,
  deleteRoom,
  deleteRoomMedia,
  ensureWhatsappVideoMedia,
  exportLocalBackupData,
  exportServerBackupData,
  getAllChatBookingDrafts,
  getExpenseCategories,
  getExpenseEntries,
  getGuestContacts,
  getHealth,
  getMediaUrl,
  getPaymentSettings,
  getReservations,
  getChatBookingDraft,
  getRooms,
  importLocalBackupData,
  importServerBackupData,
  saveGuestContact,
  saveExpenseCategories,
  saveExpenseEntries,
  savePaymentSettings,
  saveChatBookingDraft,
  saveReservation,
  saveRoom,
  sendDebugLog,
  uploadObjectGalleryMedia,
  uploadRoomMedia
} from "../shared/api";
import type { BackupExportOptions } from "../shared/api";
import type { ActiveChat, ChatBookingDraft, ExpenseCategory, ExpenseEntry, GuestContact, MenuItem, PaymentSettings, Reservation, ReservationItem, ReservationPayment, Room, RoomStatus, SleepingPlace, SleepingPlaceType } from "../shared/types";

const MIN_WIDTH = 560;
const MAX_WIDTH = 960;
const DEFAULT_CHECK_IN_TIME = "15:00";
const DEFAULT_CHECK_OUT_TIME = "12:00";
const PENDING_CONTACT_SAVE_KEY = "gpb-pending-contact-save";
const MANUAL_SALE_MODE_KEY = "gpb-manual-sale-mode";
const CUSTOM_HOLIDAY_DATES_STORAGE_KEY = "gpb-custom-holiday-dates";
const CUSTOM_AMENITY_OPTIONS_STORAGE_KEY = "gpb-custom-amenity-options";
const CUSTOM_FOOD_OPTIONS_STORAGE_KEY = "gpb-custom-food-options";
const PANEL_WIDTH_RATIO = 0.4;
const DAY_MS = 24 * 60 * 60 * 1000;

function debugContactFlow(event: string, details: Record<string, unknown> = {}) {
  console.debug(`[GPB contact] ${event}`, details);
  void sendDebugLog(event, details);
}

type WeatherState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; forecast: WeatherForecast }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };
type WeatherForecast = {
  date: string;
  minTemperature: number;
  maxTemperature: number;
  precipitationProbability: number;
  weatherCode: number;
  dayParts: WeatherDayPart[];
};
type WeatherDayPart = {
  label: string;
  temperature: number;
  precipitationProbability: number;
};
type ExtraBedType = "air-bed" | "rollaway";
type SettingMethod = { id: string; label: string };
type AvailabilityConflict = {
  busyFrom?: string;
  busyTo?: string;
  releaseDate: string;
  reservation: Reservation;
  room: Room;
};
type CatalogAvailabilitySummary = {
  airBeds: number;
  gazebos: number;
  mode?: "available" | "booked";
  rollaways: number;
  rooms: number;
  saunas: number;
  sleepingPlaces: number;
};
type PricePdfSummaryOptionKey =
  | "period"
  | "rooms"
  | "saunas"
  | "sleepingPlaces"
  | "airBeds"
  | "rollaways"
  | "subtotal"
  | "discount"
  | "total"
  | "prepayment"
  | "conditions";
const PRICE_PDF_SUMMARY_OPTION_KEYS: PricePdfSummaryOptionKey[] = [
  "period",
  "rooms",
  "saunas",
  "sleepingPlaces",
  "airBeds",
  "rollaways",
  "subtotal",
  "discount",
  "total",
  "prepayment",
  "conditions"
];
const DEFAULT_PRICE_PDF_SUMMARY_OPTIONS: PricePdfSummaryOptionKey[] = [
  "period",
  "rooms",
  "saunas",
  "sleepingPlaces",
  "airBeds",
  "rollaways",
  "subtotal",
  "discount",
  "total",
  "prepayment",
  "conditions"
];

function isPricePdfSummaryOptionKey(value: string): value is PricePdfSummaryOptionKey {
  return PRICE_PDF_SUMMARY_OPTION_KEYS.includes(value as PricePdfSummaryOptionKey);
}

function ensurePricePdfSummaryOption(options: PricePdfSummaryOptionKey[], option: PricePdfSummaryOptionKey) {
  return options.includes(option) ? options : options.concat(option);
}
const AIR_MATTRESS_PRICE = 5000;
const PAYMENT_METHODS: SettingMethod[] = [
  { id: "kaspi", label: "Kaspi Pay" },
  { id: "kaspi-transfer", label: "Перевод" },
  { id: "cash", label: "Наличка" },
  { id: "qr", label: "QR" },
  { id: "bank-transfer", label: "Безнал" },
  { id: "halyk", label: "Halyk" },
  { id: "bcc", label: "Банк ЦентрКредит" },
  { id: "forte", label: "Forte" },
  { id: "freedom", label: "Freedom" },
  { id: "jusan", label: "Jusan" },
  { id: "bereke", label: "Bereke" },
  { id: "eurasian", label: "Евразийский" }
];
const ALWAYS_AVAILABLE_PAYMENT_METHOD_IDS = new Set(["kaspi-transfer", "cash", "qr", "bank-transfer"]);
const PHONE_COUNTRY_OPTIONS = [
  { code: "+7", label: "Казахстан / Россия" },
  { code: "+996", label: "Кыргызстан" },
  { code: "+998", label: "Узбекистан" },
  { code: "+992", label: "Таджикистан" },
  { code: "+993", label: "Туркменистан" },
  { code: "+994", label: "Азербайджан" },
  { code: "+374", label: "Армения" },
  { code: "+995", label: "Грузия" },
  { code: "+90", label: "Турция" },
  { code: "+971", label: "ОАЭ" },
  { code: "+49", label: "Германия" },
  { code: "+1", label: "США / Канада" }
];
const LINK_METHODS: SettingMethod[] = [
  { id: "2gis", label: "2GIS" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "website", label: "Сайт" },
  { id: "partners", label: "Контакты партнеров" },
  { id: "rules", label: "Правила проживания" }
];
const COMPANY_REQUISITE_FIELDS: SettingMethod[] = [
  { id: "Название компании", label: "Название компании" },
  { id: "БИН / ИИН", label: "БИН / ИИН" },
  { id: "Банк", label: "Банк" },
  { id: "ИИК / IBAN", label: "ИИК / IBAN" },
  { id: "БИК", label: "БИК" },
  { id: "КБе", label: "КБе" },
  { id: "Адрес", label: "Адрес" },
  { id: "Телефон", label: "Телефон" }
];
const DEFAULT_QUICK_PHRASES = ["Здравствуйте!", "Вам на какое число?", "На сколько ночей?", "Сколько человек?", "Одну минуту..."];
const WEATHER_LOCATIONS = [
  { name: "Алматы", latitude: 43.2389, longitude: 76.8897 },
  { name: "Астана", latitude: 51.1694, longitude: 71.4491 },
  { name: "Шымкент", latitude: 42.3417, longitude: 69.5901 },
  { name: "Караганда", latitude: 49.8047, longitude: 73.1094 },
  { name: "Актобе", latitude: 50.2839, longitude: 57.167 },
  { name: "Тараз", latitude: 42.9, longitude: 71.3667 },
  { name: "Павлодар", latitude: 52.2873, longitude: 76.9674 },
  { name: "Усть-Каменогорск", latitude: 49.9481, longitude: 82.6275 },
  { name: "Семей", latitude: 50.4111, longitude: 80.2275 },
  { name: "Атырау", latitude: 47.1167, longitude: 51.8833 },
  { name: "Костанай", latitude: 53.2144, longitude: 63.6246 },
  { name: "Кызылорда", latitude: 44.8528, longitude: 65.5092 },
  { name: "Уральск", latitude: 51.2333, longitude: 51.3667 },
  { name: "Петропавловск", latitude: 54.8728, longitude: 69.143 },
  { name: "Актау", latitude: 43.65, longitude: 51.1667 },
  { name: "Талдыкорган", latitude: 45.0177, longitude: 78.3804 },
  { name: "Туркестан", latitude: 43.3016, longitude: 68.2691 },
  { name: "Конаев", latitude: 43.8844, longitude: 77.0681 },
  { name: "Бурабай", latitude: 53.0838, longitude: 70.3138 }
];
const AMENITY_OPTIONS = [
  "Wi-Fi",
  "Кондиционер",
  "Душ",
  "Санузел",
  "Холодильник",
  "Телевизор",
  "Фен",
  "Полотенца",
  "Постельное белье",
  "Одноразовые тапочки",
  "Гель для душа",
  "Шампунь",
  "Зубная щетка",
  "Зубная паста",
  "Балкон",
  "Вид на горы",
  "Кухня",
  "Чайник",
  "Парковка",
  "Тарелки",
  "Стаканы",
  "Мангалы",
  "Барбекю с казаном",
  "Шампура",
  "Решетка гриль",
  "Чайники",
  "Вода",
  "Столы",
  "Лавочки",
  "Стулья",
  "Музыкальная колонка",
  "Кастрюли",
  "Вилки",
  "Ложки",
  "Ножи",
  "Салфетки",
  "Сахар",
  "Соль",
  "Чай",
  "Заварник"
];
const DEFAULT_GROUPS = ["Блок А", "Блок Б"];
const FLOOR_OPTIONS = ["1 этаж", "2 этаж", "3 этаж"];
const ROOM_CLASS_OPTIONS = ["Эконом", "Стандарт", "Стандарт +", "Полулюкс", "Люкс"];
const FOOD_OPTIONS = ["Завтрак", "Обед", "Ужин", "Кофе", "Чай", "Коктейли", "Мини-бар", "Питьевая вода"];
const BATHROOM_OPTIONS: Array<{ value: Room["bathroomType"]; label: string; description: string }> = [
  {
    value: "inside-room",
    label: "Внутри номера",
    description: "Душ и санузел внутри номера."
  },
  {
    value: "private-on-floor",
    label: "Персональный на этаже",
    description: "Душ санузел на этаже отдельный."
  },
  {
    value: "shared-on-floor",
    label: "Общий на этаже",
    description: "Душ и санузел находятся на этаже, общие для нескольких номеров."
  },
  {
    value: "none",
    label: "Нет",
    description: "Душ и санузел не предусмотрены."
  }
];
const ROOM_STATUS_OPTIONS: Array<{ value: RoomStatus; label: string }> = [
  { value: "active", label: "Активен" },
  { value: "hidden", label: "Скрыт" },
  { value: "repair", label: "На ремонте" }
];
const CREATE_TYPE_OPTIONS: Array<{ category: Room["category"]; objectType: Room["objectType"]; label: string }> = [
  { category: "guest-room", objectType: "room", label: "Номер" },
  { category: "guest-room", objectType: "house", label: "Домик" },
  { category: "amenity", objectType: "sauna", label: "Сауна с бассейном" },
  { category: "amenity", objectType: "gazebo", label: "Беседка" },
  { category: "amenity", objectType: "bbq", label: "Мангальная зона" },
  { category: "amenity", objectType: "firepit", label: "Костровая" },
  { category: "amenity", objectType: "parking", label: "Парковка" },
  { category: "amenity", objectType: "dining", label: "Столовая" },
  { category: "amenity", objectType: "amenity", label: "Услуга / зона" },
  { category: "staff-room", objectType: "staff", label: "Служебный объект" }
];
const SLEEPING_PLACE_OPTIONS: Array<{ value: SleepingPlaceType; label: string; title: string; capacity: number }> = [
  { value: "double-bed", label: "Двуспальная кровать", title: "Двуспальная кровать", capacity: 2 },
  { value: "single-bed", label: "Односпальная кровать", title: "Односпальная кровать", capacity: 1 },
  { value: "sofa", label: "Диван", title: "Диван", capacity: 1 },
  { value: "fixed-sofa", label: "Нераскладной диван", title: "Нераскладной диван", capacity: 0 },
  { value: "sofa-bed", label: "Раскладной диван", title: "Раскладной диван", capacity: 2 },
  { value: "air-bed", label: "Надувной матрас", title: "Надувной матрас", capacity: 1 },
  { value: "rollaway", label: "Раскладушка", title: "Раскладушка", capacity: 1 },
  { value: "custom", label: "Свое", title: "Спальное место", capacity: 1 }
];

function getMaxPanelWidth() {
  return Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.62));
}

function getDefaultPanelWidth() {
  return Math.min(getMaxPanelWidth(), Math.max(MIN_WIDTH, Math.round(window.innerWidth * PANEL_WIDTH_RATIO)));
}

function getDefaultCheckInDate() {
  return formatDateInput(new Date());
}

function getDefaultCheckOutDate() {
  return formatDateInput(addDays(new Date(), 1));
}

export function BookingPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReservationsOpen, setIsReservationsOpen] = useState(false);
  const [isGuestDatabaseOpen, setIsGuestDatabaseOpen] = useState(false);
  const [isExpensesOpen, setIsExpensesOpen] = useState(false);
  const [startupCleanDone, setStartupCleanDone] = useState(false);
  const [activeBookingPanel, setActiveBookingPanel] = useState<"dates" | "catalog" | "booking" | "links" | null>(null);
  const [activeWorkflowBlock, setActiveWorkflowBlock] = useState<"flow" | "catalog" | "booking" | "links" | null>(null);
  const [width, setWidth] = useState(getDefaultPanelWidth);
  const [backendState, setBackendState] = useState<"checking" | "online" | "offline">("checking");
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [guestContacts, setGuestContacts] = useState<GuestContact[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedBookingRoomIds, setSelectedBookingRoomIds] = useState<string[]>([]);
  const [roomDateOverrides, setRoomDateOverrides] = useState<Record<string, { checkIn: string; checkOut: string }>>({});
  const [checkIn, setCheckIn] = useState(getDefaultCheckInDate);
  const [checkOut, setCheckOut] = useState(getDefaultCheckOutDate);
  const [checkInTime, setCheckInTime] = useState(DEFAULT_CHECK_IN_TIME);
  const [checkOutTime, setCheckOutTime] = useState(DEFAULT_CHECK_OUT_TIME);
  const [bookingComment, setBookingComment] = useState("");
  const [adminComment, setAdminComment] = useState("");
  const [guestAdults, setGuestAdults] = useState(0);
  const [guestChildren, setGuestChildren] = useState(0);
  const [adminCommentVoiceState, setAdminCommentVoiceState] = useState<"idle" | "listening" | "unsupported">("idle");
  const [defaultCheckInTime, setDefaultCheckInTime] = useState(DEFAULT_CHECK_IN_TIME);
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestPhonePrefix, setGuestPhonePrefix] = useState("+7");
  const [contactExtracted, setContactExtracted] = useState(false);
  const [contactSavedInWhatsApp, setContactSavedInWhatsApp] = useState(false);
  const [hasPet, setHasPet] = useState(false);
  const [needsExtraBed, setNeedsExtraBed] = useState(false);
  const [extraBedType, setExtraBedType] = useState<ExtraBedType>("air-bed");
  const [airMattressCount, setAirMattressCount] = useState(0);
  const [rollawayCount, setRollawayCount] = useState(0);
  const [extraInventoryManual, setExtraInventoryManual] = useState(false);
  const [extraInventoryPickerRoomId, setExtraInventoryPickerRoomId] = useState("");
  const [extraInventoryByRoomId, setExtraInventoryByRoomId] = useState<Record<string, { airBeds: number; rollaways: number }>>({});
  const [hourlyHours, setHourlyHours] = useState(2);
  const [addOnSaleDate, setAddOnSaleDate] = useState(() => formatDateInput(new Date()));
  const [addOnSaleStartTime, setAddOnSaleStartTime] = useState("15:00");
  const [addOnSaleHours, setAddOnSaleHours] = useState(2);
  const [addOnSalePaidNow, setAddOnSalePaidNow] = useState(false);
  const [addOnSalePaymentMethod, setAddOnSalePaymentMethod] = useState("");
  const [addOnSaleState, setAddOnSaleState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [kitchenSaleOpen, setKitchenSaleOpen] = useState(false);
  const [kitchenMenuItemId, setKitchenMenuItemId] = useState("");
  const [kitchenPortions, setKitchenPortions] = useState(1);
  const [kitchenUnitPrice, setKitchenUnitPrice] = useState(0);
  const [kitchenSalePaidNow, setKitchenSalePaidNow] = useState(false);
  const [kitchenSalePaymentMethod, setKitchenSalePaymentMethod] = useState("");
  const [kitchenSaleState, setKitchenSaleState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [packageDiscountEnabled, setPackageDiscountEnabled] = useState(false);
  const [packageDiscountWasApplied, setPackageDiscountWasApplied] = useState(false);
  const [discountManualOverride, setDiscountManualOverride] = useState(false);
  const [breakfastIncluded, setBreakfastIncluded] = useState(true);
  const [manualTotalAmount, setManualTotalAmount] = useState(0);
  const [manualSaleOpen, setManualSaleOpen] = useState(false);
  const [bookingNewChatOpen, setBookingNewChatOpen] = useState(false);
  const [manualSaleAmount, setManualSaleAmount] = useState(0);
  const [manualSaleComment, setManualSaleComment] = useState("");
  const [manualSalePaymentMethod, setManualSalePaymentMethod] = useState("");
  const [manualSalePeriod, setManualSalePeriod] = useState<"day" | "half-day">("day");
  const [prepaymentAlreadyPaid, setPrepaymentAlreadyPaid] = useState(false);
  const [paymentLink, setPaymentLink] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<Record<string, string>>({});
  const [linkMethods, setLinkMethods] = useState<Record<string, string>>({});
  const [companyRequisites, setCompanyRequisites] = useState<Record<string, string>>({});
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [objectGalleryPhotoPaths, setObjectGalleryPhotoPaths] = useState<string[]>([]);
  const [objectGalleryVideoPaths, setObjectGalleryVideoPaths] = useState<string[]>([]);
  const [objectGalleryUploadState, setObjectGalleryUploadState] = useState<{
    message: string;
    status: "idle" | "uploading" | "error";
  }>({ message: "", status: "idle" });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuUploadItemId, setMenuUploadItemId] = useState("");
  const [quickPhrases, setQuickPhrases] = useState<string[]>(DEFAULT_QUICK_PHRASES);
  const [customAmenityOptions, setCustomAmenityOptions] = useState<string[]>([]);
  const [customFoodOptions, setCustomFoodOptions] = useState<string[]>([]);
  const [customSleepingPlaceOptions, setCustomSleepingPlaceOptions] = useState<string[]>([]);
  const [newQuickPhrase, setNewQuickPhrase] = useState("");
  const [isQuickPhraseFormOpen, setIsQuickPhraseFormOpen] = useState(false);
  const [draggedQuickPhraseIndex, setDraggedQuickPhraseIndex] = useState<number | null>(null);
  const [quickPhraseSendState, setQuickPhraseSendState] = useState<"idle" | "sending" | "error">("idle");
  const [weatherLocationName, setWeatherLocationName] = useState("Алматы");
  const [weatherLatitude, setWeatherLatitude] = useState(43.2389);
  const [weatherLongitude, setWeatherLongitude] = useState(76.8897);
  const [customHolidayDates, setCustomHolidayDates] = useState<string[]>([]);
  const [inventoryAirBeds, setInventoryAirBeds] = useState(0);
  const [inventoryRollaways, setInventoryRollaways] = useState(3);
  const [inventoryCustomFields, setInventoryCustomFields] = useState<Record<string, string>>({});
  const [packageDiscountPercent, setPackageDiscountPercent] = useState(0);
  const [packagePeriodDiscountPercent, setPackagePeriodDiscountPercent] = useState(0);
  const [packagePeriodDiscountFrom, setPackagePeriodDiscountFrom] = useState("");
  const [packagePeriodDiscountTo, setPackagePeriodDiscountTo] = useState("");
  const [dynamicPricingEnabled, setDynamicPricingEnabled] = useState(false);
  const [dynamicPricingMarginPercent, setDynamicPricingMarginPercent] = useState(0);
  const [dynamicPricingSeasonEnd, setDynamicPricingSeasonEnd] = useState("");
  const [breakfastPricePerPerson, setBreakfastPricePerPerson] = useState(0);
  const [packageGiftText, setPackageGiftText] = useState("");
  const [packageMinRooms, setPackageMinRooms] = useState(0);
  const [packageIncludeAmenities, setPackageIncludeAmenities] = useState(true);
  const [packageCustomFields, setPackageCustomFields] = useState<Record<string, string>>({});
  const [isPricePdfOptionsOpen, setIsPricePdfOptionsOpen] = useState(false);
  const [pricePdfSummaryOptions, setPricePdfSummaryOptions] = useState<PricePdfSummaryOptionKey[]>(DEFAULT_PRICE_PDF_SUMMARY_OPTIONS);
  const [pricePdfRoomIds, setPricePdfRoomIds] = useState<string[]>([]);
  const [pricePdfLinkIds, setPricePdfLinkIds] = useState<string[]>([]);
  const [includeGalleryInPricePdf, setIncludeGalleryInPricePdf] = useState(false);
  const [pricePdfGroupPeriodTotals, setPricePdfGroupPeriodTotals] = useState(true);
  const [pricePdfMode, setPricePdfMode] = useState<"chat" | "external">("chat");
  const [draggedPricePdfRoomId, setDraggedPricePdfRoomId] = useState("");
  const [isSocialPriceImageOpen, setIsSocialPriceImageOpen] = useState(false);
  const [socialPriceRoomIds, setSocialPriceRoomIds] = useState<string[]>([]);
  const [socialPriceDescription, setSocialPriceDescription] = useState("");
  const [servicePassword, setServicePassword] = useState("0000");
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);
  const [cancelReservationTarget, setCancelReservationTarget] = useState<Reservation | null>(null);
  const [deleteReservationTarget, setDeleteReservationTarget] = useState<Reservation | null>(null);
  const [prepaymentAmountTarget, setPrepaymentAmountTarget] = useState<Reservation | null>(null);
  const [roomDateEditTarget, setRoomDateEditTarget] = useState<Room | null>(null);
  const [balanceRoomSelectionTarget, setBalanceRoomSelectionTarget] = useState<Reservation | null>(null);
  const [checkInRoomSelectionTarget, setCheckInRoomSelectionTarget] = useState<Reservation | null>(null);
  const [selectedBalanceRoomId, setSelectedBalanceRoomId] = useState("");
  const [selectedCheckInRoomId, setSelectedCheckInRoomId] = useState("");
  const [extendReservationTarget, setExtendReservationTarget] = useState<Reservation | null>(null);
  const [isPaymentMethodRequiredOpen, setIsPaymentMethodRequiredOpen] = useState(false);
  const [agreementSent, setAgreementSent] = useState(false);
  const [agreementEverSent, setAgreementEverSent] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<ChatBookingDraft["catalogStatus"]>(undefined);
  const [catalogStatusAt, setCatalogStatusAt] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [agreementCopyState, setAgreementCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [clearBookingState, setClearBookingState] = useState<"idle" | "clearing" | "cleared">("idle");
  const [contactSaveState, setContactSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [todayWeatherState, setTodayWeatherState] = useState<WeatherState>({ status: "idle" });
  const [isDiscountFocused, setIsDiscountFocused] = useState(false);
  const [isManualTotalFocused, setIsManualTotalFocused] = useState(false);
  const [isManualSaleAmountFocused, setIsManualSaleAmountFocused] = useState(false);
  const [focusedGroupInput, setFocusedGroupInput] = useState("");
  const guestPhoneInputRef = useRef<HTMLInputElement | null>(null);
  const adminCommentValueRef = useRef("");
  const adminCommentRecognitionRef = useRef<{
    stop: () => void;
  } | null>(null);
  const shouldKeepAdminCommentListeningRef = useRef(false);
  const activeChatIdRef = useRef("");
  const isRestoringChatDraftRef = useRef(false);
  const suppressActiveChatSyncRef = useRef(false);
  const recentContactExtractionAtRef = useRef(0);
  const saveChatDraftTimerRef = useRef<number | null>(null);
  const saveAdminCommentTimerRef = useRef<number | null>(null);
  const quickPhraseSendingRef = useRef(false);
  const pricedRooms = useMemo(
    () => applyDynamicPricingToRooms({
      checkIn,
      dynamicPricingEnabled,
      dynamicPricingMarginPercent,
      dynamicPricingSeasonEnd,
      expenseEntries,
      reservations,
      rooms
    }),
    [checkIn, dynamicPricingEnabled, dynamicPricingMarginPercent, dynamicPricingSeasonEnd, expenseEntries, reservations, rooms]
  );
  const availableRooms = useMemo(
    () => pricedRooms.filter((room) => isRoomAvailableInBookingPanel(room) && (isHourlyBookingObject(room) || !isRoomReserved(room, checkIn, checkOut, checkInTime, checkOutTime, reservations))),
    [checkIn, checkOut, checkInTime, checkOutTime, pricedRooms, reservations]
  );
  const availableExtraInventory = useMemo(
    () => getAvailableExtraInventory(reservations, checkIn, checkOut, inventoryAirBeds, inventoryRollaways),
    [checkIn, checkOut, inventoryAirBeds, inventoryRollaways, reservations]
  );
  const visibleAvailableRooms = useMemo(
    () => availableRooms,
    [availableRooms]
  );
  const bookingPanelSummary = useMemo(
    () => buildBookingPanelSummary(
      pricedRooms,
      reservations,
      availableRooms,
      checkIn,
      checkOut,
      inventoryAirBeds,
      inventoryRollaways,
      packageDiscountPercent,
      packageMinRooms,
      packagePeriodDiscountPercent,
      packagePeriodDiscountFrom,
      packagePeriodDiscountTo,
      expenseEntries
    ),
    [
      availableRooms,
      checkIn,
      checkOut,
      expenseEntries,
      inventoryAirBeds,
      inventoryRollaways,
      packageDiscountPercent,
      packageMinRooms,
      packagePeriodDiscountFrom,
      packagePeriodDiscountPercent,
      packagePeriodDiscountTo,
      reservations,
      pricedRooms
    ]
  );
  const configuredLinkMethods = useMemo(() => buildSettingMethodList(LINK_METHODS, linkMethods), [linkMethods]);
  const configuredPaymentMethods = useMemo(() => buildPaymentMethodSelectionList(paymentMethods), [paymentMethods]);
  const roomAvailabilityConflicts = useMemo(
    () => buildRoomAvailabilityConflicts(pricedRooms, reservations, checkIn, checkOut),
    [checkIn, checkOut, reservations, pricedRooms]
  );
  const saunaBusySlotsByRoomId = useMemo(
    () => buildHourlyBusySlotsByRoomId(pricedRooms, reservations, checkIn),
    [checkIn, reservations, pricedRooms]
  );
  const bookedReservationRooms = useMemo(
    () => lastReservation?.status === "booked"
      ? lastReservation.roomIds
        .map((roomId) => pricedRooms.find((room) => room.id === roomId))
        .filter((room): room is Room => Boolean(room))
      : [],
    [lastReservation?.roomIds, lastReservation?.status, pricedRooms]
  );
  const catalogPanelRooms = useMemo(() => {
    const sourceRooms = lastReservation?.status !== "booked" ? visibleAvailableRooms : bookedReservationRooms;
    return sourceRooms.filter((room) => room.objectType !== "gazebo");
  }, [bookedReservationRooms, lastReservation?.status, visibleAvailableRooms]);
  const addOnSaleServiceRoom = useMemo(
    () => pricedRooms.find((room) => room.objectType === "sauna" && isRoomAvailableInBookingPanel(room)) ?? null,
    [pricedRooms]
  );
  const addOnSaleEndTime = useMemo(
    () => addHoursToTimeInput(addOnSaleStartTime, Math.max(2, addOnSaleHours)),
    [addOnSaleHours, addOnSaleStartTime]
  );
  const addOnSaleConflicts = useMemo(
    () => addOnSaleServiceRoom
      ? getHourlyRoomTimeConflicts(addOnSaleServiceRoom, reservations, addOnSaleDate, addOnSaleStartTime, addOnSaleEndTime)
      : [],
    [addOnSaleDate, addOnSaleEndTime, addOnSaleServiceRoom, addOnSaleStartTime, reservations]
  );
  const addOnSaleTotal = useMemo(
    () => addOnSaleServiceRoom ? calculateRoomStayPrice(addOnSaleServiceRoom, addOnSaleDate, addOnSaleDate, addOnSaleHours) : 0,
    [addOnSaleDate, addOnSaleHours, addOnSaleServiceRoom]
  );
  const activeMenuItems = useMemo(
    () => menuItems.filter((item) => item.title.trim()),
    [menuItems]
  );
  const selectedKitchenMenuItem = useMemo(
    () => activeMenuItems.find((item) => item.id === kitchenMenuItemId) ?? null,
    [activeMenuItems, kitchenMenuItemId]
  );
  const kitchenSaleTotal = useMemo(
    () => Math.max(0, kitchenPortions) * Math.max(0, kitchenUnitPrice),
    [kitchenPortions, kitchenUnitPrice]
  );
  const kitchenAddOnSales = useMemo(
    () => lastReservation
      ? reservations.filter((reservation) => reservation.isAddOnSale && reservation.parentReservationId === lastReservation.id && /^Кухня:/i.test(reservation.comment || ""))
      : [],
    [lastReservation, reservations]
  );
  const kitchenAddOnSalesTotal = useMemo(
    () => kitchenAddOnSales.reduce((sum, sale) => sum + (sale.total || 0), 0),
    [kitchenAddOnSales]
  );
  const catalogAvailabilitySummary = useMemo(
    () => lastReservation?.status === "booked"
      ? buildBookedCatalogSummary(bookedReservationRooms, lastReservation)
      : buildCatalogAvailabilitySummary(catalogPanelRooms, reservations, checkIn, checkOut, inventoryAirBeds, inventoryRollaways),
    [bookedReservationRooms, catalogPanelRooms, checkIn, checkOut, inventoryAirBeds, inventoryRollaways, lastReservation, reservations]
  );
  const pricePdfAvailabilitySummary = useMemo(() => {
    const availableRoomsForPrice = packageIncludeAmenities ? visibleAvailableRooms : visibleAvailableRooms.filter((room) => room.category !== "amenity");
    const selectedRoomIdSet = new Set(pricePdfRoomIds);
    const selectedRoomsForPrice = pricePdfRoomIds.length
      ? availableRoomsForPrice.filter((room) => selectedRoomIdSet.has(room.id))
      : availableRoomsForPrice;
    return buildCatalogAvailabilitySummary(selectedRoomsForPrice, reservations, checkIn, checkOut, inventoryAirBeds, inventoryRollaways);
  }, [checkIn, checkOut, inventoryAirBeds, inventoryRollaways, packageIncludeAmenities, pricePdfRoomIds, reservations, visibleAvailableRooms]);
  const selectedRoom = pricedRooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedBookingRooms = selectedBookingRoomIds
    .map((roomId) => pricedRooms.find((room) => room.id === roomId))
    .filter((room): room is Room => Boolean(room));
  const proposalRooms = selectedBookingRooms;
  const packageDiscountRoomPool = visibleAvailableRooms.filter((room) => isStayBookingObject(room) && isRoomIncludedInBookingSummary(room));
  const packageDiscountRequiredRooms = packageMinRooms > 0 ? packageMinRooms : packageDiscountRoomPool.length;
  const packageDiscountSelectedRooms = proposalRooms.filter((room) => isStayBookingObject(room) && isRoomIncludedInBookingSummary(room)).length;
  const isPackageDiscountEligible = packageDiscountPercent > 0 && packageDiscountRequiredRooms > 0 && packageDiscountSelectedRooms >= packageDiscountRequiredRooms;
  const isPeriodDiscountEligible = packagePeriodDiscountPercent > 0 && isDateRangeOverlapping(checkIn, checkOut, packagePeriodDiscountFrom, packagePeriodDiscountTo);
  const activeAutoDiscountPercent = Math.max(
    packageDiscountEnabled && isPackageDiscountEligible ? packageDiscountPercent : 0,
    isPeriodDiscountEligible ? packagePeriodDiscountPercent : 0
  );
  const selectedHourlyConflicts = useMemo(
    () => proposalRooms.flatMap((room) => isHourlyBookingObject(room) ? getHourlyRoomTimeConflicts(room, reservations, checkIn, checkInTime, checkOutTime) : []),
    [checkIn, checkInTime, checkOutTime, proposalRooms, reservations]
  );
  const hasHourlyBookingObject = proposalRooms.some(isHourlyBookingObject);
  const extraInventoryCount = airMattressCount + rollawayCount;
  const bookingTotals = calculateBookingTotalsWithRoomDates(proposalRooms, checkIn, checkOut, roomDateOverrides, needsExtraBed, extraInventoryByRoomId, extraInventoryCount, hourlyHours, discountPercent, breakfastIncluded, breakfastPricePerPerson);
  const effectiveBookingTotals = getEffectiveBookingTotals(bookingTotals, manualTotalAmount, discountPercent);
  const isManualSaleMode = manualSaleOpen;
  const isNewBookingChatMode = bookingNewChatOpen;
  const bookingPaymentAmount = isManualSaleMode ? effectiveBookingTotals.total : effectiveBookingTotals.prepayment;

  useEffect(() => {
    adminCommentValueRef.current = adminComment;
  }, [adminComment]);

  useEffect(() => {
    if (!lastReservation?.checkIn) return;
    setAddOnSaleDate(lastReservation.checkIn);
  }, [lastReservation?.id, lastReservation?.checkIn]);

  useEffect(() => {
    if (!hasHourlyBookingObject) return;
    const nextCheckOutTime = addHoursToTimeInput(checkInTime, hourlyHours);
    setCheckOutTime((currentTime) => currentTime === nextCheckOutTime ? currentTime : nextCheckOutTime);
  }, [checkInTime, hasHourlyBookingObject, hourlyHours]);

  useEffect(() => {
    if (hasHourlyBookingObject) return;
    setCheckOutTime((currentTime) => currentTime === DEFAULT_CHECK_OUT_TIME ? currentTime : DEFAULT_CHECK_OUT_TIME);
  }, [checkIn, checkOut, hasHourlyBookingObject, selectedBookingRoomIds]);

  useEffect(() => {
    chrome.storage.local.remove("gpb-guests");
    clearPendingContactSave();
    window.localStorage.removeItem(MANUAL_SALE_MODE_KEY);
    isRestoringChatDraftRef.current = true;
    setActiveChat(null);
    resetChatBookingDraft();
    setManualSaleOpen(false);
    waitForElement(() => document.querySelector<HTMLElement>("#main header"), 5000)
      .then(async () => {
        await closeActiveWhatsAppChat();
      })
      .finally(() => {
        setActiveChat(null);
        resetChatBookingDraft();
        setManualSaleOpen(false);
        window.setTimeout(() => {
          isRestoringChatDraftRef.current = false;
          setStartupCleanDone(true);
        }, 120);
      });

    getHealth()
      .then(() => setBackendState("online"))
      .catch(() => setBackendState("offline"));
  }, []);

  useEffect(() => {
    loadPanelRooms();
    loadReservations();
    loadPaymentSettings();
    loadGuestContacts();
    loadPanelExpenseEntries();
  }, []);

  useEffect(() => {
    const pendingContact = readPendingContactSave();
    if (!pendingContact) return;

    let isCancelled = false;
    setContactSaveState("saving");
    waitForElement(() => document.querySelector<HTMLElement>("#main header"), 10000).then(async (header) => {
      if (isCancelled) return;
      if (!header) {
        setContactSaveState("error");
        return;
      }

      const chat = createActiveChatFromProfile(pendingContact);
      const phoneParts = splitPhoneForInput(pendingContact.phone);
      if (chat) setActiveChat(chat);
      setGuestFirstName(pendingContact.name);
      setGuestPhonePrefix(phoneParts.prefix);
      setGuestPhone(phoneParts.local);
      setManualSaleOpen(true);
      window.localStorage.setItem(MANUAL_SALE_MODE_KEY, "true");
      const saved = await saveActiveWhatsAppContact(pendingContact.name, pendingContact.phone, { allowSidebar: true });
      if (chat) {
        await saveChatDraftForChat(chat, {
          agreementSent: false,
          guestFirstName: pendingContact.name,
          lastReservation: null,
          manualSaleOpen: true,
          phone: pendingContact.phone
        });
      }
      clearPendingContactSave();
      setContactSaveState(saved ? "saved" : "error");
      window.setTimeout(() => setContactSaveState("idle"), 2400);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lastReservation) {
      setAgreementSent(false);
    }
  }, [lastReservation]);

  useEffect(() => {
    let isActive = true;

    async function loadTodayWeather() {
      setTodayWeatherState({ status: "loading" });
      try {
        const forecast = await getWeatherForecastForDate(formatDateInput(new Date()), weatherLatitude, weatherLongitude);
        if (!isActive) return;
        setTodayWeatherState(
          forecast
            ? { status: "ready", forecast }
            : { status: "unavailable", message: "Прогноз на сегодня недоступен" }
        );
      } catch {
        if (isActive) setTodayWeatherState({ status: "error", message: "Погода временно недоступна" });
      }
    }

    loadTodayWeather();
    const intervalId = window.setInterval(loadTodayWeather, 30 * 60 * 1000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [weatherLatitude, weatherLongitude]);

  useEffect(() => {
    if (!startupCleanDone) return;

    let requestVersion = 0;
    const updateActiveChat = () => {
      if (suppressActiveChatSyncRef.current) return;
      const nextChat = detectActiveWhatsAppChat();
      setActiveChat((currentChat) => {
        if (suppressActiveChatSyncRef.current) return currentChat;
        if (!nextChat && currentChat?.phone && findVisibleProfilePanel()) {
          return currentChat;
        }
        return isSameDetectedChat(currentChat, nextChat) ? currentChat : nextChat;
      });
      const version = ++requestVersion;
      void detectActiveWhatsAppChatAsync().then((asyncChat) => {
        if (suppressActiveChatSyncRef.current || version !== requestVersion || !asyncChat) return;
        setActiveChat((currentChat) => isSameDetectedChat(currentChat, asyncChat) ? mergeDetectedChat(currentChat, asyncChat) : asyncChat);
      });
    };

    updateActiveChat();
    const intervalId = window.setInterval(updateActiveChat, 800);
    return () => window.clearInterval(intervalId);
  }, [startupCleanDone]);

  useEffect(() => {
    activeChatIdRef.current = activeChat?.id ?? "";
  }, [activeChat?.id, activeChat?.phone, activeChat?.title]);

  useEffect(() => {
    const storedContact = activeChat ? findStoredGuestContactForActiveChat(activeChat) : null;
    debugContactFlow("active-chat-detected", {
      activeChatId: activeChat?.id ?? "",
      activeChatTitle: activeChat?.title ?? "",
      activeChatPhone: activeChat?.phone ?? "",
      storedContactPhone: storedContact?.phone ?? "",
      storedContactAppeal: storedContact?.appeal ?? "",
      panelPhonePrefix: guestPhonePrefix,
      panelPhone: guestPhone,
      panelAppeal: guestFirstName,
      contactExtracted,
      contactSavedInWhatsApp,
      isManualSaleMode,
      isNewBookingChatMode
    });
  }, [activeChat?.id]);

  useEffect(() => {
    debugContactFlow("panel-contact-inputs-state", {
      activeChatId: activeChat?.id ?? "",
      activeChatTitle: activeChat?.title ?? "",
      activeChatPhone: activeChat?.phone ?? "",
      panelPhonePrefix: guestPhonePrefix,
      panelPhone: guestPhone,
      panelAppeal: guestFirstName,
      contactExtracted,
      contactSavedInWhatsApp,
      isManualSaleMode,
      isNewBookingChatMode
    });
  }, [guestPhonePrefix, guestPhone, guestFirstName, contactExtracted, contactSavedInWhatsApp, activeChat?.id, activeChat?.phone, activeChat?.title, bookingNewChatOpen]);

  useEffect(() => {
    if (suppressActiveChatSyncRef.current) return;
    if (!activeChat) {
      if (manualSaleOpen || bookingNewChatOpen) return;
      clearBookingContactFields();
      return;
    }

    let isCancelled = false;
    isRestoringChatDraftRef.current = true;
    const appliedBeforeRestore = applyStoredGuestContactForActiveChat(activeChat);
    const preserveRecentExtraction = shouldPreserveRecentlyExtractedContact();
    if (!appliedBeforeRestore && !preserveRecentExtraction && !shouldPreserveCurrentContactForActiveChat(activeChat)) {
      clearBookingContactFields();
    }
    getStoredChatDraftForActiveChat(activeChat).then((draft) => {
      if (isCancelled) return;
      if (draft) {
        restoreChatDraft(draft);
      } else {
        resetChatBookingDraft({ preserveContact: appliedBeforeRestore });
      }

      const applied = applyStoredGuestContactForActiveChat(activeChat);
      if (!applied && !shouldPreserveRecentlyExtractedContact() && !shouldPreserveCurrentContactForActiveChat(activeChat)) {
        clearBookingContactFields();
      }
      window.setTimeout(() => {
        if (isCancelled) return;
        isRestoringChatDraftRef.current = false;
      }, 0);
    });

    return () => {
      isCancelled = true;
      isRestoringChatDraftRef.current = false;
    };
  }, [activeChat?.id, activeChat?.phone, activeChat?.title, manualSaleOpen, bookingNewChatOpen]);

  useEffect(() => {
    if (!activeChat) return;
    applyStoredGuestContactForActiveChat(activeChat);
  }, [activeChat?.id, activeChat?.phone, activeChat?.title, guestContacts]);

  useEffect(() => {
    if (!activeChat || isRestoringChatDraftRef.current) return;

    if (saveChatDraftTimerRef.current) {
      window.clearTimeout(saveChatDraftTimerRef.current);
    }

    void saveCurrentChatDraft();
  }, [
    activeChat?.id,
    checkIn,
    checkInTime,
    checkOut,
    checkOutTime,
    bookingComment,
    adminComment,
    airMattressCount,
    defaultCheckInTime,
    extraBedType,
    extraInventoryByRoomId,
    roomDateOverrides,
    rollawayCount,
    breakfastIncluded,
    discountPercent,
    agreementSent,
    agreementEverSent,
    guestAdults,
    guestChildren,
    guestFirstName,
    guestPhone,
    guestPhonePrefix,
    hasPet,
    hourlyHours,
    lastReservation,
    manualSaleAmount,
    manualSaleComment,
    manualSaleOpen,
    manualSalePaymentMethod,
    manualSalePeriod,
    manualTotalAmount,
    needsExtraBed,
    prepaymentAlreadyPaid,
    selectedBookingRoomIds,
    selectedRoomId
  ]);

  async function loadPanelRooms() {
    const loadedRooms = mergeRooms(await getRooms());
    setRooms(loadedRooms);
    setSelectedRoomId((currentId) => currentId || loadedRooms[0]?.id || "");
  }

  async function loadReservations() {
    const loadedReservations = await getReservations();
    const processedReservations = await processNoShowReservations(loadedReservations);
    const repairedReservations = await repairReservationDatesFromChatDrafts(processedReservations);
    setReservations(repairedReservations);
  }

  async function repairReservationDatesFromChatDrafts(sourceReservations: Reservation[]) {
    const drafts = await getAllChatBookingDrafts();
    const repairedDrafts: Array<{ chatId: string; draft: ChatBookingDraft }> = [];
    const repairedReservations = sourceReservations.map((reservation) => {
      const matchingDraftEntry = Object.entries(drafts).find(([, draft]) => shouldExpandReservationDatesFromDraft(reservation, draft));
      if (!matchingDraftEntry) return reservation;

      const [chatId, draft] = matchingDraftEntry;
      const repairedReservation = expandReservationDatesFromDraft(reservation, draft);
      repairedDrafts.push({
        chatId,
        draft: {
          ...draft,
          checkIn: repairedReservation.checkIn,
          checkOut: repairedReservation.checkOut,
          lastReservation: repairedReservation,
          updatedAt: new Date().toISOString()
        }
      });
      void sendDebugLog("reservation-date-repaired-from-draft", {
        reservationId: reservation.id,
        oldCheckIn: reservation.checkIn,
        oldCheckOut: reservation.checkOut,
        draftCheckIn: draft.checkIn,
        draftCheckOut: draft.checkOut,
        nextCheckIn: repairedReservation.checkIn,
        nextCheckOut: repairedReservation.checkOut
      });
      return repairedReservation;
    });

    const hasChanges = repairedReservations.some((reservation, index) => reservation !== sourceReservations[index]);
    if (hasChanges) {
      await Promise.all([
        ...repairedReservations.map((reservation, index) => reservation === sourceReservations[index] ? Promise.resolve() : saveReservation(reservation)),
        ...repairedDrafts.map(({ chatId, draft }) => saveChatBookingDraft(chatId, draft))
      ]);
    }

    return repairedReservations;
  }

  async function loadGuestContacts() {
    try {
      setGuestContacts(await getGuestContacts());
    } catch {
      setGuestContacts([]);
    }
  }

  async function loadPanelExpenseEntries() {
    try {
      setExpenseEntries(await getExpenseEntries());
    } catch {
      setExpenseEntries([]);
    }
  }

  async function processNoShowReservations(sourceReservations: Reservation[]) {
    const today = formatDateInput(new Date());
    const processedReservations = sourceReservations.map((reservation) => {
      if (reservation.isAddOnSale) {
        if (reservation.status === "cancelled" && reservation.noShowAt) {
          return {
            ...reservation,
            status: "booked" as const,
            noShowAt: undefined
          };
        }
        return reservation;
      }

      if (
        reservation.status === "booked" &&
        !reservation.checkedInAt &&
        !reservation.noShowAt &&
        reservation.checkIn < today
      ) {
        return {
          ...reservation,
          status: "cancelled" as const,
          noShowAt: new Date().toISOString()
        };
      }

      return reservation;
    });

    const hasChanges = processedReservations.some((reservation, index) => reservation !== sourceReservations[index]);
    if (hasChanges) {
      await Promise.all(processedReservations.map((reservation) => saveReservation(reservation)));
    }

    return processedReservations;
  }

  async function loadPaymentSettings() {
    const settings = await getPaymentSettings();
    setPaymentLink(settings.paymentLink);
    setPaymentMethods({
      ...settings.paymentMethods,
      kaspi: settings.paymentMethods.kaspi || settings.paymentLink || ""
    });
    setLinkMethods(settings.linkMethods);
    setCompanyRequisites(settings.companyRequisites);
    setObjectGalleryPhotoPaths(settings.objectGalleryPhotoPaths);
    setObjectGalleryVideoPaths(settings.objectGalleryVideoPaths);
    setMenuItems(settings.menuItems);
    setPricePdfRoomIds(settings.pricePdfRoomIds);
    const storedPricePdfSummaryOptions = settings.pricePdfSummaryOptions.filter(isPricePdfSummaryOptionKey);
    setPricePdfSummaryOptions(
      storedPricePdfSummaryOptions.length
        ? ensurePricePdfSummaryOption(storedPricePdfSummaryOptions, "sleepingPlaces")
        : DEFAULT_PRICE_PDF_SUMMARY_OPTIONS
    );
    setPricePdfLinkIds(settings.pricePdfLinkIds);
    setIncludeGalleryInPricePdf(settings.pricePdfIncludeGallery);
    setPricePdfGroupPeriodTotals(settings.pricePdfGroupPeriodTotals);
    setQuickPhrases(settings.quickPhrases.length ? settings.quickPhrases : DEFAULT_QUICK_PHRASES);
    setCustomAmenityOptions(settings.customAmenityOptions);
    setCustomFoodOptions(settings.customFoodOptions);
    setCustomSleepingPlaceOptions(settings.customSleepingPlaceOptions);
    saveCustomCatalogOptionsToLocal(settings.customAmenityOptions, settings.customFoodOptions);
    setDefaultCheckInTime(settings.defaultCheckInTime);
    setWeatherLocationName(settings.weatherLocationName);
    setWeatherLatitude(settings.weatherLatitude);
    setWeatherLongitude(settings.weatherLongitude);
    setCustomHolidayDates(settings.customHolidayDates);
    saveCustomHolidayDatesToLocal(settings.customHolidayDates);
    setInventoryAirBeds(settings.inventoryAirBeds);
    setInventoryRollaways(settings.inventoryRollaways);
    setInventoryCustomFields(settings.inventoryCustomFields);
    setPackageDiscountPercent(settings.packageDiscountPercent);
    setPackagePeriodDiscountPercent(settings.packagePeriodDiscountPercent);
    setPackagePeriodDiscountFrom(settings.packagePeriodDiscountFrom);
    setPackagePeriodDiscountTo(settings.packagePeriodDiscountTo);
    setDynamicPricingEnabled(settings.dynamicPricingEnabled);
    setDynamicPricingMarginPercent(settings.dynamicPricingMarginPercent);
    setDynamicPricingSeasonEnd(settings.dynamicPricingSeasonEnd);
    setBreakfastPricePerPerson(settings.breakfastPricePerPerson);
    setPackageGiftText(settings.packageGiftText);
    setPackageMinRooms(settings.packageMinRooms);
    setPackageIncludeAmenities(settings.packageIncludeAmenities);
    setPackageCustomFields(settings.packageCustomFields);
    setServicePassword(settings.servicePassword);
  }

  function buildPaymentSettingsPatch(overrides: Partial<PaymentSettings> = {}) {
    return {
      paymentLink,
      paymentMethods,
      linkMethods,
      companyRequisites,
      objectGalleryPhotoPaths,
      objectGalleryVideoPaths,
      menuItems,
      pricePdfRoomIds,
      pricePdfSummaryOptions,
      pricePdfLinkIds,
      pricePdfIncludeGallery: includeGalleryInPricePdf,
      pricePdfGroupPeriodTotals,
      quickPhrases,
      customAmenityOptions,
      customFoodOptions,
      customSleepingPlaceOptions,
      defaultCheckInTime,
      defaultCheckOutTime: DEFAULT_CHECK_OUT_TIME,
      weatherLocationName,
      weatherLatitude,
      weatherLongitude,
      customHolidayDates,
      inventoryAirBeds,
      inventoryRollaways,
      inventoryCustomFields,
      packageDiscountPercent,
      packagePeriodDiscountPercent,
      packagePeriodDiscountFrom,
      packagePeriodDiscountTo,
      dynamicPricingEnabled,
      dynamicPricingMarginPercent,
      dynamicPricingSeasonEnd,
      breakfastPricePerPerson,
      packageGiftText,
      packageMinRooms,
      packageIncludeAmenities,
      packageCustomFields,
      servicePassword,
      ...overrides
    };
  }

  function buildChatDraft(): ChatBookingDraft {
    const phone = buildPhoneWithPrefix(guestPhone, guestPhonePrefix) || guestPhone;
    const draftCheckInTime = hasHourlyBookingObject ? checkInTime : defaultCheckInTime;
    const draftCheckOutTime = hasHourlyBookingObject ? checkOutTime : DEFAULT_CHECK_OUT_TIME;

    return {
      selectedRoomId,
      selectedBookingRoomIds,
      roomDateOverrides,
      checkIn,
      checkOut,
      checkInTime: draftCheckInTime,
      checkOutTime: draftCheckOutTime,
      comment: bookingComment,
      adminComment,
      guestFirstName,
      phone,
      adults: guestAdults,
      children: guestChildren,
      hasPet,
      extraBed: needsExtraBed,
      extraBedType,
      airMattressCount,
      rollawayCount,
      extraInventoryByRoomId,
      extraInventoryManual,
      hourlyHours,
      discountPercent,
      packageDiscountEnabled,
      breakfastIncluded,
      manualTotalAmount,
      manualSaleOpen,
      manualSaleAmount,
      manualSaleComment,
      manualSalePaymentMethod,
      manualSalePeriod,
      prepaymentAlreadyPaid,
      catalogStatus,
      catalogStatusAt,
      agreementSent,
      agreementEverSent,
      lastReservation,
      updatedAt: new Date().toISOString()
    };
  }

  async function saveCurrentChatDraft(patch: Partial<ChatBookingDraft> = {}) {
    if (!activeChat || isRestoringChatDraftRef.current) return;
    await saveChatDraftForChat(activeChat, patch);
  }

  async function saveChatDraftForChat(chat: ActiveChat, patch: Partial<ChatBookingDraft> = {}) {
    if (isRestoringChatDraftRef.current) return;
    const draft = reconcileDraftReservationDates({ ...buildChatDraft(), ...patch, updatedAt: new Date().toISOString() });
    await saveChatBookingDraft(chat.id, draft);
  }

  function updateGuestCount(type: "adults" | "children", value: number) {
    const nextValue = clampNumber(Math.round(value), 0, 99);
    if (type === "adults") {
      setGuestAdults(nextValue);
    } else {
      setGuestChildren(nextValue);
    }
    setAgreementSent(false);
  }

  async function getStoredChatDraftForActiveChat(chat: ActiveChat) {
    const draft = await getChatBookingDraft(chat.id);
    debugContactFlow("chat-draft-strict-restore", {
      activeChatId: chat.id,
      activeChatTitle: chat.title,
      activeChatPhone: chat.phone ?? "",
      found: Boolean(draft),
      draftGuest: draft?.guestFirstName ?? "",
      draftPhone: draft?.phone ?? "",
      draftReservationId: draft?.lastReservation?.id ?? ""
    });
    return draft;
  }

  function clearBookingContactFields() {
    debugContactFlow("panel-contact-inputs-clear", {
      activeChatId: activeChat?.id ?? "",
      activeChatTitle: activeChat?.title ?? "",
      activeChatPhone: activeChat?.phone ?? ""
    });
    setGuestFirstName("");
    setGuestPhone("");
    setGuestPhonePrefix("+7");
    setContactExtracted(false);
    setContactSavedInWhatsApp(false);
  }

  function shouldPreserveCurrentContactForActiveChat(chat: ActiveChat) {
    if (!contactExtracted) return false;

    const currentPhone = buildPhoneWithPrefix(guestPhone, guestPhonePrefix) || guestPhone;
    const normalizedCurrentPhone = normalizePhoneSearch(currentPhone);
    const normalizedChatPhone = normalizePhoneSearch(chat.phone);
    const normalizedCurrentAppeal = normalizeContactLookupText(guestFirstName);
    const normalizedChatTitle = normalizeContactLookupText(chat.title);

    return Boolean(
      (normalizedCurrentPhone && normalizedChatPhone && phonesMatchForContactLookup(normalizedCurrentPhone, normalizedChatPhone)) ||
      (normalizedCurrentAppeal && normalizedChatTitle && normalizedCurrentAppeal === normalizedChatTitle)
    );
  }

  function shouldPreserveRecentlyExtractedContact() {
    return Boolean(
      contactExtracted &&
      (guestPhone.trim() || guestFirstName.trim()) &&
      Date.now() - recentContactExtractionAtRef.current < 6000
    );
  }

  function applyBookingContactFromPhone(phone: string) {
    const normalizedPhone = formatPhoneDigits(phone);
    const phoneParts = splitPhoneForInput(normalizedPhone || phone);
    const fallbackName = getGuestNameFallbackFromPhone(normalizedPhone || phone);
    setGuestPhonePrefix(phoneParts.prefix);
    setGuestPhone(formatLocalPhoneInput(phoneParts.local));
    setGuestFirstName(fallbackName);
  }

  function applyStoredGuestContactForActiveChat(chat: ActiveChat) {
    const contact = findStoredGuestContactForActiveChat(chat);
    if (!contact) {
      debugContactFlow("panel-contact-apply-stored-miss", {
        activeChatId: chat.id,
        activeChatTitle: chat.title,
        activeChatPhone: chat.phone,
        knownContacts: guestContacts.length
      });
      return false;
    }

    const phoneParts = splitPhoneForInput(contact.phone);
    debugContactFlow("panel-contact-apply-stored-hit", {
      activeChatId: chat.id,
      activeChatTitle: chat.title,
      activeChatPhone: chat.phone,
      storedContactPhone: contact.phone,
      storedContactAppeal: contact.appeal
    });
    setGuestPhonePrefix(phoneParts.prefix);
    setGuestPhone(formatLocalPhoneInput(phoneParts.local));
    setGuestFirstName(contact.appeal);
    setContactExtracted(true);
    setContactSavedInWhatsApp(false);
    return true;
  }

  function findStoredGuestContactForActiveChat(chat: ActiveChat) {
    const normalizedPhone = normalizePhoneSearch(chat.phone || "");
    const normalizedTitle = normalizeContactLookupText(chat.title);

    return guestContacts.find((contact) => {
      const contactPhone = normalizePhoneSearch(contact.phone);
      const contactAppeal = normalizeContactLookupText(contact.appeal);
      return Boolean(
        (normalizedPhone && contactPhone && phonesMatchForContactLookup(normalizedPhone, contactPhone)) ||
        (normalizedTitle && contactAppeal && normalizedTitle === contactAppeal)
      );
    }) ?? null;
  }

  function restoreChatDraft(draft: ChatBookingDraft) {
    const restoredDraft = reconcileDraftReservationDates(draft);
    if (restoredDraft !== draft && activeChat) {
      void saveReservation(restoredDraft.lastReservation as Reservation);
      void saveChatBookingDraft(activeChat.id, {
        ...restoredDraft,
        updatedAt: new Date().toISOString()
      });
      setReservations((currentReservations) => currentReservations.map((reservation) =>
        reservation.id === restoredDraft.lastReservation?.id ? restoredDraft.lastReservation as Reservation : reservation
      ));
      void sendDebugLog("chat-draft-reservation-date-repaired-on-restore", {
        activeChatId: activeChat.id,
        reservationId: restoredDraft.lastReservation?.id ?? "",
        checkIn: restoredDraft.checkIn,
        checkOut: restoredDraft.checkOut
      });
    }
    draft = restoredDraft;
    const shouldKeepCurrentContact = !draft.phone && !draft.guestFirstName && contactExtracted && Boolean(guestPhone.trim() || guestFirstName.trim());
    const phoneParts = splitPhoneForInput(shouldKeepCurrentContact ? buildPhoneWithPrefix(guestPhone, guestPhonePrefix) || guestPhone : draft.phone);
    setSelectedRoomId(draft.selectedRoomId);
    setSelectedBookingRoomIds(draft.selectedBookingRoomIds);
    setRoomDateOverrides(draft.roomDateOverrides ?? buildRoomDateOverridesFromReservation(draft.lastReservation));
    setCheckIn(draft.checkIn);
    setCheckOut(draft.checkOut);
    setCheckInTime(draft.checkInTime || defaultCheckInTime);
    setCheckOutTime(draft.hourlyHours && draft.hourlyHours > 2 ? draft.checkOutTime || DEFAULT_CHECK_OUT_TIME : DEFAULT_CHECK_OUT_TIME);
    setBookingComment(draft.comment ?? "");
    setAdminComment(draft.adminComment ?? draft.lastReservation?.adminComment ?? "");
    setGuestAdults(clampNumber(Math.round(draft.adults ?? draft.lastReservation?.adults ?? 0), 0, 99));
    setGuestChildren(clampNumber(Math.round(draft.children ?? draft.lastReservation?.children ?? 0), 0, 99));
    if (!shouldKeepCurrentContact) setGuestFirstName(draft.guestFirstName);
    setGuestPhonePrefix(phoneParts.prefix);
    setGuestPhone(phoneParts.local);
    const draftExtraInventory = getDraftExtraInventoryCounts(draft);
    setHasPet(Boolean(draft.hasPet));
    setNeedsExtraBed(draft.extraBed);
    setExtraBedType(draft.extraBedType ?? "air-bed");
    setAirMattressCount(draftExtraInventory.airBeds);
    setRollawayCount(draftExtraInventory.rollaways);
    setExtraInventoryManual(Boolean(draft.extraInventoryManual));
    setExtraInventoryByRoomId(draft.extraInventoryByRoomId ?? buildExtraInventoryMapFromDraft(draft));
    setHourlyHours(Math.max(2, draft.hourlyHours ?? 2));
    setDiscountPercent(draft.discountPercent);
    setDiscountManualOverride(Boolean(draft.discountPercent && !draft.packageDiscountEnabled));
    setPackageDiscountEnabled(draft.packageDiscountEnabled ?? false);
    setPackageDiscountWasApplied(false);
    setBreakfastIncluded(draft.breakfastIncluded ?? true);
    setManualTotalAmount(draft.manualTotalAmount ?? 0);
    setManualSaleOpen(Boolean(draft.manualSaleOpen));
    setBookingNewChatOpen(false);
    setManualSaleAmount(draft.manualSaleAmount ?? 0);
    setManualSaleComment(draft.manualSaleComment ?? "");
    setManualSalePaymentMethod(draft.manualSalePaymentMethod ?? "");
    setManualSalePeriod(draft.manualSalePeriod ?? "day");
    setPrepaymentAlreadyPaid(Boolean(draft.prepaymentAlreadyPaid));
    setLastReservation(draft.lastReservation);
    setAgreementSent(Boolean(draft.agreementSent));
    setAgreementEverSent(Boolean(draft.agreementEverSent || draft.agreementSent));
    setCatalogStatus(draft.catalogStatus);
    setCatalogStatusAt(draft.catalogStatusAt ?? "");
    setSendState("idle");
  }

  function resetChatBookingDraft(options: { preserveContact?: boolean; preserveManualSale?: boolean } = {}) {
    setSelectedRoomId("");
    setSelectedBookingRoomIds([]);
    setRoomDateOverrides({});
    setCheckIn(getDefaultCheckInDate());
    setCheckOut(getDefaultCheckOutDate());
    setCheckInTime(defaultCheckInTime);
    setCheckOutTime(DEFAULT_CHECK_OUT_TIME);
    setBookingComment("");
    setAdminComment("");
    setGuestAdults(0);
    setGuestChildren(0);
    if (!options.preserveContact) {
      setGuestFirstName("");
      setGuestPhone("");
      setGuestPhonePrefix("+7");
    }
    setHasPet(false);
    setNeedsExtraBed(false);
    setExtraBedType("air-bed");
    setAirMattressCount(0);
    setRollawayCount(0);
    setExtraInventoryManual(false);
    setExtraInventoryByRoomId({});
    setHourlyHours(2);
    setDiscountPercent(0);
    setDiscountManualOverride(false);
    setBreakfastIncluded(true);
    setPackageDiscountEnabled(false);
    setPackageDiscountWasApplied(false);
    setManualTotalAmount(0);
    if (!options.preserveManualSale) {
      setManualSaleOpen(false);
      window.localStorage.removeItem(MANUAL_SALE_MODE_KEY);
    }
    setManualSaleAmount(0);
    setManualSaleComment("");
    setManualSalePaymentMethod("");
    setManualSalePeriod("day");
    setPrepaymentAlreadyPaid(false);
    setLastReservation(null);
    setAgreementSent(false);
    setAgreementEverSent(false);
    setCatalogStatus(undefined);
    setCatalogStatusAt("");
    setSendState("idle");
  }

  async function clearCurrentBooking() {
    const nextCheckIn = getDefaultCheckInDate();
    const nextCheckOut = getDefaultCheckOutDate();
    setClearBookingState("clearing");
    if (saveChatDraftTimerRef.current) {
      window.clearTimeout(saveChatDraftTimerRef.current);
    }
    setSelectedBookingRoomIds([]);
    setRoomDateOverrides({});
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    setCheckInTime(defaultCheckInTime);
    setCheckOutTime(DEFAULT_CHECK_OUT_TIME);
    setBookingComment("");
    setAdminComment("");
    setGuestAdults(0);
    setGuestChildren(0);
    setHasPet(false);
    setNeedsExtraBed(false);
    setExtraBedType("air-bed");
    setAirMattressCount(0);
    setRollawayCount(0);
    setExtraInventoryManual(false);
    setExtraInventoryByRoomId({});
    setDiscountPercent(0);
    setDiscountManualOverride(false);
    setPackageDiscountEnabled(false);
    setPackageDiscountWasApplied(false);
    setManualTotalAmount(0);
    setManualSaleOpen(false);
    window.localStorage.removeItem(MANUAL_SALE_MODE_KEY);
    setPrepaymentAlreadyPaid(false);
    setLastReservation(null);
    setAgreementSent(false);
    setCatalogStatus(undefined);
    setCatalogStatusAt("");
    setSendState("idle");
    if (activeChat) {
      await saveChatBookingDraft(activeChat.id, {
        selectedRoomId,
        selectedBookingRoomIds: [],
        roomDateOverrides: {},
        checkIn: nextCheckIn,
        checkOut: nextCheckOut,
        checkInTime: defaultCheckInTime,
        checkOutTime: DEFAULT_CHECK_OUT_TIME,
        comment: "",
        adminComment: "",
        guestFirstName,
        phone: buildPhoneWithPrefix(guestPhone, guestPhonePrefix) || guestPhone,
        adults: 0,
        children: 0,
        hasPet: false,
        extraBed: false,
        extraBedType: "air-bed",
        airMattressCount: 0,
        rollawayCount: 0,
        extraInventoryByRoomId: {},
        extraInventoryManual: false,
        hourlyHours: 2,
        discountPercent: 0,
        manualTotalAmount: 0,
        manualSaleOpen: false,
        manualSaleAmount: 0,
        manualSaleComment: "",
        manualSalePaymentMethod: "",
        manualSalePeriod: "day",
        prepaymentAlreadyPaid: false,
        catalogStatus: undefined,
        catalogStatusAt: undefined,
        agreementSent: false,
        agreementEverSent,
        lastReservation: null,
        updatedAt: new Date().toISOString()
      });
    }
    setClearBookingState("cleared");
    window.setTimeout(() => setClearBookingState("idle"), 1800);
  }

  useEffect(() => {
    setSelectedRoomId((currentId) => rooms.some((room) => room.id === currentId) ? currentId : availableRooms[0]?.id || "");
    setSelectedBookingRoomIds((currentIds) => currentIds.filter((roomId) => rooms.some((room) => room.id === roomId)));
  }, [availableRooms, rooms]);

  useEffect(() => {
    const visibleIds = new Set(catalogPanelRooms.map((room) => room.id));
    setSelectedRoomId((currentId) => visibleIds.has(currentId) ? currentId : catalogPanelRooms[0]?.id || "");
    setSelectedBookingRoomIds((currentIds) => currentIds.filter((roomId) => visibleIds.has(roomId)));
  }, [catalogPanelRooms]);

  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove("gpb-booking-panel-open");
      document.documentElement.style.removeProperty("--gpb-booking-panel-width");
      return;
    }

    document.body.classList.add("gpb-booking-panel-open");
    document.documentElement.style.setProperty("--gpb-booking-panel-width", `${width}px`);

    return () => {
      document.body.classList.remove("gpb-booking-panel-open");
      document.documentElement.style.removeProperty("--gpb-booking-panel-width");
    };
  }, [isOpen, width]);

  const statusText = useMemo(() => {
    if (backendState === "online") return "API online";
    if (backendState === "offline") return "API offline";
    return "Проверка API";
  }, [backendState]);
  const hasBookingSelection = Boolean(selectedBookingRooms.length);
  const currentReservationDraft = hasBookingSelection ? buildReservationDraft(lastReservation?.status ?? "pending") : null;
  const hasSelectedHourlyConflict = selectedHourlyConflicts.length > 0;
  const canSendAgreementText = Boolean(currentReservationDraft && !hasSelectedHourlyConflict);
  const canConfirmAgreement = Boolean(currentReservationDraft && currentReservationDraft.status !== "cancelled" && !hasSelectedHourlyConflict);
  const isBookingConfirmed = lastReservation?.status === "booked";
  const isBookingLocked = isBookingConfirmed;
  const contactMatchesActiveChatName = Boolean(
    activeChat?.title &&
    guestFirstName.trim() &&
    normalizeContactLookupText(activeChat.title) === normalizeContactLookupText(guestFirstName)
  );
  const isContactRowLocked = isBookingLocked || (contactSavedInWhatsApp && contactMatchesActiveChatName);

  useEffect(() => {
    if (isBookingLocked || manualTotalAmount > 0 || discountManualOverride) return;

    if (activeAutoDiscountPercent > 0) {
      setDiscountPercent((currentDiscount) => {
        if (currentDiscount === activeAutoDiscountPercent) return currentDiscount;
        return activeAutoDiscountPercent;
      });
      setPackageDiscountWasApplied(true);
      setAgreementSent(false);
      return;
    }

    if (packageDiscountWasApplied) {
      setDiscountPercent((currentDiscount) => currentDiscount === packageDiscountPercent || currentDiscount === packagePeriodDiscountPercent ? 0 : currentDiscount);
      setPackageDiscountWasApplied(false);
      setAgreementSent(false);
    }
  }, [
    activeAutoDiscountPercent,
    checkIn,
    checkOut,
    discountManualOverride,
    isBookingLocked,
    isPackageDiscountEligible,
    isPeriodDiscountEligible,
    manualTotalAmount,
    packageDiscountEnabled,
    packageDiscountPercent,
    packagePeriodDiscountPercent,
    packagePeriodDiscountFrom,
    packagePeriodDiscountTo,
    packageDiscountRequiredRooms,
    packageDiscountSelectedRooms,
    packageDiscountWasApplied
  ]);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;

    function onMove(moveEvent: PointerEvent) {
      const nextWidth = startWidth + startX - moveEvent.clientX;
      setWidth(Math.min(getMaxPanelWidth(), Math.max(MIN_WIDTH, nextWidth)));
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function sendSelectedRoomToWhatsApp() {
    const roomsToSend = selectedBookingRooms.length ? selectedBookingRooms : selectedRoom ? [selectedRoom] : [];
    if (!roomsToSend.length) return;

    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      let allSent = true;
      for (let index = 0; index < roomsToSend.length; index += 1) {
        const room = roomsToSend[index];
        const readyInput = await waitForElement(findWhatsAppMessageInput, 10000);
        if (!readyInput) {
          allSent = false;
          break;
        }

        const sent = await sendRoomToActiveWhatsAppChat(room, defaultCheckInTime, DEFAULT_CHECK_OUT_TIME, checkIn);
        if (!sent) {
          allSent = false;
        }

        if (index < roomsToSend.length - 1) {
          await waitForElement(findWhatsAppMessageInput, 10000);
          await waitForDelay(2200);
        }
      }
      if (allSent) {
        await markCatalogStatus("room-sent");
      }
      setSendState(allSent ? "sent" : "error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendSelectedRoomPhotosToWhatsApp() {
    if (!selectedRoom?.photoPaths.length) return;

    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const sent = await sendRoomPhotosToActiveWhatsAppChat(selectedRoom, defaultCheckInTime, DEFAULT_CHECK_OUT_TIME, checkIn);
      if (sent) {
        await markCatalogStatus("room-sent");
      }
      setSendState(sent ? "sent" : "error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  function togglePricePdfSummaryOption(option: PricePdfSummaryOptionKey) {
    const nextOptions = pricePdfSummaryOptions.includes(option)
      ? pricePdfSummaryOptions.filter((item) => item !== option)
      : pricePdfSummaryOptions.concat(option);
    setPricePdfSummaryOptions(nextOptions);
    void savePaymentSettings(buildPaymentSettingsPatch({ pricePdfSummaryOptions: nextOptions }));
  }

  function openPricePdfOptions() {
    const availableRoomsForPrice = packageIncludeAmenities ? visibleAvailableRooms : visibleAvailableRooms.filter((room) => room.category !== "amenity");
    const availableRoomIds = new Set(availableRoomsForPrice.map((room) => room.id));
    const savedRoomIds = pricePdfRoomIds.filter((roomId) => availableRoomIds.has(roomId));
    const nextRoomIds = savedRoomIds.length ? savedRoomIds : availableRoomsForPrice.map((room) => room.id);
    setPricePdfRoomIds(nextRoomIds);
    setIsPricePdfOptionsOpen(true);
  }

  function togglePricePdfRoom(roomId: string) {
    const nextRoomIds = pricePdfRoomIds.includes(roomId) ? pricePdfRoomIds.filter((id) => id !== roomId) : pricePdfRoomIds.concat(roomId);
    setPricePdfRoomIds(nextRoomIds);
    void savePaymentSettings(buildPaymentSettingsPatch({ pricePdfRoomIds: nextRoomIds }));
  }

  function movePricePdfRoom(targetRoomId: string) {
    if (!draggedPricePdfRoomId || draggedPricePdfRoomId === targetRoomId) {
      setDraggedPricePdfRoomId("");
      return;
    }

    const nextRoomIds = pricePdfRoomIds.slice();
    const draggedIndex = nextRoomIds.indexOf(draggedPricePdfRoomId);
    const targetIndex = nextRoomIds.indexOf(targetRoomId);
    if (draggedIndex >= 0 && targetIndex >= 0) {
      const [draggedId] = nextRoomIds.splice(draggedIndex, 1);
      nextRoomIds.splice(targetIndex, 0, draggedId);
      setPricePdfRoomIds(nextRoomIds);
      void savePaymentSettings(buildPaymentSettingsPatch({ pricePdfRoomIds: nextRoomIds }));
    }
    setDraggedPricePdfRoomId("");
  }

  function handlePricePdfIncludeGalleryChange(value: boolean) {
    setIncludeGalleryInPricePdf(value);
    void savePaymentSettings(buildPaymentSettingsPatch({ pricePdfIncludeGallery: value }));
  }

  function handlePricePdfGroupPeriodTotalsChange(value: boolean) {
    setPricePdfGroupPeriodTotals(value);
    void savePaymentSettings(buildPaymentSettingsPatch({ pricePdfGroupPeriodTotals: value }));
  }

  function togglePricePdfLink(methodId: string) {
    const nextLinkIds = pricePdfLinkIds.includes(methodId)
      ? pricePdfLinkIds.filter((id) => id !== methodId)
      : pricePdfLinkIds.concat(methodId);
    setPricePdfLinkIds(nextLinkIds);
    void savePaymentSettings(buildPaymentSettingsPatch({ pricePdfLinkIds: nextLinkIds }));
  }

  async function copyPricePdfLink(value: string) {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
    } catch {
      const input = document.createElement("textarea");
      input.value = value.trim();
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  function downloadPdfFile(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadImageBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openExternalPricePdfOptions() {
    setPricePdfMode("external");
    suppressActiveChatSyncRef.current = true;
    setActiveChat(null);
    setGuestFirstName("");
    setGuestPhone("");
    setGuestPhonePrefix("+7");
    openPricePdfOptions();
    window.setTimeout(() => {
      suppressActiveChatSyncRef.current = false;
    }, 800);
  }

  function toggleSocialPriceRoom(roomId: string) {
    setSocialPriceRoomIds((current) => current.includes(roomId) ? current.filter((id) => id !== roomId) : current.concat(roomId));
  }

  async function downloadSocialPriceImage() {
    const availableRoomsForPrice = packageIncludeAmenities ? visibleAvailableRooms : visibleAvailableRooms.filter((room) => room.category !== "amenity");
    const roomById = new Map(availableRoomsForPrice.map((room) => [room.id, room]));
    const selectedRooms = socialPriceRoomIds.map((roomId) => roomById.get(roomId)).filter((room): room is Room => Boolean(room));
    if (!selectedRooms.length) return;
    const blob = await createSocialPriceImageBlob({
      checkIn,
      checkOut,
      description: socialPriceDescription,
      groupPeriodTotals: pricePdfGroupPeriodTotals,
      periodDiscountFrom: packagePeriodDiscountFrom,
      periodDiscountPercent: packagePeriodDiscountPercent,
      periodDiscountTo: packagePeriodDiscountTo,
      rooms: selectedRooms
    });
    downloadImageBlob(blob, `price-story-${checkIn || formatDateInput(new Date())}.png`);
  }

  async function downloadSocialPriceImagesFromPdfSelection() {
    const availableRoomsForPrice = packageIncludeAmenities ? visibleAvailableRooms : visibleAvailableRooms.filter((room) => room.category !== "amenity");
    const roomById = new Map(availableRoomsForPrice.map((room) => [room.id, room]));
    const selectedRooms = pricePdfRoomIds.map((roomId) => roomById.get(roomId)).filter((room): room is Room => Boolean(room));
    if (!selectedRooms.length) return;

    setSendState("sending");
    try {
      for (const [index, room] of selectedRooms.entries()) {
        const blob = await createSocialPriceRoomImageBlob({
          checkIn,
          checkOut,
          description: packageGiftText,
          groupPeriodTotals: pricePdfGroupPeriodTotals,
          periodDiscountFrom: packagePeriodDiscountFrom,
          periodDiscountPercent: packagePeriodDiscountPercent,
          periodDiscountTo: packagePeriodDiscountTo,
          room
        });
        const label = (formatBookingPickerObjectLabel(room) || `object-${index + 1}`).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
        downloadImageBlob(blob, `story-${checkIn || formatDateInput(new Date())}-${label || index + 1}.png`);
        if (selectedRooms.length > 1) await waitForDelay(180);
      }
      setSendState("sent");
    } catch {
      setSendState("error");
    } finally {
      window.setTimeout(() => setSendState("idle"), 1800);
    }
  }

  async function sendPriceProposalToWhatsApp(summaryOptions = pricePdfSummaryOptions, mode: "chat" | "external" = pricePdfMode) {
    const availableRoomsForPrice = packageIncludeAmenities ? visibleAvailableRooms : visibleAvailableRooms.filter((room) => room.category !== "amenity");
    const roomById = new Map(availableRoomsForPrice.map((room) => [room.id, room]));
    const proposalRooms = pricePdfRoomIds.map((roomId) => roomById.get(roomId)).filter((room): room is Room => Boolean(room));
    if (!proposalRooms.length) return;

    setIsPricePdfOptionsOpen(false);
    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const pdfFile = await createPriceProposalPdfFile({
        availabilitySummary: buildCatalogAvailabilitySummary(proposalRooms, reservations, checkIn, checkOut, inventoryAirBeds, inventoryRollaways),
        checkIn,
        checkOut,
        checkInTime: defaultCheckInTime,
        checkOutTime: DEFAULT_CHECK_OUT_TIME,
        discountPercent: packageDiscountPercent,
        giftText: packageGiftText,
        galleryPhotoPaths: objectGalleryPhotoPaths,
        galleryVideoPaths: objectGalleryVideoPaths,
        groupPeriodTotals: pricePdfGroupPeriodTotals,
        includeGallery: includeGalleryInPricePdf,
        linkMethods,
        linkIds: pricePdfLinkIds,
        minRooms: packageMinRooms,
        mode: "available",
        rooms: proposalRooms,
        summaryOptions
      });
      if (mode === "external") {
        downloadPdfFile(pdfFile);
        setSendState("sent");
        return;
      }
      const sent = await sendFileToActiveWhatsAppChat(pdfFile, `Прайс на ${formatKazakhDate(checkIn)}`);
      if (sent) await markCatalogStatus("price-sent");
      setSendState(sent ? "sent" : "error");
    } catch {
      setSendState("error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendPriceStoryToWhatsApp(items: Array<{ blob: Blob; name: string }>) {
    if (!items.length) return;
    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const files = items.map((item) => new File([item.blob], item.name, { type: item.blob.type || "image/png" }));
      const sent = await sendMediaFilesToActiveWhatsAppChat(files, `Прайс на ${formatKazakhDate(checkIn)}`);
      if (sent) await markCatalogStatus("price-sent");
      setSendState(sent ? "sent" : "error");
    } catch {
      setSendState("error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendBookingPriceProposalToWhatsApp() {
    if (!currentReservationDraft || !selectedBookingRooms.length) return;
    if (hasSelectedHourlyConflict) return;

    const proposalRooms = selectedBookingRooms;
    const giftLines = [packageGiftText].filter(Boolean);

    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const pdfFile = await createPriceProposalPdfFile({
        checkIn,
        checkOut,
        checkInTime,
        checkOutTime,
        discountPercent,
        giftText: giftLines.join("\n"),
        minRooms: 0,
        mode: "booking",
        reservation: currentReservationDraft,
        rooms: proposalRooms
      });
      const sent = await sendFileToActiveWhatsAppChat(
        pdfFile,
        `Предложение на согласование на ${formatKazakhDate(checkIn)}. В PDF выбранные объекты, фото, цены и условия.`
      );
      if (sent) {
        setLastReservation(currentReservationDraft);
        setAgreementSent(true);
        setAgreementEverSent(true);
        await ensureGuestContactForReservation(currentReservationDraft);
        await saveAgreementDraftForReservation(currentReservationDraft);
      }
      setSendState(sent ? "sent" : "error");
    } catch {
      setSendState("error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendSelectedRoomVideoToWhatsApp() {
    if (!selectedRoom?.videoPaths.length) return;

    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const sent = await sendRoomVideoToActiveWhatsAppChat(selectedRoom);
      if (sent) {
        await markCatalogStatus("room-sent");
      }
      setSendState(sent ? "sent" : "error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendObjectGalleryPhotosToWhatsApp() {
    if (!objectGalleryPhotoPaths.length) return;
    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const photoFiles = await Promise.all(objectGalleryPhotoPaths.map((path) => createFileFromMediaPath(path)));
      const files = photoFiles.filter((file): file is File => Boolean(file));
      const sent = files.length
        ? await sendMediaFilesToActiveWhatsAppChat(files, "Галерея объекта")
        : false;
      if (sent) {
        await markCatalogStatus("price-sent");
      }
      setSendState(sent ? "sent" : "error");
    } catch {
      setSendState("error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendObjectGalleryVideosToWhatsApp() {
    if (!objectGalleryVideoPaths.length) return;

    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const videoFiles = await Promise.all(objectGalleryVideoPaths.map((path) => createRawMediaFileFromPath(path)));
      const files = videoFiles.filter((file): file is File => Boolean(file));
      const sent = files.length
        ? await sendMediaFilesToActiveWhatsAppChat(files, "Видео объекта")
        : false;
      if (sent) {
        await markCatalogStatus("price-sent");
      }
      setSendState(sent ? "sent" : "error");
    } catch {
      setSendState("error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendMenuPdfToWhatsApp() {
    if (!activeMenuItems.length) return;

    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const pdfFile = await createMenuPdfFile(activeMenuItems);
      const sent = await sendFileToActiveWhatsAppChat(pdfFile, "Меню Green Pine Burabay");
      if (sent) {
        await markCatalogStatus("price-sent");
      }
      setSendState(sent ? "sent" : "error");
    } catch {
      setSendState("error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendRoomPhotoFromCard(room: Room) {
    if (!room.photoPaths.length || isBookingConfirmed) return;

    suppressActiveChatSyncRef.current = true;
    setSelectedRoomId(room.id);
    setSendState("sending");
    try {
      const sent = await sendRoomToActiveWhatsAppChat(room, defaultCheckInTime, DEFAULT_CHECK_OUT_TIME, checkIn);
      if (sent) {
        await markCatalogStatus("room-sent", { selectedRoomId: room.id });
      }
      setSendState(sent ? "sent" : "error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function sendRoomVideoFromCard(room: Room) {
    if (!room.videoPaths.length || isBookingConfirmed) return;

    suppressActiveChatSyncRef.current = true;
    setSelectedRoomId(room.id);
    setSendState("sending");
    try {
      const sent = await sendRoomVideoToActiveWhatsAppChat(room);
      if (sent) {
        await markCatalogStatus("room-sent", { selectedRoomId: room.id });
      }
      setSendState(sent ? "sent" : "error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function markCatalogStatus(catalogStatus: NonNullable<ChatBookingDraft["catalogStatus"]>, patch: Partial<ChatBookingDraft> = {}) {
    const nextCatalogStatusAt = new Date().toISOString();
    const phone = buildPhoneWithPrefix(guestPhone, guestPhonePrefix) || guestPhone;
    const chat = activeChat ?? createActiveChatFromProfile({ name: guestFirstName || phone, phone });
    const currentCheckInTime = hasHourlyBookingObject ? checkInTime : defaultCheckInTime;
    const currentCheckOutTime = hasHourlyBookingObject ? checkOutTime : DEFAULT_CHECK_OUT_TIME;
    setCatalogStatus(catalogStatus);
    setCatalogStatusAt(nextCatalogStatusAt);
    setAgreementSent(false);
    setAgreementEverSent(false);
    setLastReservation(null);
    if (phone && guestFirstName) {
      await saveContactToDatabase(guestFirstName, formatPhoneDigits(phone));
    }
    if (!chat) return;
    await saveChatDraftForChat(chat, {
      agreementEverSent: false,
      agreementSent: false,
      catalogStatus,
      catalogStatusAt: nextCatalogStatusAt,
      checkIn,
      checkOut,
      checkInTime: currentCheckInTime,
      checkOutTime: currentCheckOutTime,
      selectedRoomId,
      selectedBookingRoomIds,
      lastReservation: null,
      ...patch
    });
  }

  function handleCheckInChange(value: string) {
    setCheckIn(value);
    if (value) {
      setCheckOut(formatDateInput(addDays(parseDateInput(value), 1)));
    }
    setManualTotalAmount(0);
    setLastReservation(null);
    setAgreementSent(false);
  }

  function handleCheckOutChange(value: string) {
    if (checkIn && value && parseDateInput(value) <= parseDateInput(checkIn)) {
      setCheckOut(formatDateInput(addDays(parseDateInput(checkIn), 1)));
    } else {
      setCheckOut(value);
    }
    setManualTotalAmount(0);
    setLastReservation(null);
    setAgreementSent(false);
  }

  function toggleBookingRoom(roomId: string) {
    if (lastReservation?.status === "booked") {
      setSelectedRoomId(roomId);
      return;
    }

    setSelectedBookingRoomIds((currentIds) => {
      const nextIds = currentIds.includes(roomId) ? currentIds.filter((id) => id !== roomId) : currentIds.concat(roomId);
      return nextIds;
    });
    setSelectedRoomId(roomId);
    setManualTotalAmount(0);
    setLastReservation(null);
    setAgreementSent(false);
  }

  function updateExtraInventoryTotals(nextMap: Record<string, { airBeds: number; rollaways: number }>) {
    const nextAirBeds = Object.values(nextMap).reduce((sum, item) => sum + Math.max(0, item.airBeds || 0), 0);
    const nextRollaways = Object.values(nextMap).reduce((sum, item) => sum + Math.max(0, item.rollaways || 0), 0);
    const nextTotal = nextAirBeds + nextRollaways;
    setAirMattressCount(nextAirBeds);
    setRollawayCount(nextRollaways);
    setExtraBedType(nextRollaways > 0 && nextAirBeds === 0 ? "rollaway" : "air-bed");
    setNeedsExtraBed(nextTotal > 0);
    setExtraInventoryManual(nextTotal > 0);
    setManualTotalAmount(0);
    setLastReservation(null);
    setAgreementSent(false);
  }

  function addExtraInventoryFromCard(roomId: string, nextType: ExtraBedType) {
    const availableCount = nextType === "rollaway" ? availableExtraInventory.rollaways : availableExtraInventory.airBeds;
    const currentCount = nextType === "rollaway" ? rollawayCount : airMattressCount;
    if (currentCount >= availableCount) {
      setExtraInventoryPickerRoomId("");
      return;
    }

    setSelectedBookingRoomIds((currentIds) => currentIds.includes(roomId) ? currentIds : currentIds.concat(roomId));
    setSelectedRoomId(roomId);
    setExtraInventoryByRoomId((currentMap) => {
      const currentRoomItem = currentMap[roomId] ?? { airBeds: 0, rollaways: 0 };
      const nextMap = {
        ...currentMap,
        [roomId]: {
          airBeds: currentRoomItem.airBeds + (nextType === "air-bed" ? 1 : 0),
          rollaways: currentRoomItem.rollaways + (nextType === "rollaway" ? 1 : 0)
        }
      };
      updateExtraInventoryTotals(nextMap);
      return nextMap;
    });
    setExtraInventoryPickerRoomId("");
  }

  function removeExtraInventoryTypeFromCard(roomId: string, type: ExtraBedType) {
    const currentItem = extraInventoryByRoomId[roomId];
    if (!currentItem) return;

    const nextItem = {
      airBeds: type === "air-bed" ? 0 : currentItem.airBeds,
      rollaways: type === "rollaway" ? 0 : currentItem.rollaways
    };
    const nextMap = { ...extraInventoryByRoomId };
    if (nextItem.airBeds || nextItem.rollaways) {
      nextMap[roomId] = nextItem;
    } else {
      delete nextMap[roomId];
    }
    setExtraInventoryByRoomId(nextMap);
    updateExtraInventoryTotals(nextMap);
    setExtraInventoryPickerRoomId("");
  }

  function updateDiscountPercent(nextDiscountPercent: number) {
    setDiscountPercent(clampNumber(nextDiscountPercent, 0, 100));
    setDiscountManualOverride(true);
    setPackageDiscountWasApplied(false);
    setManualTotalAmount(0);
    setLastReservation(null);
    setAgreementSent(false);
  }

  function togglePackageDiscount(enabled: boolean) {
    setDiscountManualOverride(false);
    setPackageDiscountEnabled(enabled);
    if (enabled && isPackageDiscountEligible && manualTotalAmount <= 0) {
      setDiscountPercent(packageDiscountPercent);
      setPackageDiscountWasApplied(true);
    } else if (!enabled && packageDiscountWasApplied) {
      setDiscountPercent((currentDiscount) => currentDiscount === packageDiscountPercent ? 0 : currentDiscount);
      setPackageDiscountWasApplied(false);
    }
    setManualTotalAmount(0);
    setLastReservation(null);
    setAgreementSent(false);
  }

  function updateManualTotalAmount(nextAmount: number) {
    const safeAmount = Math.max(0, nextAmount);
    setManualTotalAmount(safeAmount);
    if (safeAmount > 0 && bookingTotals.subtotal > 0) {
      const nextDiscountAmount = Math.max(0, bookingTotals.subtotal - safeAmount);
      setDiscountPercent(clampNumber(Math.round(nextDiscountAmount * 100 / bookingTotals.subtotal), 0, 100));
    }
    setLastReservation(null);
    setAgreementSent(false);
  }

  async function handleDefaultCheckInTimeChange(value: string) {
    setDefaultCheckInTime(value);
    setCheckInTime(value);
    setLastReservation(null);
    setAgreementSent(false);
    await savePaymentSettings(buildPaymentSettingsPatch({ defaultCheckInTime: value }));
  }

  async function handlePaymentMethodChange(methodId: string, value: string) {
    const nextMethods = { ...paymentMethods, [methodId]: value };
    setPaymentMethods(nextMethods);
    const nextPaymentLink = methodId === "kaspi" ? value : paymentLink;
    setPaymentLink(nextPaymentLink);
    setLastReservation(null);
    setAgreementSent(false);
    await savePaymentSettings(buildPaymentSettingsPatch({ paymentLink: nextPaymentLink, paymentMethods: nextMethods }));
  }

  async function handlePaymentMethodDelete(methodId: string) {
    const nextMethods = removeRecordKey(paymentMethods, methodId);
    setPaymentMethods(nextMethods);
    await savePaymentSettings(buildPaymentSettingsPatch({ paymentMethods: nextMethods }));
  }

  async function handlePaymentSettingsSave() {
    await savePaymentSettings(buildPaymentSettingsPatch({ paymentLink, paymentMethods }));
  }

  async function handleLinkMethodChange(methodId: string, value: string) {
    const nextMethods = { ...linkMethods, [methodId]: value };
    setLinkMethods(nextMethods);
    await savePaymentSettings(buildPaymentSettingsPatch({ linkMethods: nextMethods }));
  }

  async function handleLinkMethodDelete(methodId: string) {
    const nextMethods = removeRecordKey(linkMethods, methodId);
    setLinkMethods(nextMethods);
    await savePaymentSettings(buildPaymentSettingsPatch({ linkMethods: nextMethods }));
  }

  async function handleLinkSettingsSave() {
    await savePaymentSettings(buildPaymentSettingsPatch({ linkMethods }));
  }

  async function handleCompanyRequisiteChange(fieldId: string, value: string) {
    const nextRequisites = { ...companyRequisites, [fieldId]: value };
    setCompanyRequisites(nextRequisites);
    await savePaymentSettings(buildPaymentSettingsPatch({ companyRequisites: nextRequisites }));
  }

  async function handleCompanyRequisiteDelete(fieldId: string) {
    const nextRequisites = removeRecordKey(companyRequisites, fieldId);
    setCompanyRequisites(nextRequisites);
    await savePaymentSettings(buildPaymentSettingsPatch({ companyRequisites: nextRequisites }));
  }

  async function handleCompanyRequisitesSave() {
    await savePaymentSettings(buildPaymentSettingsPatch({ companyRequisites }));
  }

  async function handleObjectGalleryUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    const hasVideo = files.some((file) => file.type.startsWith("video/"));
    setObjectGalleryUploadState({
      message: hasVideo ? "Загружаю и обрабатываю видео. Не закрывайте страницу." : "Загружаю фото...",
      status: "uploading"
    });

    try {
      const uploaded = await Promise.all(files.map((file) => uploadObjectGalleryMedia(file)));
      const nextPhotoPaths = objectGalleryPhotoPaths.concat(uploaded.filter((item) => item.mediaType === "photo").map((item) => item.path));
      const nextVideoPaths = objectGalleryVideoPaths.concat(uploaded.filter((item) => item.mediaType === "video").map((item) => item.path));
      setObjectGalleryPhotoPaths(nextPhotoPaths);
      setObjectGalleryVideoPaths(nextVideoPaths);
      await savePaymentSettings(buildPaymentSettingsPatch({
        objectGalleryPhotoPaths: nextPhotoPaths,
        objectGalleryVideoPaths: nextVideoPaths
      }));
      setObjectGalleryUploadState({ message: "", status: "idle" });
    } catch (error) {
      setObjectGalleryUploadState({
        message: error instanceof Error ? error.message : "Не удалось загрузить файл",
        status: "error"
      });
    }
  }

  async function handleObjectGalleryDelete(path: string) {
    await deleteObjectGalleryMedia(path);
    const nextPhotoPaths = objectGalleryPhotoPaths.filter((item) => item !== path);
    const nextVideoPaths = objectGalleryVideoPaths.filter((item) => item !== path);
    setObjectGalleryPhotoPaths(nextPhotoPaths);
    setObjectGalleryVideoPaths(nextVideoPaths);
    await savePaymentSettings(buildPaymentSettingsPatch({
      objectGalleryPhotoPaths: nextPhotoPaths,
      objectGalleryVideoPaths: nextVideoPaths
    }));
  }

  async function handleObjectGallerySave() {
    await savePaymentSettings(buildPaymentSettingsPatch({
      objectGalleryPhotoPaths,
      objectGalleryVideoPaths
    }));
  }

  async function saveMenuItems(nextItems: MenuItem[]) {
    setMenuItems(nextItems);
    await savePaymentSettings(buildPaymentSettingsPatch({ menuItems: nextItems }));
  }

  async function handleMenuItemCreate() {
    const nextItem: MenuItem = {
      id: `menu-${Date.now()}`,
      title: "Новое блюдо",
      photoPath: "",
      price: 0,
      cookingTime: "",
      composition: ""
    };
    await saveMenuItems(menuItems.concat(nextItem));
  }

  async function handleMenuItemChange(itemId: string, patch: Partial<MenuItem>) {
    const nextItems = menuItems.map((item) => item.id === itemId ? { ...item, ...patch } : item);
    await saveMenuItems(nextItems);
  }

  async function handleMenuItemDelete(itemId: string) {
    const target = menuItems.find((item) => item.id === itemId);
    if (target?.photoPath) {
      try {
        await deleteObjectGalleryMedia(target.photoPath);
      } catch {
        // The same media endpoint is reused for menu photos; keep deleting the record even if the file is already gone.
      }
    }
    await saveMenuItems(menuItems.filter((item) => item.id !== itemId));
  }

  async function handleMenuItemPhotoUpload(itemId: string, fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    setMenuUploadItemId(itemId);
    try {
      const uploaded = await uploadObjectGalleryMedia(file);
      if (uploaded.mediaType !== "photo") return;
      const nextItems = menuItems.map((item) => item.id === itemId ? { ...item, photoPath: uploaded.path } : item);
      await saveMenuItems(nextItems);
    } finally {
      setMenuUploadItemId("");
    }
  }

  async function handleMenuItemsSave() {
    await savePaymentSettings(buildPaymentSettingsPatch({ menuItems }));
  }

  async function handleMenuItemsBulkPriceChange(percent: number) {
    const safePercent = clampNumber(percent, -100, 500);
    if (!safePercent) return;
    const multiplier = 1 + safePercent / 100;
    const nextItems = menuItems.map((item) => ({
      ...item,
      price: Math.max(0, Math.round((item.price || 0) * multiplier))
    }));
    await saveMenuItems(nextItems);
  }

  async function handleWeatherSettingsChange(nextSettings: { name: string; latitude: number; longitude: number }) {
    setWeatherLocationName(nextSettings.name);
    setWeatherLatitude(nextSettings.latitude);
    setWeatherLongitude(nextSettings.longitude);
    await savePaymentSettings(buildPaymentSettingsPatch({
      weatherLocationName: nextSettings.name,
      weatherLatitude: nextSettings.latitude,
      weatherLongitude: nextSettings.longitude
    }));
  }

  async function handleInventorySettingsChange(nextSettings: { airBeds: number; rollaways: number }) {
    setInventoryAirBeds(nextSettings.airBeds);
    setInventoryRollaways(nextSettings.rollaways);
    await savePaymentSettings(buildPaymentSettingsPatch({
      inventoryAirBeds: nextSettings.airBeds,
      inventoryRollaways: nextSettings.rollaways
    }));
  }

  async function handleCustomHolidayDatesChange(nextDates: string[]) {
    const normalizedDates = normalizeCustomHolidayDates(nextDates);
    setCustomHolidayDates(normalizedDates);
    saveCustomHolidayDatesToLocal(normalizedDates);
    await savePaymentSettings(buildPaymentSettingsPatch({ customHolidayDates: normalizedDates }));
  }

  async function handleInventoryCustomFieldChange(fieldId: string, value: string) {
    const nextFields = { ...inventoryCustomFields, [fieldId]: value };
    setInventoryCustomFields(nextFields);
    await savePaymentSettings(buildPaymentSettingsPatch({ inventoryCustomFields: nextFields }));
  }

  async function handleInventoryCustomFieldDelete(fieldId: string) {
    const nextFields = removeRecordKey(inventoryCustomFields, fieldId);
    setInventoryCustomFields(nextFields);
    await savePaymentSettings(buildPaymentSettingsPatch({ inventoryCustomFields: nextFields }));
  }

  async function handlePackageSettingsChange(nextSettings: {
    discountPercent: number;
    periodDiscountPercent: number;
    periodDiscountFrom: string;
    periodDiscountTo: string;
    breakfastPricePerPerson: number;
    giftText: string;
    includeAmenities: boolean;
    minRooms: number;
  }) {
    setPackageDiscountPercent(nextSettings.discountPercent);
    setPackagePeriodDiscountPercent(nextSettings.periodDiscountPercent);
    setPackagePeriodDiscountFrom(nextSettings.periodDiscountFrom);
    setPackagePeriodDiscountTo(nextSettings.periodDiscountTo);
    setBreakfastPricePerPerson(nextSettings.breakfastPricePerPerson);
    setPackageGiftText(nextSettings.giftText);
    setPackageIncludeAmenities(nextSettings.includeAmenities);
    setPackageMinRooms(nextSettings.minRooms);
    await savePaymentSettings(buildPaymentSettingsPatch({
      packageDiscountPercent: nextSettings.discountPercent,
      packagePeriodDiscountPercent: nextSettings.periodDiscountPercent,
      packagePeriodDiscountFrom: nextSettings.periodDiscountFrom,
      packagePeriodDiscountTo: nextSettings.periodDiscountTo,
      breakfastPricePerPerson: nextSettings.breakfastPricePerPerson,
      packageGiftText: nextSettings.giftText,
      packageIncludeAmenities: nextSettings.includeAmenities,
      packageMinRooms: nextSettings.minRooms
    }));
  }

  async function handlePricePdfPeriodDiscountChange(patch: Partial<{
    periodDiscountPercent: number;
    periodDiscountFrom: string;
    periodDiscountTo: string;
  }>) {
    const nextPercent = clampNumber(patch.periodDiscountPercent ?? packagePeriodDiscountPercent, 0, 100);
    const nextFrom = patch.periodDiscountFrom ?? packagePeriodDiscountFrom;
    const nextTo = patch.periodDiscountTo ?? packagePeriodDiscountTo;
    setPackagePeriodDiscountPercent(nextPercent);
    setPackagePeriodDiscountFrom(nextFrom);
    setPackagePeriodDiscountTo(nextTo);
    await savePaymentSettings(buildPaymentSettingsPatch({
      packagePeriodDiscountPercent: nextPercent,
      packagePeriodDiscountFrom: nextFrom,
      packagePeriodDiscountTo: nextTo
    }));
  }

  async function handlePackageCustomFieldChange(fieldId: string, value: string) {
    const nextFields = { ...packageCustomFields, [fieldId]: value };
    setPackageCustomFields(nextFields);
    await savePaymentSettings(buildPaymentSettingsPatch({ packageCustomFields: nextFields }));
  }

  async function handlePackageCustomFieldDelete(fieldId: string) {
    const nextFields = removeRecordKey(packageCustomFields, fieldId);
    setPackageCustomFields(nextFields);
    await savePaymentSettings(buildPaymentSettingsPatch({ packageCustomFields: nextFields }));
  }

  async function handleServicePasswordChange(value: string) {
    const nextPassword = value.trim();
    setServicePassword(nextPassword);
    await savePaymentSettings(buildPaymentSettingsPatch({ servicePassword: nextPassword || "0000" }));
  }

  async function sendLinkMethodToClient(methodId: string) {
    const method = getSettingMethod(LINK_METHODS, linkMethods, methodId);
    const value = linkMethods[methodId]?.trim();
    if (!method || !value) return;

    suppressActiveChatSyncRef.current = true;
    setSendState("sending");
    try {
      const sent = await sendTextToActiveWhatsAppChat(`${method.label}:\n${value}`);
      setSendState(sent ? "sent" : "error");
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
        setSendState("idle");
      }, 2600);
    }
  }

  async function handleSendQuickPhrase(phrase: string) {
    if (!phrase.trim() || quickPhraseSendState === "sending" || quickPhraseSendingRef.current) return;
    quickPhraseSendingRef.current = true;
    suppressActiveChatSyncRef.current = true;
    setQuickPhraseSendState("sending");
    try {
      const sent = await sendTextToActiveWhatsAppChat(phrase.trim());
      setQuickPhraseSendState(sent ? "idle" : "error");
      if (!sent) {
        window.setTimeout(() => setQuickPhraseSendState("idle"), 2200);
      }
    } finally {
      window.setTimeout(() => {
        quickPhraseSendingRef.current = false;
        suppressActiveChatSyncRef.current = false;
      }, 250);
    }
  }

  async function handleCreateQuickPhrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phrase = newQuickPhrase.trim();
    if (!phrase) return;
    const nextPhrases = quickPhrases.includes(phrase) ? quickPhrases : quickPhrases.concat(phrase);
    setQuickPhrases(nextPhrases);
    setNewQuickPhrase("");
    setIsQuickPhraseFormOpen(false);
    await savePaymentSettings(buildPaymentSettingsPatch({ quickPhrases: nextPhrases }));
  }

  async function handleDeleteQuickPhrase(phrase: string) {
    const nextPhrases = quickPhrases.filter((item) => item !== phrase);
    setQuickPhrases(nextPhrases);
    await savePaymentSettings(buildPaymentSettingsPatch({ quickPhrases: nextPhrases }));
  }

  async function handleQuickPhraseDrop(targetIndex: number) {
    if (draggedQuickPhraseIndex === null || draggedQuickPhraseIndex === targetIndex) {
      setDraggedQuickPhraseIndex(null);
      return;
    }
    const nextPhrases = quickPhrases.slice();
    const [draggedPhrase] = nextPhrases.splice(draggedQuickPhraseIndex, 1);
    nextPhrases.splice(targetIndex, 0, draggedPhrase);
    setDraggedQuickPhraseIndex(null);
    setQuickPhrases(nextPhrases);
    await savePaymentSettings(buildPaymentSettingsPatch({ quickPhrases: nextPhrases }));
  }

  async function extractGuestNameFromChat() {
    const profile = await extractActiveChatProfile(activeChat);
    const name = getSafeGuestName(profile.name, profile.phone || guestPhone);
    if (!name) return;
    const chat = activeChat;

    setGuestFirstName(name);
    setContactExtracted(true);
    setLastReservation(null);
    setAgreementSent(false);
    if (chat) {
      await saveChatDraftForChat(chat, { agreementSent: false, guestFirstName: name, lastReservation: null });
    }
  }

  async function extractGuestPhoneFromChat() {
    const sourceChat = activeChat;
    suppressActiveChatSyncRef.current = true;
    try {
      const profile = await extractActiveChatPhoneOnly(sourceChat);
      const phone = profile.phone;
      if (!phone) {
        setContactExtracted(false);
        setContactSaveState("error");
        window.setTimeout(() => setContactSaveState("idle"), 2200);
        return false;
      }
      const fallbackName = getGuestNameFallbackFromPhone(phone);
      const phoneParts = splitPhoneForInput(phone);
      const normalizedPhone = buildPhoneWithPrefix(phoneParts.local, phoneParts.prefix) || formatPhoneDigits(phone);
      const contactName = fallbackName || guestFirstName;
      const chat = createActiveChatFromProfile({
        name: sourceChat?.title || contactName || normalizedPhone,
        phone: normalizedPhone
      }) ?? sourceChat;

      setGuestPhonePrefix(phoneParts.prefix);
      setGuestPhone(formatLocalPhoneInput(phoneParts.local));
      setContactExtracted(true);
      setContactSavedInWhatsApp(false);
      recentContactExtractionAtRef.current = Date.now();
      if (contactName) setGuestFirstName(contactName);
      setLastReservation(null);
      setAgreementSent(false);
      if (chat) {
        setActiveChat(chat);
        const extractedDraftPatch = {
          agreementSent: false,
          guestFirstName: contactName,
          lastReservation: null,
          phone: normalizedPhone
        };
        await saveChatDraftForChat(chat, extractedDraftPatch);
        if (sourceChat && sourceChat.id !== chat.id) {
          await saveChatDraftForChat(sourceChat, extractedDraftPatch);
        }
      }
      return true;
    } finally {
      window.setTimeout(() => {
        suppressActiveChatSyncRef.current = false;
      }, 700);
    }
  }

  async function extractContactFromChat() {
    const extracted = await extractGuestPhoneFromChat();
    setContactExtracted(Boolean(extracted));
  }

  async function fillBookingContactFromSelectedChat(chat: ActiveChat) {
    const profile = await extractActiveChatPhoneOnly(chat);
    if (activeChatIdRef.current !== chat.id || !profile.phone) return;
    const phoneParts = splitPhoneForInput(profile.phone);
    const fallbackName = getGuestNameFallbackFromPhone(profile.phone);
    setGuestPhonePrefix(phoneParts.prefix);
    setGuestPhone(formatLocalPhoneInput(phoneParts.local));
    setGuestFirstName(fallbackName);
    setContactExtracted(true);
    setContactSavedInWhatsApp(false);
  }

  function handleGuestPhoneInputChange(value: string) {
    setContactSavedInWhatsApp(false);
    let nextPrefix = guestPhonePrefix;
    let nextLocal = value;

    if (value.trim().startsWith("+")) {
      const phoneParts = splitPhoneForInput(value);
      nextPrefix = phoneParts.prefix;
      nextLocal = formatLocalPhoneInput(phoneParts.local);
      setGuestPhonePrefix(phoneParts.prefix);
      setGuestPhone(nextLocal);
    } else {
      nextLocal = formatLocalPhoneInput(value);
      setGuestPhone(nextLocal);
    }

    if (isManualSaleMode || isNewBookingChatMode) {
      const fallbackName = getGuestNameFallbackFromPhone(buildPhoneWithPrefix(nextLocal, nextPrefix) || nextLocal);
      if (fallbackName) setGuestFirstName(fallbackName);
    } else {
      setContactExtracted(false);
    }
  }

  async function handleContactAction() {
    debugContactFlow("contact-action-start", {
      activeChatId: activeChat?.id ?? "",
      activeChatName: activeChat?.name ?? "",
      activeChatTitle: activeChat?.title ?? "",
      contactExtracted,
      contactMatchesActiveChatName,
      isManualSaleMode,
      isNewBookingChatMode,
      phone: buildPhoneWithPrefix(guestPhone, guestPhonePrefix),
      appeal: guestFirstName
    });
    if (contactSavedInWhatsApp && contactMatchesActiveChatName) return;
    if (!isManualSaleMode && !isNewBookingChatMode && !contactExtracted) {
      await extractContactFromChat();
      return;
    }

    await saveActiveContactInWhatsApp();
  }

  function getContactActionLabel() {
    if (!isManualSaleMode && !isNewBookingChatMode && !contactExtracted) return "Извлечь";
    if (contactSaveState === "saving") return "Сохраняю...";
    if (contactSaveState === "saved") return "Сохранено";
    if (contactSaveState === "error") return "Ошибка";
    if (contactSavedInWhatsApp) return "Перезаписать";
    return "Сохранить";
  }

  async function saveActiveContactInWhatsApp() {
    setContactSaveState("saving");
    const phoneForSave = buildPhoneWithPrefix(guestPhone, guestPhonePrefix);
    const normalizedPhone = formatPhoneDigits(phoneForSave);
    debugContactFlow("save-contact-start", {
      activeChatId: activeChat?.id ?? "",
      activeChatName: activeChat?.name ?? "",
      isManualSaleMode,
      isNewBookingChatMode,
      phoneForSave,
      normalizedPhone,
      appeal: guestFirstName
    });
    if (!normalizedPhone) {
      guestPhoneInputRef.current?.focus();
      guestPhoneInputRef.current?.select();
      setContactSaveState("error");
      window.setTimeout(() => setContactSaveState("idle"), 2400);
      return;
    }

    const templateName = getGuestNameFallbackFromPhone(normalizedPhone);
    const safeName = getSafeGuestName(guestFirstName, normalizedPhone);
    const contactName = isManualSaleMode ? templateName || safeName || guestFirstName : templateName;
    if (contactName && contactName !== guestFirstName) setGuestFirstName(contactName);
    debugContactFlow("save-contact-name-resolved", { templateName, safeName, contactName });

    const databaseSaved = await saveContactToDatabase(contactName, normalizedPhone);
    debugContactFlow("save-contact-database-result", { contactName, normalizedPhone, databaseSaved });

    if (isManualSaleMode) {
      await saveManualSaleContact(contactName, normalizedPhone);
    } else {
      await saveBookingContact(contactName, normalizedPhone, databaseSaved, contactSavedInWhatsApp);
    }

    if (!databaseSaved) {
      setContactSaveState("error");
      return;
    }

    window.setTimeout(() => setContactSaveState("idle"), 2400);
  }

  async function ensureGuestContactForReservation(reservation: Reservation) {
    const normalizedPhone = formatPhoneDigits(reservation.phone);
    if (!normalizedPhone) return;
    const contactName = reservation.guestFirstName || getGuestNameFallbackFromPhone(normalizedPhone);
    if (!contactName) return;
    await saveContactToDatabase(contactName, normalizedPhone);
  }

  async function saveAgreementDraftForReservation(reservation: Reservation) {
    const reservationChat = createActiveChatFromProfile({
      name: reservation.guestFirstName || getGuestNameFallbackFromPhone(reservation.phone) || reservation.phone,
      phone: reservation.phone
    });
    const chats = [activeChat, reservationChat].filter((chat): chat is ActiveChat => Boolean(chat));
    if (!chats.length) return;
    if (!activeChat && reservationChat) setActiveChat(reservationChat);
    const draftPatch: Partial<ChatBookingDraft> = {
      agreementSent: true,
      agreementEverSent: true,
      catalogStatus: undefined,
      catalogStatusAt: undefined,
      adminComment: reservation.adminComment ?? adminComment,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      checkInTime: reservation.checkInTime,
      checkOutTime: reservation.checkOutTime,
      guestFirstName: reservation.guestFirstName,
      lastReservation: reservation,
      manualSaleOpen: Boolean(reservation.isManualSale),
      manualSalePaymentMethod: reservation.paymentMethod ?? manualSalePaymentMethod,
      phone: reservation.phone
    };
    setCatalogStatus(undefined);
    setCatalogStatusAt("");
    await Promise.all(chats.map((chat) => saveChatDraftForChat(chat, draftPatch)));
  }

  async function saveContactToDatabase(contactName: string, normalizedPhone: string) {
    try {
      debugContactFlow("database-save-start", { contactName, normalizedPhone });
      const savedContact = await saveGuestContact({
        phone: normalizedPhone,
        appeal: contactName || getGuestNameFallbackFromPhone(normalizedPhone),
        inquiryDate: new Date().toISOString()
      });
      setGuestContacts((currentContacts) =>
        currentContacts.filter((contact) => normalizePhoneSearch(contact.phone) !== normalizePhoneSearch(savedContact.phone)).concat(savedContact)
      );
      debugContactFlow("database-save-success", savedContact as unknown as Record<string, unknown>);
      return true;
    } catch (error) {
      debugContactFlow("database-save-error", { message: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  async function saveManualSaleContact(contactName: string, normalizedPhone: string) {
    debugContactFlow("manual-sale-save-start", { contactName, normalizedPhone });
    const phoneParts = splitPhoneForInput(normalizedPhone);
    setGuestPhonePrefix(phoneParts.prefix);
    setGuestPhone(formatLocalPhoneInput(phoneParts.local));
    setGuestFirstName(contactName);
    const chat = createActiveChatFromProfile({ name: contactName || normalizedPhone, phone: normalizedPhone });
    if (chat) {
      setActiveChat(chat);
      await saveChatDraftForChat(chat, {
        agreementSent: false,
        guestFirstName: contactName,
        lastReservation: null,
        manualSaleOpen: true,
        phone: normalizedPhone
      });
    }
    const existingOpened = await openExistingWhatsAppContactForManualSale(contactName, normalizedPhone);
    debugContactFlow("manual-sale-existing-contact-result", { existingOpened });
    const saved = existingOpened || await createWhatsAppContactFromSidebar(contactName, normalizedPhone);
    debugContactFlow("manual-sale-whatsapp-save-result", { saved });
    if (chat) setActiveChat(chat);
    setGuestPhonePrefix(phoneParts.prefix);
    setGuestPhone(formatLocalPhoneInput(phoneParts.local));
    setGuestFirstName(contactName);
    setContactExtracted(true);
    setContactSavedInWhatsApp(saved);
    setContactSaveState(saved ? "saved" : "error");
  }

  async function saveBookingContact(contactName: string, normalizedPhone: string, databaseSaved: boolean, shouldOverwrite: boolean) {
    debugContactFlow("booking-contact-save-start", {
      activeChatId: activeChat?.id ?? "",
      activeChatName: activeChat?.name ?? "",
      contactName,
      normalizedPhone,
      databaseSaved,
      shouldOverwrite,
      isNewBookingChatMode
    });
    const whatsappSaved = databaseSaved
      ? isNewBookingChatMode && !activeChat
        ? await saveNewBookingChatContact(contactName, normalizedPhone)
        : shouldOverwrite
          ? await overwriteActiveWhatsAppContact(contactName, normalizedPhone)
          : await saveActiveWhatsAppContact(contactName, normalizedPhone, { allowSidebar: true })
      : false;
    debugContactFlow("booking-contact-whatsapp-result", { contactName, normalizedPhone, whatsappSaved });
    closeWhatsAppProfilePanels();

    const chat = activeChat ?? createActiveChatFromProfile({ name: contactName || normalizedPhone, phone: normalizedPhone });
    if (chat) {
      setActiveChat(chat);
      const draftPatch = {
        agreementSent: false,
        guestFirstName: contactName,
        lastReservation: null,
        manualSaleOpen: false,
        phone: normalizedPhone
      };
      await saveChatDraftForChat(chat, draftPatch);
    }
    setBookingNewChatOpen(false);
    applyBookingContactFromPhone(normalizedPhone);
    setGuestFirstName(contactName);
    setContactExtracted(true);
    setContactSavedInWhatsApp(Boolean(whatsappSaved));
    setContactSaveState(databaseSaved && whatsappSaved ? "saved" : "error");
  }

  async function saveNewBookingChatContact(contactName: string, normalizedPhone: string) {
    debugContactFlow("new-booking-chat-save-start", { contactName, normalizedPhone });
    const existingOpened = await openExistingWhatsAppContactForManualSale(contactName, normalizedPhone);
    debugContactFlow("new-booking-chat-existing-contact-result", { existingOpened });
    const saved = existingOpened || await createWhatsAppContactFromSidebar(contactName, normalizedPhone);
    debugContactFlow("new-booking-chat-whatsapp-save-result", { saved });
    return saved;
  }

  function buildReservationDraft(status: Reservation["status"]): Reservation {
    const reservationPhone = buildPhoneWithPrefix(guestPhone, guestPhonePrefix) || guestPhone;
    const isManualSale = isManualSaleMode;
    const hasSavedPrepayment = Boolean(lastReservation?.prepaymentReceivedAt);
    const reservationPrepayment = isManualSale
      ? effectiveBookingTotals.total
      : hasSavedPrepayment
        ? lastReservation?.prepayment ?? effectiveBookingTotals.prepayment
        : effectiveBookingTotals.prepayment;
    const reservationDiscountPercent = effectiveBookingTotals.discountPercent;
    const paymentReceivedAt = hasSavedPrepayment
      ? lastReservation?.prepaymentReceivedAt
      : prepaymentAlreadyPaid
        ? new Date().toISOString()
      : undefined;
    const reservationCheckInTime = hasHourlyBookingObject ? checkInTime : defaultCheckInTime;
    const reservationCheckOutTime = hasHourlyBookingObject ? addHoursToTimeInput(reservationCheckInTime, hourlyHours) : DEFAULT_CHECK_OUT_TIME;
    const reservationBalancePaidAt = isManualSale && prepaymentAlreadyPaid ? lastReservation?.balancePaidAt ?? paymentReceivedAt : undefined;
    const paidAmount = reservationBalancePaidAt
      ? effectiveBookingTotals.total
      : paymentReceivedAt
        ? reservationPrepayment
        : lastReservation?.paidAmount ?? 0;
    const reservationItems = buildReservationItemsFromRooms(
      proposalRooms,
      checkIn,
      checkOut,
      reservationCheckInTime,
      reservationCheckOutTime,
      roomDateOverrides,
      extraInventoryByRoomId,
      hourlyHours,
      effectiveBookingTotals.subtotal,
      effectiveBookingTotals.discountAmount,
      effectiveBookingTotals.total,
      lastReservation?.items ?? []
    );

    return {
      id: lastReservation?.id ?? `reservation-${Date.now()}`,
      roomIds: proposalRooms.map((room) => room.id),
      items: reservationItems,
      payments: lastReservation?.payments ?? [],
      guestFirstName,
      phone: reservationPhone,
      checkIn,
      checkOut,
      checkInTime: reservationCheckInTime,
      checkOutTime: reservationCheckOutTime,
      comment: bookingComment,
      adminComment,
      adults: guestAdults,
      children: guestChildren,
      hasPet,
      extraBed: needsExtraBed,
      extraBedType,
      airMattressCount,
      rollawayCount,
      extraInventoryByRoomId,
      hourlyHours,
      discountPercent: reservationDiscountPercent,
      subtotal: effectiveBookingTotals.subtotal,
      discountAmount: effectiveBookingTotals.discountAmount,
      total: effectiveBookingTotals.total,
      prepayment: reservationPrepayment,
      paidAmount,
      paymentLink: getPaymentLinkForMethod(manualSalePaymentMethod, paymentMethods, paymentLink),
      paymentMethod: manualSalePaymentMethod || undefined,
      breakfastIncluded,
      breakfastDiscountAmount: effectiveBookingTotals.breakfastDiscountAmount,
      isManualSale,
      status,
      prepaymentReceivedAt: paymentReceivedAt,
      balancePaidAt: reservationBalancePaidAt,
      checkedInAt: lastReservation?.checkedInAt,
      checkedOutAt: lastReservation?.checkedOutAt,
      extendedAt: lastReservation?.extendedAt,
      noShowAt: lastReservation?.noShowAt,
      createdAt: lastReservation?.createdAt ?? new Date().toISOString()
    };
  }

  async function startManualSaleFlow() {
    setManualSaleOpen(true);
    setBookingNewChatOpen(false);
    window.localStorage.setItem(MANUAL_SALE_MODE_KEY, "true");
    setContactExtracted(false);
    await closeActiveWhatsAppChat();
    isRestoringChatDraftRef.current = true;
    setActiveChat(null);
    resetChatBookingDraft({ preserveManualSale: true });
    setManualSaleOpen(true);
    window.localStorage.setItem(MANUAL_SALE_MODE_KEY, "true");
    setGuestPhonePrefix("+7");
    setGuestPhone("");
    window.setTimeout(() => {
      isRestoringChatDraftRef.current = false;
      guestPhoneInputRef.current?.focus();
      guestPhoneInputRef.current?.select();
    }, 120);
  }

  async function startBookingFlow() {
    setManualSaleOpen(false);
    setBookingNewChatOpen(false);
    setContactExtracted(false);
    window.localStorage.removeItem(MANUAL_SALE_MODE_KEY);
    setPrepaymentAlreadyPaid(false);
    setLastReservation(null);
    setAgreementSent(false);
    if (activeChat) {
      await saveCurrentChatDraft({ agreementSent: false, lastReservation: null, manualSaleOpen: false, prepaymentAlreadyPaid: false });
    }
  }

  async function startNewBookingChatFlow() {
    setManualSaleOpen(false);
    setBookingNewChatOpen(true);
    window.localStorage.removeItem(MANUAL_SALE_MODE_KEY);
    setContactExtracted(true);
    setContactSavedInWhatsApp(false);
    await closeActiveWhatsAppChat();
    isRestoringChatDraftRef.current = true;
    setActiveChat(null);
    resetChatBookingDraft({ preserveManualSale: false });
    setManualSaleOpen(false);
    setBookingNewChatOpen(true);
    setContactExtracted(true);
    setGuestPhonePrefix("+7");
    setGuestPhone("");
    setGuestFirstName("");
    setPrepaymentAlreadyPaid(false);
    setLastReservation(null);
    setAgreementSent(false);
    window.setTimeout(() => {
      isRestoringChatDraftRef.current = false;
      guestPhoneInputRef.current?.focus();
      guestPhoneInputRef.current?.select();
    }, 120);
  }

  async function handleCreateManualSale() {
    if (!guestPhone.trim()) {
      guestPhoneInputRef.current?.focus();
      guestPhoneInputRef.current?.select();
      return;
    }
    if (!proposalRooms.length || !checkIn || !checkOut || !effectiveBookingTotals.total) return;
    if (!ensurePaymentMethodSelected()) return;
    const now = new Date().toISOString();
    const salePhone = buildPhoneWithPrefix(guestPhone, guestPhonePrefix) || guestPhone;
    const paymentLabel = getManualSalePaymentLabel(manualSalePaymentMethod, configuredPaymentMethods);
    const fallbackName = getSafeGuestName(guestFirstName, salePhone);
    const saleGuestName = fallbackName || guestFirstName;
    const manualComment = [`Продажа оформлена`, `Оплата: ${paymentLabel}`, bookingComment.trim()].filter(Boolean).join(". ");
    const reservation: Reservation = {
      id: `reservation-${Date.now()}`,
      roomIds: proposalRooms.map((room) => room.id),
      items: buildReservationItemsFromRooms(
        proposalRooms,
        checkIn,
        checkOut,
        checkInTime,
        checkOutTime,
        roomDateOverrides,
        extraInventoryByRoomId,
        hourlyHours,
        effectiveBookingTotals.subtotal,
        effectiveBookingTotals.discountAmount,
        effectiveBookingTotals.total,
        []
      ).map((item) => ({
        ...item,
        paidAmount: item.total,
        balancePaidAt: now,
        checkedInAt: now
      })),
      payments: [{
        id: `payment-${Date.now()}`,
        type: "prepayment",
        amount: effectiveBookingTotals.total,
        method: manualSalePaymentMethod,
        paidAt: now
      }],
      guestFirstName: saleGuestName,
      phone: salePhone,
      checkIn,
      checkOut,
      checkInTime,
      checkOutTime,
      comment: manualComment,
      adminComment,
      adults: guestAdults,
      children: guestChildren,
      hasPet,
      extraBed: needsExtraBed,
      extraBedType,
      airMattressCount,
      rollawayCount,
      extraInventoryByRoomId,
      hourlyHours,
      discountPercent,
      subtotal: effectiveBookingTotals.subtotal,
      discountAmount: effectiveBookingTotals.discountAmount,
      total: effectiveBookingTotals.total,
      prepayment: effectiveBookingTotals.total,
      paidAmount: effectiveBookingTotals.total,
      paymentLink: getPaymentLinkForMethod(manualSalePaymentMethod, paymentMethods, paymentLink),
      paymentMethod: manualSalePaymentMethod,
      breakfastIncluded,
      breakfastDiscountAmount: effectiveBookingTotals.breakfastDiscountAmount,
      isManualSale: true,
      status: "booked",
      prepaymentReceivedAt: now,
      balancePaidAt: now,
      checkedInAt: now,
      createdAt: now
    };

    if (saleGuestName !== guestFirstName) {
      setGuestFirstName(saleGuestName);
    }
    await updateReservation(reservation);
    setBookingComment(manualComment);
    setPrepaymentAlreadyPaid(true);
    setAgreementSent(true);
  }

  async function handleConfirmReservation() {
    const reservation = currentReservationDraft;
    if (!reservation) return;
    if (hasSelectedHourlyConflict) return;
    if (!ensurePaymentMethodSelected()) return;
    await updateReservation({
      ...reservation,
      status: "booked" as const
    });
  }

  async function cancelReservation(reservation: Reservation, reason?: string) {
    const cancellationNote = reason ? `Снятие брони: ${reason}` : "";
    const cancelledReservation = {
      ...reservation,
      comment: cancellationNote ? [reservation.comment, cancellationNote].filter(Boolean).join("\n") : reservation.comment,
      status: "cancelled" as const
    };
    await updateReservation(cancelledReservation);
  }

  async function handleCancelReservationWithReason(reason: string) {
    if (!cancelReservationTarget) return;
    await cancelReservation(cancelReservationTarget, reason);
    setCancelReservationTarget(null);
  }

  async function removeReservation(reservation: Reservation) {
    await deleteReservation(reservation.id);
    setReservations((currentReservations) => currentReservations.filter((item) => item.id !== reservation.id));
    setLastReservation((currentReservation) => currentReservation?.id === reservation.id ? null : currentReservation);
    setDeleteReservationTarget(null);
  }

  async function updateReservation(reservation: Reservation) {
    await saveReservation(reservation);
    await ensureGuestContactForReservation(reservation);
    setReservations((currentReservations) => currentReservations.filter((item) => item.id !== reservation.id).concat(reservation));
    setLastReservation(reservation);
  }

  async function toggleBalancePaid(reservation: Reservation) {
    const items = getReservationItems(reservation, pricedRooms).filter((item) => reservation.roomIds.includes(item.roomId));
    if (!reservation.balancePaidAt && items.length > 1) {
      setSelectedBalanceRoomId(items[0]?.roomId ?? "");
      setBalanceRoomSelectionTarget(reservation);
      return;
    }
    await markReservationBalancePaid(reservation);
  }

  async function markReservationBalancePaid(reservation: Reservation, roomId?: string) {
    const hasBalancePaid = Boolean(reservation.balancePaidAt);
    if (roomId) {
      const items = getReservationItems(reservation, pricedRooms);
      const nextItems = items.map((item) => {
        if (item.roomId !== roomId) return item;
        const paidAmount = item.total;
        return { ...item, paidAmount, balancePaidAt: new Date().toISOString() };
      });
      const item = nextItems.find((nextItem) => nextItem.roomId === roomId);
      const existingPayments = reservation.payments ?? [];
      const nextPayments: ReservationPayment[] = existingPayments
        .filter((payment) => !(payment.type === "balance" && payment.roomId === roomId))
        .concat(item ? [{
          id: `payment-${Date.now()}-${roomId}`,
          type: "balance",
          roomId,
          amount: Math.max(0, item.total - (item.prepayment ?? 0)),
          method: manualSalePaymentMethod || reservation.paymentMethod,
          paidAt: new Date().toISOString()
        }] : []);
      const allBalancesPaid = nextItems.every((nextItem) => nextItem.balancePaidAt);
      const nextPaidAmount = getReservationPaymentsTotal(nextPayments, reservation.total);
      await updateReservation({
        ...reservation,
        items: nextItems,
        payments: nextPayments,
        status: "booked",
        paidAmount: nextPaidAmount,
        balancePaidAt: allBalancesPaid ? new Date().toISOString() : reservation.balancePaidAt
      });
      return;
    }

    await updateReservation({
      ...reservation,
      status: "booked",
      paymentMethod: hasBalancePaid ? reservation.paymentMethod : manualSalePaymentMethod || reservation.paymentMethod,
      paidAmount: hasBalancePaid ? reservation.prepayment : reservation.total,
      balancePaidAt: hasBalancePaid ? undefined : new Date().toISOString(),
      payments: hasBalancePaid
        ? (reservation.payments ?? []).filter((payment) => payment.type !== "balance")
        : (reservation.payments ?? []).filter((payment) => payment.type !== "balance").concat({
          id: `payment-${Date.now()}`,
          type: "balance",
          amount: Math.max(0, reservation.total - reservation.prepayment),
          method: manualSalePaymentMethod || reservation.paymentMethod,
          paidAt: new Date().toISOString()
        })
    });
  }

  async function togglePrepaymentPaid(reservation: Reservation) {
    const hasPrepayment = Boolean(reservation.prepaymentReceivedAt);
    if (!hasPrepayment) {
      if (!ensurePaymentMethodSelected()) return;
      setPrepaymentAmountTarget(reservation);
      return;
    }

    setPrepaymentAlreadyPaid(false);
    await updateReservation({
      ...reservation,
      paidAmount: 0,
      prepaymentReceivedAt: undefined
    });
  }

  async function confirmPrepaymentAmount(reservation: Reservation, amount: number) {
    const prepaymentAmount = clampNumber(Math.round(amount), 0, reservation.total);
    const now = new Date().toISOString();
    setPrepaymentAlreadyPaid(prepaymentAmount > 0);
    await updateReservation({
      ...reservation,
      paymentMethod: manualSalePaymentMethod || reservation.paymentMethod,
      paidAmount: prepaymentAmount,
      prepayment: prepaymentAmount,
      prepaymentReceivedAt: prepaymentAmount > 0 ? now : undefined,
      payments: (reservation.payments ?? [])
        .filter((payment) => payment.type !== "prepayment")
        .concat(prepaymentAmount > 0 ? [{
          id: `payment-${Date.now()}`,
          type: "prepayment",
          amount: prepaymentAmount,
          method: manualSalePaymentMethod || reservation.paymentMethod,
          paidAt: now
        }] : [])
    });
    setPrepaymentAmountTarget(null);
  }

  async function confirmReservationExtension(reservation: Reservation, nightsToAdd: number, amount: number, paidNow: boolean) {
    const extensionNights = Math.max(1, Math.round(nightsToAdd));
    const extensionAmount = Math.max(0, Math.round(amount));
    const nextCheckOut = formatDateInput(addDays(parseDateInput(reservation.checkOut), extensionNights));
    const extensionNote = `Продление: +${extensionNights} ${formatNightsWord(extensionNights)} до ${formatKazakhDate(nextCheckOut)} (${formatPrice(extensionAmount)}${paidNow ? ", оплачено" : ", оплата при выезде"})`;
    const alreadyPaid = getReservationPaidAmount(reservation);
    const nextTotal = reservation.total + extensionAmount;
    const nextPaidAmount = paidNow ? clampNumber(alreadyPaid + extensionAmount, 0, nextTotal) : alreadyPaid;
    const updatedReservation: Reservation = {
      ...reservation,
      checkOut: nextCheckOut,
      comment: [reservation.comment, extensionNote].filter(Boolean).join("\n"),
      extendedAt: new Date().toISOString(),
      paidAmount: nextPaidAmount,
      subtotal: reservation.subtotal + extensionAmount,
      total: nextTotal,
      balancePaidAt: nextPaidAmount >= nextTotal ? reservation.balancePaidAt ?? new Date().toISOString() : undefined
    };

    await updateReservation(updatedReservation);
    if (activeChat) {
      await saveCurrentChatDraft({
        checkOut: nextCheckOut,
        lastReservation: updatedReservation
      });
    }
    setCheckOut(nextCheckOut);
    setExtendReservationTarget(null);
  }

  async function saveAddOnSale() {
    if (!lastReservation || !addOnSaleServiceRoom) return;
    if (addOnSaleConflicts.length) return;
    if (addOnSalePaidNow && !addOnSalePaymentMethod) {
      setAddOnSaleState("error");
      return;
    }

    const now = new Date().toISOString();
    const total = Math.max(0, addOnSaleTotal);
    const paidAmount = addOnSalePaidNow ? total : 0;
    const addOnReservation: Reservation = {
      id: `reservation-addon-${Date.now()}`,
      roomIds: [addOnSaleServiceRoom.id],
      guestFirstName: lastReservation.guestFirstName,
      phone: lastReservation.phone,
      checkIn: addOnSaleDate,
      checkOut: addOnSaleDate,
      checkInTime: addOnSaleStartTime,
      checkOutTime: addOnSaleEndTime,
      comment: `Доп продажа к брони ${lastReservation.id}: ${addOnSaleServiceRoom.title}`,
      adminComment: lastReservation.adminComment,
      adults: lastReservation.adults ?? 0,
      children: lastReservation.children ?? 0,
      hasPet: false,
      extraBed: false,
      airMattressCount: 0,
      rollawayCount: 0,
      hourlyHours: Math.max(2, addOnSaleHours),
      discountPercent: 0,
      subtotal: total,
      discountAmount: 0,
      total,
      prepayment: addOnSalePaidNow ? total : 0,
      paidAmount,
      paymentLink: getPaymentLinkForMethod(addOnSalePaymentMethod, paymentMethods, ""),
      paymentMethod: addOnSalePaidNow ? addOnSalePaymentMethod : undefined,
      breakfastIncluded: false,
      isManualSale: true,
      isAddOnSale: true,
      parentReservationId: lastReservation.id,
      status: "booked",
      prepaymentReceivedAt: addOnSalePaidNow && total > 0 ? now : undefined,
      balancePaidAt: addOnSalePaidNow && total > 0 ? now : undefined,
      createdAt: now
    };

    setAddOnSaleState("saving");
    try {
      await saveReservation(addOnReservation);
      await ensureGuestContactForReservation(addOnReservation);
      setReservations((currentReservations) => currentReservations.filter((reservation) => reservation.id !== addOnReservation.id).concat(addOnReservation));
      setAddOnSaleState("saved");
      if (addOnSalePaymentMethod) setManualSalePaymentMethod(addOnSalePaymentMethod);
      window.setTimeout(() => setAddOnSaleState("idle"), 1800);
    } catch (error) {
      setAddOnSaleState("error");
      void sendDebugLog("addon-sale-save-error", {
        message: error instanceof Error ? error.message : String(error),
        parentReservationId: lastReservation.id,
        serviceRoomId: addOnSaleServiceRoom.id
      });
    }
  }

  async function saveKitchenSale() {
    if (!lastReservation || !selectedKitchenMenuItem) return;
    if (kitchenSalePaidNow && !kitchenSalePaymentMethod) {
      setKitchenSaleState("error");
      return;
    }

    const now = new Date().toISOString();
    const portions = Math.max(1, kitchenPortions);
    const total = Math.max(0, kitchenSaleTotal);
    const paidAmount = kitchenSalePaidNow ? total : 0;
    const addOnReservation: Reservation = {
      id: `reservation-kitchen-${Date.now()}`,
      roomIds: [],
      guestFirstName: lastReservation.guestFirstName,
      phone: lastReservation.phone,
      checkIn: addOnSaleDate,
      checkOut: addOnSaleDate,
      checkInTime: addOnSaleStartTime,
      checkOutTime: addOnSaleStartTime,
      comment: `Кухня: ${selectedKitchenMenuItem.title} × ${portions}`,
      adminComment: lastReservation.adminComment,
      adults: lastReservation.adults ?? 0,
      children: lastReservation.children ?? 0,
      hasPet: false,
      extraBed: false,
      airMattressCount: 0,
      rollawayCount: 0,
      hourlyHours: 0,
      discountPercent: 0,
      subtotal: total,
      discountAmount: 0,
      total,
      prepayment: kitchenSalePaidNow ? total : 0,
      paidAmount,
      paymentLink: getPaymentLinkForMethod(kitchenSalePaymentMethod, paymentMethods, ""),
      paymentMethod: kitchenSalePaidNow ? kitchenSalePaymentMethod : undefined,
      breakfastIncluded: false,
      isManualSale: true,
      isAddOnSale: true,
      parentReservationId: lastReservation.id,
      status: "booked",
      prepaymentReceivedAt: kitchenSalePaidNow && total > 0 ? now : undefined,
      balancePaidAt: kitchenSalePaidNow && total > 0 ? now : undefined,
      createdAt: now
    };

    setKitchenSaleState("saving");
    try {
      await saveReservation(addOnReservation);
      await ensureGuestContactForReservation(addOnReservation);
      setReservations((currentReservations) => currentReservations.filter((reservation) => reservation.id !== addOnReservation.id).concat(addOnReservation));
      setKitchenSaleState("saved");
      if (kitchenSalePaymentMethod) setManualSalePaymentMethod(kitchenSalePaymentMethod);
      window.setTimeout(() => setKitchenSaleState("idle"), 1800);
    } catch (error) {
      setKitchenSaleState("error");
      void sendDebugLog("kitchen-sale-save-error", {
        message: error instanceof Error ? error.message : String(error),
        menuItemId: selectedKitchenMenuItem.id,
        parentReservationId: lastReservation.id
      });
    }
  }

  async function removeKitchenSale(reservationId: string) {
    await deleteReservation(reservationId);
    setReservations((currentReservations) => currentReservations.filter((reservation) => reservation.id !== reservationId));
  }

  function updateAdminCommentValue(nextComment: string) {
    setAdminComment(nextComment);
    setAgreementSent(false);

    if (!lastReservation) return;

    const updatedReservation = { ...lastReservation, adminComment: nextComment };
    setLastReservation(updatedReservation);
    setReservations((currentReservations) => currentReservations.map((reservation) => reservation.id === updatedReservation.id ? updatedReservation : reservation));
    if (activeChat) {
      void saveCurrentChatDraft({ adminComment: nextComment, lastReservation: updatedReservation });
    }

    if (saveAdminCommentTimerRef.current) {
      window.clearTimeout(saveAdminCommentTimerRef.current);
    }
    saveAdminCommentTimerRef.current = window.setTimeout(() => {
      void saveReservation(updatedReservation);
    }, 450);
  }

  function toggleAdminCommentVoiceInput() {
    if (adminCommentVoiceState === "listening") {
      shouldKeepAdminCommentListeningRef.current = false;
      adminCommentRecognitionRef.current?.stop();
      adminCommentRecognitionRef.current = null;
      setAdminCommentVoiceState("idle");
      return;
    }

    const SpeechRecognitionConstructor = (window as unknown as {
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
      };
    }).SpeechRecognition ?? (window as unknown as {
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
      };
    }).webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      setAdminCommentVoiceState("unsupported");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        updateAdminCommentValue([adminCommentValueRef.current.trim(), transcript].filter(Boolean).join(" "));
      }
    };
    recognition.onend = () => {
      if (shouldKeepAdminCommentListeningRef.current) {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch {
            setAdminCommentVoiceState("idle");
            shouldKeepAdminCommentListeningRef.current = false;
          }
        }, 250);
        return;
      }
      setAdminCommentVoiceState("idle");
    };
    recognition.onerror = () => {
      if (!shouldKeepAdminCommentListeningRef.current) setAdminCommentVoiceState("idle");
    };
    shouldKeepAdminCommentListeningRef.current = true;
    adminCommentRecognitionRef.current = recognition;
    setAdminCommentVoiceState("listening");
    recognition.start();
  }

  async function toggleCheckedIn(reservation: Reservation) {
    const items = getReservationItems(reservation, pricedRooms).filter((item) => reservation.roomIds.includes(item.roomId));
    if (!reservation.checkedInAt && items.length > 1) {
      setSelectedCheckInRoomId(items[0]?.roomId ?? "");
      setCheckInRoomSelectionTarget(reservation);
      return;
    }
    await markReservationCheckedIn(reservation);
  }

  async function markReservationCheckedIn(reservation: Reservation, roomId?: string) {
    const hasCheckedIn = Boolean(reservation.checkedInAt);
    if (roomId) {
      const now = new Date().toISOString();
      const nextItems = getReservationItems(reservation, pricedRooms).map((item) =>
        item.roomId === roomId ? { ...item, checkedInAt: now } : item
      );
      await updateReservation({
        ...reservation,
        items: nextItems,
        status: "booked",
        checkedInAt: reservation.checkedInAt ?? now,
        noShowAt: undefined
      });
      return;
    }

    await updateReservation({
      ...reservation,
      status: "booked",
      checkedInAt: hasCheckedIn ? undefined : new Date().toISOString(),
      noShowAt: undefined
    });
  }

  function ensurePaymentMethodSelected() {
    if (manualSalePaymentMethod) return true;
    setIsPaymentMethodRequiredOpen(true);
    return false;
  }

  async function clearStatistics() {
    await clearBookingStatistics();
    setReservations([]);
    setLastReservation(null);
  }

  async function clearGuestDatabaseFields() {
    await clearBookingStatistics();
    setReservations([]);
    setLastReservation(null);
  }

  async function clearSingleGuestDatabaseRowFields(row: { draftKey?: string; phone: string; reservationId: string }) {
    if (row.reservationId) {
      await deleteReservation(row.reservationId);
      setReservations((currentReservations) => currentReservations.filter((reservation) => reservation.id !== row.reservationId));
      setLastReservation((currentReservation) => currentReservation?.id === row.reservationId ? null : currentReservation);
    }

    if (row.draftKey) {
      await deleteChatBookingDraft(row.draftKey);
    }
  }

  async function sendReservationToWhatsApp() {
    const reservation = currentReservationDraft;
    if (!reservation) return;
    if (hasSelectedHourlyConflict) return;

    setSendState("sending");
    setLastReservation(reservation);
    const inserted = await insertTextIntoActiveWhatsAppChat(buildReservationMessage(reservation, rooms));
    if (inserted) {
      setAgreementSent(true);
      setAgreementEverSent(true);
      await ensureGuestContactForReservation(reservation);
      await saveAgreementDraftForReservation(reservation);
    }
    setSendState(inserted ? "sent" : "error");
    window.setTimeout(() => setSendState("idle"), 2600);
  }

  async function sendReservationTotalToWhatsApp() {
    const reservation = currentReservationDraft;
    if (!reservation) return;
    if (hasSelectedHourlyConflict) return;

    setSendState("sending");
    const inserted = await insertTextIntoActiveWhatsAppChat(buildReservationTotalMessage(reservation, rooms));
    setSendState(inserted ? "sent" : "error");
    window.setTimeout(() => setSendState("idle"), 2600);
  }

  async function sendReservationPaymentConfirmationToWhatsApp() {
    const reservation = lastReservation ?? currentReservationDraft;
    if (!reservation) return;
    if (hasSelectedHourlyConflict) return;
    if (!ensurePaymentMethodSelected()) return;

    const now = new Date().toISOString();
    const prepaymentAmount = clampNumber(
      Math.round(reservation.prepayment || Math.round(reservation.total * 0.5)),
      0,
      reservation.total
    );
    const paidAmount = Math.max(reservation.paidAmount ?? 0, prepaymentAmount);
    const confirmedReservation: Reservation = {
      ...reservation,
      paymentMethod: manualSalePaymentMethod || reservation.paymentMethod,
      prepayment: prepaymentAmount,
      paidAmount,
      prepaymentReceivedAt: prepaymentAmount > 0 ? reservation.prepaymentReceivedAt ?? now : undefined
    };

    setSendState("sending");
    await updateReservation(confirmedReservation);
    setPrepaymentAlreadyPaid(prepaymentAmount > 0);
    const inserted = await insertTextIntoActiveWhatsAppChat(buildReservationPaymentConfirmationMessage(confirmedReservation, rooms));
    setSendState(inserted ? "sent" : "error");
    window.setTimeout(() => setSendState("idle"), 2600);
  }

  async function copyReservationAgreementText() {
    const reservation = currentReservationDraft;
    if (!reservation) return;
    const copied = await copyTextToClipboard(buildReservationMessage(reservation, rooms));
    setAgreementCopyState(copied ? "copied" : "error");
    window.setTimeout(() => setAgreementCopyState("idle"), 1800);
  }

  if (!isOpen) {
    return (
      <button className="gpb-floating-button" type="button" onClick={() => setIsOpen(true)} title="Открыть панель">
        <PanelRightOpen size={20} />
      </button>
    );
  }

  return (
    <aside className="gpb-panel" style={{ width }}>
      <div className="gpb-resize-handle" onPointerDown={startResize} />
      <header className="gpb-panel-header">
        <HeaderWeatherStrip weatherState={todayWeatherState} />
        <div className="gpb-header-actions">
          <button type="button" onClick={openExternalPricePdfOptions} title="Внешний источник">
            <Share2 size={18} />
          </button>
          <button type="button" onClick={() => setIsCatalogOpen(true)} title="Каталог номеров">
            <Hotel size={18} />
          </button>
          <button type="button" onClick={() => setIsAnalyticsOpen(true)} title="Статистика">
            <BarChart3 size={18} />
          </button>
          <button type="button" onClick={() => setIsReservationsOpen(true)} title="Брони">
            <CalendarDays size={18} />
          </button>
          <button type="button" onClick={() => setIsGuestDatabaseOpen(true)} title="База гостей">
            <Users size={18} />
          </button>
          <button type="button" onClick={() => setIsExpensesOpen(true)} title="Расходы и зарплаты">
            <Banknote size={18} />
          </button>
          <button type="button" onClick={() => setIsSettingsOpen(true)} title="Настройки">
            <Settings size={18} />
          </button>
          <button type="button" onClick={() => setIsOpen(false)} title="Свернуть панель">
            <PanelRightClose size={18} />
          </button>
        </div>
      </header>

      <section className="gpb-section gpb-top-date-section">
        <div className="gpb-grid gpb-date-guest-grid">
          <label className="gpb-date-field">
            Заезд
            <input disabled={isBookingLocked} type="date" value={checkIn} onChange={(event) => handleCheckInChange(event.target.value)} />
          </label>
          <label className="gpb-date-field">
            Выезд
            <input disabled={isBookingLocked} type="date" value={checkOut} onChange={(event) => handleCheckOutChange(event.target.value)} />
          </label>
        </div>
      </section>

      <section className="gpb-section gpb-booking-summary-section">
        <div className="gpb-booking-summary-grid">
          <div>
            <span>Всего</span>
            <strong>{bookingPanelSummary.totalStayRooms}</strong>
          </div>
          <div>
            <span>Свободно</span>
            <strong>{bookingPanelSummary.availableStayRooms}</strong>
          </div>
          <div>
            <span>Кол-во мест</span>
            <strong>{bookingPanelSummary.availableStayCapacity}</strong>
          </div>
          <div>
            <span>План</span>
            <strong>{formatAnalyticsMoney(bookingPanelSummary.availableRevenue)}</strong>
          </div>
          <div>
            <span>Факт</span>
            <strong>{formatAnalyticsMoney(bookingPanelSummary.bookedRevenue)}</strong>
          </div>
          <div>
            <span>Скидки план</span>
            <strong>{formatAnalyticsMoney(bookingPanelSummary.plannedDiscountAmount)}</strong>
          </div>
          <div>
            <span>Скидки факт</span>
            <strong>{bookingPanelSummary.actualDiscountCount} / {formatAnalyticsMoney(bookingPanelSummary.actualDiscountAmount)}</strong>
          </div>
        </div>
      </section>

      <section className="gpb-section gpb-booking-workflow">
        <div className="gpb-flat-section-body">
          <div
            className={`gpb-workflow-step gpb-flow-step ${activeWorkflowBlock === "flow" ? "is-active" : ""} ${isBookingLocked ? "is-locked" : ""}`}
            onClick={() => setActiveWorkflowBlock("flow")}
            onFocusCapture={() => setActiveWorkflowBlock("flow")}
          >
            <div className="gpb-flow-switch">
              <button className={isManualSaleMode ? "is-active" : ""} type="button" onClick={startManualSaleFlow} disabled={isBookingLocked}>
                Начать продажу
              </button>
              <button className={`gpb-flow-unlocked ${!isManualSaleMode && !isNewBookingChatMode ? "is-active" : ""}`} type="button" onClick={startBookingFlow}>
                Начать бронирование
              </button>
              <button className={`gpb-flow-unlocked ${isNewBookingChatMode ? "is-active" : ""}`} type="button" onClick={startNewBookingChatFlow}>
                Начать новый чат
              </button>
            </div>
            <div className={`gpb-contact-row ${isContactRowLocked ? "is-locked" : ""}`}>
              <input
                className="gpb-phone-prefix-input"
                list="gpb-phone-country-prefixes"
                aria-label="Префикс телефона"
                value={guestPhonePrefix}
                disabled={isContactRowLocked}
                onChange={(event) => setGuestPhonePrefix(event.target.value)}
              />
              <datalist id="gpb-phone-country-prefixes">
                {PHONE_COUNTRY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </datalist>
              <input
                ref={guestPhoneInputRef}
                aria-label="Телефон"
                value={guestPhone}
                disabled={isContactRowLocked}
                onChange={(event) => handleGuestPhoneInputChange(event.target.value)}
                maxLength={13}
                placeholder="700 123 55 66"
              />
              <input
                className={activeChat ? "gpb-chat-linked-input" : "gpb-chat-empty-input"}
                aria-label="Обращение"
                placeholder={isManualSaleMode || isNewBookingChatMode ? "Гость 5566" : activeChat ? activeChat.title : "обращение"}
                title={activeChat ? `Выбранный чат: ${activeChat.title}` : isNewBookingChatMode ? "Новый чат для бронирования" : "Чат не выбран"}
                value={guestFirstName}
                disabled={isContactRowLocked}
                onChange={(event) => {
                  setGuestFirstName(event.target.value);
                  if (!isManualSaleMode && !isNewBookingChatMode) setContactExtracted(false);
                }}
              />
              <button className="gpb-primary" type="button" onClick={handleContactAction} disabled={isContactRowLocked || contactSaveState === "saving"}>
                {getContactActionLabel()}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="gpb-section gpb-guest-count-section">
        <div className="gpb-guest-count-grid">
          <label>
            <span>Взрослые</span>
            <button type="button" onClick={() => updateGuestCount("adults", guestAdults - 1)} disabled={isBookingLocked || guestAdults <= 0}>-</button>
            <input
              aria-label="Количество взрослых"
              disabled={isBookingLocked}
              min="0"
              type="number"
              value={guestAdults}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => updateGuestCount("adults", toNumber(event.target.value, 0))}
            />
            <button type="button" onClick={() => updateGuestCount("adults", guestAdults + 1)} disabled={isBookingLocked}>+</button>
          </label>
          <label>
            <span>Дети</span>
            <button type="button" onClick={() => updateGuestCount("children", guestChildren - 1)} disabled={isBookingLocked || guestChildren <= 0}>-</button>
            <input
              aria-label="Количество детей"
              disabled={isBookingLocked}
              min="0"
              type="number"
              value={guestChildren}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => updateGuestCount("children", toNumber(event.target.value, 0))}
            />
            <button type="button" onClick={() => updateGuestCount("children", guestChildren + 1)} disabled={isBookingLocked}>+</button>
          </label>
          <div className="gpb-guest-count-total">
            <span>Итого</span>
            <strong>{guestAdults + guestChildren}</strong>
          </div>
        </div>
      </section>

      <section className="gpb-section gpb-quick-phrases-section">
        <div className="gpb-quick-phrase-list">
          {quickPhrases.map((phrase, index) => (
            <span
              className={`gpb-quick-phrase-chip ${draggedQuickPhraseIndex === index ? "is-dragging" : ""}`}
              draggable
              key={phrase}
              onDragStart={() => setDraggedQuickPhraseIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void handleQuickPhraseDrop(index);
              }}
              onDragEnd={() => setDraggedQuickPhraseIndex(null)}
            >
              <button type="button" onClick={() => void handleSendQuickPhrase(phrase)} disabled={quickPhraseSendState === "sending"}>
                {phrase}
              </button>
              <button type="button" onClick={() => void handleDeleteQuickPhrase(phrase)} title="Удалить фразу">
                <X size={11} />
              </button>
            </span>
          ))}
          <button className="gpb-quick-phrase-add-chip" type="button" onClick={() => setIsQuickPhraseFormOpen(true)} title="Добавить заготовку">
            <Plus size={14} />
          </button>
        </div>
        {quickPhraseSendState === "error" ? <small>Откройте нужный чат WhatsApp и попробуйте еще раз.</small> : null}
      </section>

      <section
        className={`gpb-section gpb-panel-catalog gpb-workflow-section ${activeWorkflowBlock === "catalog" ? "is-active" : ""}`}
        onClick={() => setActiveWorkflowBlock("catalog")}
        onFocusCapture={() => setActiveWorkflowBlock("catalog")}
      >
        <div className="gpb-section-title">
          {lastReservation?.status === "booked" ? <strong>Забронировано</strong> : null}
          <CatalogAvailabilityChips summary={catalogAvailabilitySummary} />
        </div>
        <div className="gpb-flat-section-body">
            {catalogPanelRooms.length ? (
              <>
                <div className="gpb-panel-object-list">
                  {catalogPanelRooms.map((room) => (
                    <button
                      className={[
                        room.id === selectedRoomId ? "is-active" : "",
                        selectedBookingRoomIds.includes(room.id) ? "is-selected" : "",
                        saunaBusySlotsByRoomId[room.id]?.length ? "has-busy-slots" : ""
                      ].filter(Boolean).join(" ")}
                      key={room.id}
                      type="button"
                      disabled={isBookingLocked}
                      onClick={() => {
                        toggleBookingRoom(room.id);
                        setSendState("idle");
                      }}
                    >
                      <RoomCatalogThumb room={room} />
                      {extraInventoryByRoomId[room.id] ? (
                        <span className="gpb-card-extra-badge" onClick={(event) => event.stopPropagation()}>
                          {extraInventoryByRoomId[room.id].airBeds ? (
                            <span className="gpb-card-extra-badge-row">
                              <span>Матрас +{extraInventoryByRoomId[room.id].airBeds}</span>
                              <button
                                aria-label="Удалить матрас"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeExtraInventoryTypeFromCard(room.id, "air-bed");
                                }}
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ) : null}
                          {extraInventoryByRoomId[room.id].rollaways ? (
                            <span className="gpb-card-extra-badge-row">
                              <span>Раскладушка +{extraInventoryByRoomId[room.id].rollaways}</span>
                              <button
                                aria-label="Удалить раскладушку"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeExtraInventoryTypeFromCard(room.id, "rollaway");
                                }}
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                      {roomDateOverrides[room.id] ? (
                        <span className="gpb-card-date-badge" onClick={(event) => event.stopPropagation()}>
                          {formatShortDayMonth(roomDateOverrides[room.id].checkIn)} - {formatShortDayMonth(roomDateOverrides[room.id].checkOut)}
                          <button
                            aria-label="Сбросить даты номера"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRoomDateOverrides((current) => {
                                const next = { ...current };
                                delete next[room.id];
                                return next;
                              });
                            }}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ) : null}
                      <span className="gpb-panel-object-info">
                        <strong>{getPanelObjectCapacityTitle(room)}</strong>
                        <small>{getPanelObjectMetaLine(room)}</small>
                      </span>
                      <PanelObjectPriceGrid room={room} date={checkIn} />
                      <span className="gpb-card-actions">
                        <button
                          aria-label="Отправить фото"
                          disabled={isBookingLocked || !room.photoPaths.length || sendState === "sending"}
                          title="Отправить фото"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void sendRoomPhotoFromCard(room);
                          }}
                        >
                          <Image size={16} />
                        </button>
                        <button
                          aria-label="Отправить видео"
                          disabled={isBookingLocked || !room.videoPaths.length || sendState === "sending"}
                          title="Отправить видео"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void sendRoomVideoFromCard(room);
                          }}
                        >
                          <Video size={16} />
                        </button>
                        <button
                          aria-label="Даты номера"
                          disabled={isBookingLocked}
                          title="Даты номера"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setRoomDateEditTarget(room);
                          }}
                        >
                          <CalendarDays size={16} />
                        </button>
                        <button
                          aria-label="Добавить допместо"
                          disabled={isBookingLocked}
                          title="Добавить допместо"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExtraInventoryPickerRoomId((currentId) => currentId === room.id ? "" : room.id);
                          }}
                        >
                          <Plus size={17} />
                        </button>
                        {extraInventoryPickerRoomId === room.id ? (
                          <span className="gpb-card-extra-menu" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={() => addExtraInventoryFromCard(room.id, "air-bed")}>
                              Надувной матрас
                            </button>
                            <button type="button" onClick={() => addExtraInventoryFromCard(room.id, "rollaway")}>
                              Раскладушка
                            </button>
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="gpb-send-object-actions">
                  <button className="gpb-primary gpb-send-object-button" type="button" onClick={sendSelectedRoomToWhatsApp} disabled={isBookingConfirmed || !(selectedBookingRooms.length || selectedRoom) || sendState === "sending"}>
                    <Send size={17} />
                    <span>{sendState === "sending" ? "..." : "Номера"}</span>
                  </button>
                  <button className="gpb-secondary gpb-send-object-button" type="button" onClick={() => {
                    setPricePdfMode("chat");
                    openPricePdfOptions();
                  }} disabled={isBookingConfirmed || !catalogPanelRooms.length || sendState === "sending"}>
                    <Send size={17} />
                    <span>{sendState === "sending" ? "..." : "Прайс"}</span>
                  </button>
                  <button className="gpb-secondary gpb-send-object-button" type="button" onClick={() => setIsInvoiceOpen(true)} disabled={sendState === "sending"}>
                    <Banknote size={17} />
                    <span>Счет</span>
                  </button>
                  <button className="gpb-secondary gpb-send-object-button" type="button" onClick={sendObjectGalleryPhotosToWhatsApp} disabled={!objectGalleryPhotoPaths.length || sendState === "sending"}>
                    <Image size={17} />
                    <span>{sendState === "sending" ? "..." : "Объект"}</span>
                  </button>
                  <button className="gpb-secondary gpb-send-object-button" type="button" onClick={sendObjectGalleryVideosToWhatsApp} disabled={!objectGalleryVideoPaths.length || sendState === "sending"}>
                    <Video size={17} />
                    <span>{sendState === "sending" ? "..." : "Объект"}</span>
                  </button>
                  <button className="gpb-secondary gpb-send-object-button" type="button" onClick={sendMenuPdfToWhatsApp} disabled={!activeMenuItems.length || sendState === "sending"}>
                    <Utensils size={17} />
                    <span>{sendState === "sending" ? "..." : "Меню"}</span>
                  </button>
                </div>
                {sendState === "error" ? (
                  <div className="gpb-send-error">Не нашел поле сообщения. Откройте нужный чат WhatsApp и попробуйте еще раз.</div>
                ) : null}
              </>
            ) : (
              <div className="gpb-empty-state">На выбранные даты свободных объектов нет.</div>
            )}
            {lastReservation?.status === "booked" ? null : <AvailabilityConflictList conflicts={roomAvailabilityConflicts} checkIn={checkIn} checkOut={checkOut} />}
        </div>
      </section>

      <section
        className={`gpb-section gpb-reservation-form gpb-workflow-section ${activeWorkflowBlock === "booking" ? "is-active" : ""}`}
        onClick={() => setActiveWorkflowBlock("booking")}
        onFocusCapture={() => setActiveWorkflowBlock("booking")}
      >
        <div className="gpb-flat-section-body">
            {hasHourlyBookingObject ? (
              <div className="gpb-sauna-hours-row">
                <label>
                  Часы сауны
                  <input
                    disabled={isBookingLocked}
                    min="2"
                    type="number"
                    value={hourlyHours}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const nextHours = Math.max(2, toNumber(event.target.value, 2));
                      setHourlyHours(nextHours);
                      setCheckOutTime(addHoursToTimeInput(checkInTime, nextHours));
                      setManualTotalAmount(0);
                      setLastReservation(null);
                      setAgreementSent(false);
                    }}
                  />
                </label>
                <label>
                  с
                  <input
                    disabled={isBookingLocked}
                    type="time"
                    value={checkInTime}
                    onChange={(event) => {
                      const nextTime = event.target.value;
                      setCheckInTime(nextTime);
                      setCheckOutTime(addHoursToTimeInput(nextTime, hourlyHours));
                      setManualTotalAmount(0);
                      setLastReservation(null);
                      setAgreementSent(false);
                    }}
                  />
                </label>
                <label>
                  по
                  <input readOnly type="time" value={addHoursToTimeInput(checkInTime, hourlyHours)} />
                </label>
                {selectedHourlyConflicts.length ? (
                  <div className="gpb-sauna-time-warning">
                    Сауна занята: {selectedHourlyConflicts.map(({ reservation }) => `${reservation.checkInTime}-${getReservationHourlyEndTime(reservation)}`).join(", ")}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="gpb-booking-summary-shell">
              <div className="gpb-booking-agreement-grid">
              <div className="gpb-booking-agreement-summary">
                <div className="gpb-agreement-summary-head">
                  <strong>На согласование</strong>
                  <button
                    type="button"
                    onClick={copyReservationAgreementText}
                    disabled={!currentReservationDraft}
                    className={agreementCopyState === "copied" ? "is-copied" : ""}
                    title={agreementCopyState === "copied" ? "Скопировано" : "Копировать текст"}
                  >
                    <Copy size={15} />
                  </button>
                </div>
                {currentReservationDraft ? (
                  <textarea
                    className="gpb-reservation-summary"
                    readOnly
                    value={buildReservationMessage(currentReservationDraft, rooms)}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Текст на согласование"
                  />
                ) : null}
              </div>

              <div className={`gpb-booking-total ${isBookingLocked ? "is-locked" : ""}`}>
                <div className="gpb-total-head">
                  <strong>Итоговая сумма</strong>
                  <span>Скидка, %</span>
                </div>
                <div className="gpb-total-control-row">
                  <label className="gpb-total-amount-input">
                    <input
                      aria-label="Итоговая сумма"
                      disabled={isBookingLocked}
                      inputMode="numeric"
                      value={getPriceInputValue(effectiveBookingTotals.total, isManualTotalFocused)}
                      onBlur={() => setIsManualTotalFocused(false)}
                      onChange={(event) => updateManualTotalAmount(parsePriceInput(event.target.value))}
                      onFocus={(event) => {
                        setIsManualTotalFocused(true);
                        event.currentTarget.select();
                      }}
                    />
                  </label>
                  <div className="gpb-discount-label">
                    <div className="gpb-discount-stepper">
                      <button type="button" onClick={() => updateDiscountPercent(discountPercent - 1)} disabled={isBookingLocked || discountPercent <= 0}>
                        -
                      </button>
                      <input
                        aria-label="Скидка в процентах"
                        disabled={isBookingLocked}
                        inputMode="numeric"
                        type="text"
                        value={`${effectiveBookingTotals.discountPercent}%`}
                        onBlur={() => setIsDiscountFocused(false)}
                        onChange={(event) => updateDiscountPercent(toNumber(event.target.value.replace(/\D/g, ""), 0))}
                        onFocus={(event) => {
                          setIsDiscountFocused(true);
                          event.currentTarget.select();
                        }}
                      />
                      <button type="button" onClick={() => updateDiscountPercent(discountPercent + 1)} disabled={isBookingLocked || discountPercent >= 100}>
                        +
                      </button>
                    </div>
                  </div>
                </div>
                <div className="gpb-package-toggle-row">
                  {packageDiscountPercent > 0 ? (
                    <label className={`gpb-package-discount-toggle ${packageDiscountEnabled && isPackageDiscountEligible ? "is-active" : ""}`}>
                      <input
                        checked={packageDiscountEnabled}
                        disabled={isBookingLocked}
                        type="checkbox"
                        onChange={(event) => togglePackageDiscount(event.target.checked)}
                      />
                      <span>Пакетная скидка</span>
                    </label>
                  ) : null}
                  <label className={`gpb-package-discount-toggle ${!breakfastIncluded ? "is-active" : ""}`}>
                    <input
                      checked={!breakfastIncluded}
                      disabled={isBookingLocked}
                      type="checkbox"
                      onChange={(event) => {
                        setBreakfastIncluded(!event.target.checked);
                        setManualTotalAmount(0);
                        setLastReservation(null);
                        setAgreementSent(false);
                      }}
                    />
                    <span>Без завтрака</span>
                  </label>
                </div>
                <div className="gpb-sale-payment-block">
                  <span>Способ оплаты</span>
                  <div className="gpb-manual-sale-payment">
                    {configuredPaymentMethods.map((method) => (
                      <button
                        className={manualSalePaymentMethod === method.id ? "is-active" : ""}
                        key={method.id}
                        type="button"
                        onClick={() => {
                          setManualSalePaymentMethod(method.id);
                          setIsPaymentMethodRequiredOpen(false);
                          if (lastReservation) {
                            void updateReservation({ ...lastReservation, paymentMethod: method.id });
                          } else {
                            setAgreementSent(false);
                          }
                        }}
                        disabled={Boolean(lastReservation?.noShowAt || lastReservation?.status === "cancelled")}
                      >
                        <span>{method.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="gpb-booking-total-actions">
                  <button
                    className={`gpb-payment-mark-button ${lastReservation?.prepaymentReceivedAt ? "is-done" : ""}`}
                    type="button"
                    onClick={() => {
                      const reservation = lastReservation ?? currentReservationDraft;
                      if (reservation) void togglePrepaymentPaid(reservation);
                    }}
                    disabled={Boolean(lastReservation?.noShowAt || lastReservation?.status === "cancelled") || (!lastReservation && !currentReservationDraft)}
                  >
                    <Check size={15} />
                    <span>{lastReservation?.prepaymentReceivedAt ? "Предоплата получена" : "Внести предоплату"}</span>
                  </button>
                  <button
                    className={`gpb-payment-mark-button ${lastReservation?.balancePaidAt ? "is-done" : ""}`}
                    type="button"
                    onClick={() => lastReservation && toggleBalancePaid(lastReservation)}
                    disabled={!lastReservation || lastReservation.status === "cancelled" || Boolean(lastReservation.noShowAt)}
                  >
                    <Check size={15} />
                    <span>Доплата получена</span>
                  </button>
                  <button
                    className={`gpb-payment-mark-button ${lastReservation?.checkedInAt ? "is-done" : ""}`}
                    type="button"
                    onClick={() => lastReservation && toggleCheckedIn(lastReservation)}
                    disabled={!lastReservation || lastReservation.status === "cancelled" || Boolean(lastReservation.noShowAt)}
                  >
                    <Check size={15} />
                    <span>Гость въехал</span>
                  </button>
                  <button
                    className="gpb-payment-mark-button"
                    type="button"
                    onClick={() => lastReservation && setExtendReservationTarget(lastReservation)}
                    disabled={!lastReservation || lastReservation.status === "cancelled" || Boolean(lastReservation.noShowAt)}
                  >
                    <Plus size={15} />
                    <span>Продлить</span>
                  </button>
                </div>
              </div>
              </div>
              {prepaymentAmountTarget ? (
                <InlinePrepaymentAmountOverlay
                  reservation={prepaymentAmountTarget}
                  onClose={() => setPrepaymentAmountTarget(null)}
                  onConfirm={(amount) => void confirmPrepaymentAmount(prepaymentAmountTarget, amount)}
                />
              ) : null}
              {balanceRoomSelectionTarget ? (
                <InlineReservationRoomActionOverlay
                  actionLabel="Принять доплату"
                  emptyLabel="Нет номеров"
                  reservation={balanceRoomSelectionTarget}
                  rooms={pricedRooms}
                  selectedRoomId={selectedBalanceRoomId}
                  title="Доплата по номеру"
                  onClose={() => setBalanceRoomSelectionTarget(null)}
                  onSelect={setSelectedBalanceRoomId}
                  onConfirm={(roomId) => {
                    void markReservationBalancePaid(balanceRoomSelectionTarget, roomId);
                    setBalanceRoomSelectionTarget(null);
                  }}
                />
              ) : null}
              {checkInRoomSelectionTarget ? (
                <InlineReservationRoomActionOverlay
                  actionLabel="Отметить въезд"
                  emptyLabel="Нет номеров"
                  reservation={checkInRoomSelectionTarget}
                  rooms={pricedRooms}
                  selectedRoomId={selectedCheckInRoomId}
                  title="Въезд по номеру"
                  onClose={() => setCheckInRoomSelectionTarget(null)}
                  onSelect={setSelectedCheckInRoomId}
                  onConfirm={(roomId) => {
                    void markReservationCheckedIn(checkInRoomSelectionTarget, roomId);
                    setCheckInRoomSelectionTarget(null);
                  }}
                />
              ) : null}
              {extendReservationTarget ? (
                <InlineReservationExtendOverlay
                  reservation={extendReservationTarget}
                  onClose={() => setExtendReservationTarget(null)}
                  onConfirm={(nights, amount, paidNow) => void confirmReservationExtension(extendReservationTarget, nights, amount, paidNow)}
                />
              ) : null}
              {isPaymentMethodRequiredOpen ? (
                <PaymentMethodRequiredOverlay
                  methods={configuredPaymentMethods}
                  onClose={() => setIsPaymentMethodRequiredOpen(false)}
                  onSelect={(methodId) => {
                    setManualSalePaymentMethod(methodId);
                    setIsPaymentMethodRequiredOpen(false);
                  }}
                />
              ) : null}
            </div>
            {lastReservation?.status === "booked" ? (
              <>
                <div className="gpb-addon-sales-block">
                  <div className="gpb-addon-sales-head">
                    <strong>Доп продажи</strong>
                    <span>{addOnSaleServiceRoom ? addOnSaleServiceRoom.title : "Нет услуги"}</span>
                  </div>
                  {addOnSaleServiceRoom ? (
                    <>
                      <div className="gpb-addon-sales-grid">
                        <label>
                          Дата
                          <input type="date" value={addOnSaleDate} onChange={(event) => setAddOnSaleDate(event.target.value)} />
                        </label>
                        <label>
                          С
                          <input type="time" value={addOnSaleStartTime} onChange={(event) => setAddOnSaleStartTime(event.target.value)} />
                        </label>
                        <label>
                          Часы
                          <input
                            min="2"
                            type="number"
                            value={addOnSaleHours}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => setAddOnSaleHours(Math.max(2, toNumber(event.target.value, 2)))}
                          />
                        </label>
                        <label>
                          По
                          <input readOnly type="time" value={addOnSaleEndTime} />
                        </label>
                      </div>
                      <div className="gpb-addon-sales-summary">
                        <span>{formatPrice(addOnSaleTotal)}</span>
                        <label>
                          <input type="checkbox" checked={addOnSalePaidNow} onChange={(event) => setAddOnSalePaidNow(event.target.checked)} />
                          Оплачено сейчас
                        </label>
                        <select
                          aria-label="Способ оплаты доп продажи"
                          disabled={!addOnSalePaidNow}
                          value={addOnSalePaymentMethod}
                          onChange={(event) => setAddOnSalePaymentMethod(event.target.value)}
                        >
                          <option value="">Не оплачено</option>
                          {configuredPaymentMethods.map((method) => (
                            <option key={method.id} value={method.id}>{method.label}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={saveAddOnSale}
                          disabled={addOnSaleState === "saving" || addOnSaleConflicts.length > 0 || (addOnSalePaidNow && !addOnSalePaymentMethod)}
                        >
                          {addOnSaleState === "saving" ? "Сохраняю..." : addOnSaleState === "saved" ? "Сохранено" : "Добавить"}
                        </button>
                      </div>
                      {addOnSaleConflicts.length ? (
                        <div className="gpb-addon-sales-warning">
                          Занято: {addOnSaleConflicts.map(({ reservation }) => `${reservation.checkInTime}-${getReservationHourlyEndTime(reservation)}`).join(", ")}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <small>Добавьте сауну в настройках объектов, чтобы продавать её как доп услугу.</small>
                  )}
                </div>
                <div className="gpb-addon-sales-block">
                  <div className="gpb-addon-sales-head">
                    <strong>Кухня</strong>
                    <button className="gpb-addon-create-button" type="button" onClick={() => setKitchenSaleOpen((current) => !current)}>
                      <Plus size={15} />
                      {kitchenSaleOpen ? "Закрыть" : "Добавить"}
                    </button>
                  </div>
                  {kitchenSaleOpen ? (
                    activeMenuItems.length ? (
                      <div className="gpb-kitchen-sale-form">
                        <div className="gpb-kitchen-sales-grid">
                          <label>
                            Меню
                            <select
                              value={kitchenMenuItemId}
                              onChange={(event) => {
                                const nextItem = activeMenuItems.find((item) => item.id === event.target.value) ?? null;
                                setKitchenMenuItemId(event.target.value);
                                setKitchenUnitPrice(nextItem?.price ?? 0);
                              }}
                            >
                              <option value="">Выберите блюдо</option>
                              {activeMenuItems.map((item) => (
                                <option key={item.id} value={item.id}>{item.title}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Порций
                            <span className="gpb-kitchen-stepper">
                              <button type="button" onClick={() => setKitchenPortions((current) => Math.max(1, current - 1))}>-</button>
                              <input min="1" type="number" value={kitchenPortions} onChange={(event) => setKitchenPortions(Math.max(1, toNumber(event.target.value, 1)))} />
                              <button type="button" onClick={() => setKitchenPortions((current) => current + 1)}>+</button>
                            </span>
                          </label>
                          <label>
                            Цена
                            <input inputMode="numeric" value={formatExpenseAmountInput(String(kitchenUnitPrice))} onChange={(event) => setKitchenUnitPrice(parsePriceInput(event.target.value))} />
                          </label>
                          <label>
                            Итого
                            <input readOnly value={formatPrice(kitchenSaleTotal)} />
                          </label>
                        </div>
                        <div className="gpb-kitchen-payment-row">
                          <label>
                            <input type="checkbox" checked={kitchenSalePaidNow} onChange={(event) => setKitchenSalePaidNow(event.target.checked)} />
                            Оплачено сейчас
                          </label>
                          <select
                            aria-label="Способ оплаты кухни"
                            disabled={!kitchenSalePaidNow}
                            value={kitchenSalePaymentMethod}
                            onChange={(event) => setKitchenSalePaymentMethod(event.target.value)}
                          >
                            <option value="">Не оплачено</option>
                            {configuredPaymentMethods.map((method) => (
                              <option key={method.id} value={method.id}>{method.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={saveKitchenSale}
                            disabled={!selectedKitchenMenuItem || kitchenSaleState === "saving" || (kitchenSalePaidNow && !kitchenSalePaymentMethod)}
                          >
                            {kitchenSaleState === "saving" ? "Сохраняю..." : kitchenSaleState === "saved" ? "Сохранено" : "Добавить"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <small>Добавьте блюда во вкладке настроек «Меню».</small>
                    )
                  ) : null}
                  {kitchenAddOnSales.length ? (
                    <div className="gpb-kitchen-sales-list">
                      {kitchenAddOnSales.map((sale) => (
                        <div className="gpb-kitchen-sales-row" key={sale.id}>
                          <span>{formatKitchenSaleRowLabel(sale)}</span>
                          <strong>{formatPrice(sale.total)}</strong>
                          <button type="button" onClick={() => void removeKitchenSale(sale.id)} title="Удалить позицию">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="gpb-kitchen-sales-total">
                        <span>Итого по кухне</span>
                        <strong>{formatPrice(kitchenAddOnSalesTotal)}</strong>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
            <div className="gpb-booking-action-grid">
              <button className={canSendAgreementText && !agreementSent && sendState !== "sending" && !isBookingConfirmed ? "gpb-primary" : "gpb-secondary"} type="button" onClick={sendReservationToWhatsApp} disabled={isBookingConfirmed || !canSendAgreementText || sendState === "sending"}>
                <ClipboardPaste size={13} />
                <span>{sendState === "sending" ? "Отправляю..." : "На согласование"}</span>
              </button>
              <button className="gpb-secondary" type="button" onClick={sendReservationTotalToWhatsApp} disabled={isBookingConfirmed || !canSendAgreementText || sendState === "sending"}>
                <span>Отправить Итого</span>
              </button>
              {lastReservation?.status === "booked" ? (
                <button className="gpb-secondary is-danger" type="button" onClick={() => setCancelReservationTarget(lastReservation)}>
                  <span>Снять бронь</span>
                </button>
              ) : (
                <button className={canConfirmAgreement ? "gpb-primary" : "gpb-secondary"} type="button" onClick={handleConfirmReservation} disabled={!canConfirmAgreement}>
                  <span>Подтвердить бронь</span>
                </button>
              )}
              <button className="gpb-secondary" type="button" onClick={sendBookingPriceProposalToWhatsApp} disabled={isBookingConfirmed || !canSendAgreementText || !selectedBookingRooms.length || sendState === "sending"}>
                <span>{sendState === "sending" ? "Отправляю..." : "На согласование"}</span>
                <b>PDF</b>
              </button>
              <button className="gpb-secondary" type="button" onClick={sendReservationPaymentConfirmationToWhatsApp} disabled={!canSendAgreementText || sendState === "sending"}>
                <span>Отправить подтверждение</span>
              </button>
              <button className="gpb-secondary is-danger gpb-clear-booking-button" type="button" onClick={clearCurrentBooking} disabled={isBookingLocked || clearBookingState === "clearing"}>
                <span>{clearBookingState === "clearing" ? "Очищаю..." : clearBookingState === "cleared" ? "Очищено" : "Очистить бронирование"}</span>
              </button>
            </div>
            <label className="gpb-admin-comment-field">
              <span>Комментарий админу</span>
              <textarea
                value={adminComment}
                onChange={(event) => updateAdminCommentValue(event.target.value)}
                placeholder="Например: поставить матрас, подготовить сауну, встретить после 19:00"
                rows={2}
              />
              <div className="gpb-admin-comment-tools">
                <button
                  className={adminCommentVoiceState === "listening" ? "is-recording" : ""}
                  type="button"
                  onClick={toggleAdminCommentVoiceInput}
                  title={adminCommentVoiceState === "unsupported" ? "Голосовой ввод недоступен" : adminCommentVoiceState === "listening" ? "Остановить запись" : "Голосовой ввод"}
                >
                  <Mic size={16} />
                  <span>{adminCommentVoiceState === "listening" ? "Идет запись" : "Микрофон"}</span>
                </button>
                {adminCommentVoiceState === "listening" ? <small className="is-recording">Говорите, запись включена</small> : null}
              </div>
              {adminCommentVoiceState === "unsupported" ? <small>Голосовой ввод недоступен в этом браузере.</small> : null}
            </label>
        </div>
      </section>

      <section
        className={`gpb-section gpb-panel-links gpb-workflow-section ${activeWorkflowBlock === "links" ? "is-active" : ""}`}
        onClick={() => setActiveWorkflowBlock("links")}
        onFocusCapture={() => setActiveWorkflowBlock("links")}
      >
        <details className="gpb-extra-details" open={activeBookingPanel === "links"}>
          <summary onClick={(event) => {
            event.preventDefault();
            setActiveBookingPanel((currentPanel) => currentPanel === "links" ? null : "links");
          }}>Ссылки</summary>
          <div className="gpb-extra-details-body">
            <div className="gpb-link-send-list">
              {configuredLinkMethods.map((method) => (
                <button
                  className="gpb-secondary"
                  key={method.id}
                  type="button"
                  onClick={() => sendLinkMethodToClient(method.id)}
                  disabled={!linkMethods[method.id]?.trim() || sendState === "sending"}
                >
                  <Send size={16} />
                  <span>{sendState === "sending" ? "Отправляю..." : `Отправить ссылку ${method.label}`}</span>
                </button>
              ))}
            </div>
          </div>
        </details>
      </section>

      {isQuickPhraseFormOpen ? (
        <div className="gpb-create-backdrop gpb-quick-phrase-modal-backdrop">
          <form className="gpb-create-modal gpb-quick-phrase-modal" onSubmit={handleCreateQuickPhrase} role="dialog" aria-modal="true" aria-label="Добавить заготовку">
            <header className="gpb-create-header">
              <div>
                <strong>Новая заготовка</strong>
                <span>Текст появится новым чипом в списке быстрых фраз.</span>
              </div>
              <button type="button" onClick={() => setIsQuickPhraseFormOpen(false)} title="Закрыть">
                <X size={18} />
              </button>
            </header>
            <div className="gpb-create-form">
              <label className="gpb-grid-full">
                Текст
                <textarea
                  autoFocus
                  value={newQuickPhrase}
                  onChange={(event) => setNewQuickPhrase(event.target.value)}
                  placeholder="Например: Сейчас проверю свободные номера."
                />
              </label>
            </div>
            <footer className="gpb-create-footer">
              <button className="gpb-secondary" type="button" onClick={() => setIsQuickPhraseFormOpen(false)}>Отмена</button>
              <button className="gpb-primary" type="submit">Добавить</button>
            </footer>
          </form>
        </div>
      ) : null}

      {roomDateEditTarget ? (
        <RoomDateOverrideModal
          checkIn={roomDateOverrides[roomDateEditTarget.id]?.checkIn ?? checkIn}
          checkOut={roomDateOverrides[roomDateEditTarget.id]?.checkOut ?? checkOut}
          fallbackCheckIn={checkIn}
          fallbackCheckOut={checkOut}
          room={roomDateEditTarget}
          onClose={() => setRoomDateEditTarget(null)}
          onSave={(nextCheckIn, nextCheckOut) => {
            setRoomDateOverrides((current) => {
              const next = { ...current };
              if (nextCheckIn === checkIn && nextCheckOut === checkOut) {
                delete next[roomDateEditTarget.id];
              } else {
                next[roomDateEditTarget.id] = { checkIn: nextCheckIn, checkOut: nextCheckOut };
              }
              return next;
            });
            setAgreementSent(false);
            setRoomDateEditTarget(null);
          }}
        />
      ) : null}

      {isPricePdfOptionsOpen ? (
        <PricePdfOptionsModal
          draggedRoomId={draggedPricePdfRoomId}
          galleryPhotoCount={objectGalleryPhotoPaths.length}
          galleryPhotoPaths={objectGalleryPhotoPaths}
          galleryVideoCount={objectGalleryVideoPaths.length}
          galleryVideoPaths={objectGalleryVideoPaths}
          groupPeriodTotals={pricePdfGroupPeriodTotals}
          availabilitySummary={pricePdfAvailabilitySummary}
          checkIn={checkIn}
          checkOut={checkOut}
          defaultCheckInTime={defaultCheckInTime}
          defaultCheckOutTime={DEFAULT_CHECK_OUT_TIME}
          discountPercent={packageDiscountPercent}
          giftText={packageGiftText}
          includeGallery={includeGalleryInPricePdf}
          linkIds={pricePdfLinkIds}
          linkMethods={configuredLinkMethods.map((method) => ({ ...method, value: linkMethods[method.id] ?? "" }))}
          minRooms={packageMinRooms}
          options={pricePdfSummaryOptions}
          periodDiscountFrom={packagePeriodDiscountFrom}
          periodDiscountPercent={packagePeriodDiscountPercent}
          periodDiscountTo={packagePeriodDiscountTo}
          rooms={packageIncludeAmenities ? visibleAvailableRooms : visibleAvailableRooms.filter((room) => room.category !== "amenity")}
          selectedRoomIds={pricePdfRoomIds}
          submitLabel={pricePdfMode === "external" ? "Скачать PDF" : "Отправить прайс"}
          summary={pricePdfAvailabilitySummary}
          onClose={() => setIsPricePdfOptionsOpen(false)}
          onDragEnd={() => setDraggedPricePdfRoomId("")}
          onDragStart={setDraggedPricePdfRoomId}
          onDropRoom={movePricePdfRoom}
          onGroupPeriodTotalsChange={handlePricePdfGroupPeriodTotalsChange}
          onIncludeGalleryChange={handlePricePdfIncludeGalleryChange}
          onPeriodDiscountChange={(patch) => void handlePricePdfPeriodDiscountChange(patch)}
          onCopyLink={copyPricePdfLink}
          onDownloadStory={pricePdfMode === "external" ? () => void downloadSocialPriceImagesFromPdfSelection() : undefined}
          onSubmitStory={pricePdfMode === "chat" ? (items) => sendPriceStoryToWhatsApp(items) : undefined}
          onSubmit={() => void sendPriceProposalToWhatsApp(pricePdfSummaryOptions, pricePdfMode)}
          onToggleLink={togglePricePdfLink}
          onToggle={togglePricePdfSummaryOption}
          onToggleRoom={togglePricePdfRoom}
        />
      ) : null}

      {isSocialPriceImageOpen ? (
        <SocialPriceImageModal
          checkIn={checkIn}
          checkOut={checkOut}
          description={socialPriceDescription}
          rooms={packageIncludeAmenities ? visibleAvailableRooms : visibleAvailableRooms.filter((room) => room.category !== "amenity")}
          selectedRoomIds={socialPriceRoomIds}
          onClose={() => setIsSocialPriceImageOpen(false)}
          onDescriptionChange={setSocialPriceDescription}
          onDownload={() => void downloadSocialPriceImage()}
          onToggleRoom={toggleSocialPriceRoom}
        />
      ) : null}

      {isCatalogOpen ? <RoomCatalogModal
        customAmenityOptions={customAmenityOptions}
        customFoodOptions={customFoodOptions}
        customHolidayDates={customHolidayDates}
        customSleepingPlaceOptions={customSleepingPlaceOptions}
        defaultCheckInTime={defaultCheckInTime}
        defaultCheckOutTime={DEFAULT_CHECK_OUT_TIME}
        dynamicPricingEnabled={dynamicPricingEnabled}
        dynamicPricingMarginPercent={dynamicPricingMarginPercent}
        dynamicPricingSeasonEnd={dynamicPricingSeasonEnd}
        onCustomAmenityOptionsChange={async (options) => {
          const nextOptions = normalizeStringOptions(options);
          setCustomAmenityOptions(nextOptions);
          saveCustomCatalogOptionsToLocal(nextOptions, customFoodOptions);
          await savePaymentSettings(buildPaymentSettingsPatch({ customAmenityOptions: nextOptions }));
        }}
        onCustomFoodOptionsChange={async (options) => {
          const nextOptions = normalizeStringOptions(options);
          setCustomFoodOptions(nextOptions);
          saveCustomCatalogOptionsToLocal(customAmenityOptions, nextOptions);
          await savePaymentSettings(buildPaymentSettingsPatch({ customFoodOptions: nextOptions }));
        }}
        onCustomHolidayDatesChange={handleCustomHolidayDatesChange}
        onCustomSleepingPlaceOptionsChange={async (options) => {
          const nextOptions = normalizeStringOptions(options);
          setCustomSleepingPlaceOptions(nextOptions);
          await savePaymentSettings(buildPaymentSettingsPatch({ customSleepingPlaceOptions: nextOptions }));
        }}
        onDynamicPricingChange={async (patch) => {
          const nextEnabled = patch.dynamicPricingEnabled ?? dynamicPricingEnabled;
          const nextMarginPercent = patch.dynamicPricingMarginPercent ?? dynamicPricingMarginPercent;
          const nextSeasonEnd = patch.dynamicPricingSeasonEnd ?? dynamicPricingSeasonEnd;
          setDynamicPricingEnabled(nextEnabled);
          setDynamicPricingMarginPercent(nextMarginPercent);
          setDynamicPricingSeasonEnd(nextSeasonEnd);
          await savePaymentSettings(buildPaymentSettingsPatch({
            dynamicPricingEnabled: nextEnabled,
            dynamicPricingMarginPercent: nextMarginPercent,
            dynamicPricingSeasonEnd: nextSeasonEnd
          }));
        }}
        onClose={() => {
        setIsCatalogOpen(false);
        loadPanelRooms();
      }} /> : null}
      {isAnalyticsOpen ? (
        <AnalyticsModal
          guestContacts={guestContacts}
          reservations={reservations}
          rooms={rooms}
          onCancelReservation={cancelReservation}
          onClearStatistics={clearStatistics}
          onDeleteReservation={setDeleteReservationTarget}
          onMarkBalancePaid={toggleBalancePaid}
          onMarkCheckedIn={toggleCheckedIn}
          onUpdateReservation={updateReservation}
          onClose={() => setIsAnalyticsOpen(false)}
        />
      ) : null}
      {isReservationsOpen ? (
        <ReservationsModal
          reservations={reservations}
          rooms={rooms}
          onCancelReservation={cancelReservation}
          onDeleteReservation={removeReservation}
          onMarkBalancePaid={toggleBalancePaid}
          onMarkCheckedIn={toggleCheckedIn}
          onUpdateReservation={updateReservation}
          onClose={() => setIsReservationsOpen(false)}
        />
      ) : null}
      {isGuestDatabaseOpen ? (
        <GuestDatabaseModal
          breakfastPricePerPerson={breakfastPricePerPerson}
          reservations={reservations}
          rooms={rooms}
          servicePassword={servicePassword}
          onUpdateReservation={updateReservation}
          onClearFields={clearGuestDatabaseFields}
          onClearRowFields={clearSingleGuestDatabaseRowFields}
          onClose={() => setIsGuestDatabaseOpen(false)}
        />
      ) : null}
      {isExpensesOpen ? (
        <ExpensesModal reservations={reservations} onClose={() => setIsExpensesOpen(false)} />
      ) : null}
      {isInvoiceOpen ? (
        <InvoiceModal
          amount={effectiveBookingTotals.total}
          checkIn={checkIn}
          checkOut={checkOut}
          companyRequisites={companyRequisites}
          guestName={guestFirstName}
          guestPhone={`${guestPhonePrefix}${guestPhone}`}
          rooms={proposalRooms}
          onClose={() => setIsInvoiceOpen(false)}
        />
      ) : null}
      {isSettingsOpen ? (
        <SettingsModal
          companyRequisites={companyRequisites}
          defaultCheckInTime={defaultCheckInTime}
          linkMethods={linkMethods}
          menuItems={menuItems}
          menuUploadItemId={menuUploadItemId}
          objectGalleryPhotoPaths={objectGalleryPhotoPaths}
          objectGalleryUploadState={objectGalleryUploadState}
          objectGalleryVideoPaths={objectGalleryVideoPaths}
          paymentMethods={paymentMethods}
          weatherLatitude={weatherLatitude}
          weatherLocationName={weatherLocationName}
          weatherLongitude={weatherLongitude}
          inventoryAirBeds={inventoryAirBeds}
          inventoryRollaways={inventoryRollaways}
          inventoryCustomFields={inventoryCustomFields}
          packageDiscountPercent={packageDiscountPercent}
          packagePeriodDiscountPercent={packagePeriodDiscountPercent}
          packagePeriodDiscountFrom={packagePeriodDiscountFrom}
          packagePeriodDiscountTo={packagePeriodDiscountTo}
          breakfastPricePerPerson={breakfastPricePerPerson}
          packageCustomFields={packageCustomFields}
          packageGiftText={packageGiftText}
          packageIncludeAmenities={packageIncludeAmenities}
          packageMinRooms={packageMinRooms}
          servicePassword={servicePassword}
          onClose={() => setIsSettingsOpen(false)}
          onCompanyRequisiteChange={handleCompanyRequisiteChange}
          onCompanyRequisiteDelete={handleCompanyRequisiteDelete}
          onCompanyRequisitesSave={handleCompanyRequisitesSave}
          onDefaultCheckInTimeChange={handleDefaultCheckInTimeChange}
          onLinkMethodChange={handleLinkMethodChange}
          onLinkMethodDelete={handleLinkMethodDelete}
          onLinkSettingsSave={handleLinkSettingsSave}
          onMenuItemChange={handleMenuItemChange}
          onMenuItemCreate={handleMenuItemCreate}
          onMenuItemDelete={handleMenuItemDelete}
          onMenuItemPhotoUpload={handleMenuItemPhotoUpload}
          onMenuItemsBulkPriceChange={handleMenuItemsBulkPriceChange}
          onMenuItemsSave={handleMenuItemsSave}
          onObjectGalleryDelete={handleObjectGalleryDelete}
          onObjectGallerySave={handleObjectGallerySave}
          onObjectGalleryUpload={handleObjectGalleryUpload}
          onPaymentMethodChange={handlePaymentMethodChange}
          onPaymentMethodDelete={handlePaymentMethodDelete}
          onPaymentSettingsSave={handlePaymentSettingsSave}
          onWeatherSettingsChange={handleWeatherSettingsChange}
          onInventorySettingsChange={handleInventorySettingsChange}
          onInventoryCustomFieldChange={handleInventoryCustomFieldChange}
          onInventoryCustomFieldDelete={handleInventoryCustomFieldDelete}
          onPackageSettingsChange={handlePackageSettingsChange}
          onPackageCustomFieldChange={handlePackageCustomFieldChange}
          onPackageCustomFieldDelete={handlePackageCustomFieldDelete}
          onServicePasswordChange={handleServicePasswordChange}
        />
      ) : null}
      {cancelReservationTarget ? (
        <CancelReservationModal
          onClose={() => setCancelReservationTarget(null)}
          onSelectReason={handleCancelReservationWithReason}
        />
      ) : null}
      {deleteReservationTarget ? (
        <ConfirmActionModal
          title="Удалить бронь?"
          description={`${deleteReservationTarget.guestFirstName || "Гость"} · удаление без восстановления`}
          confirmLabel="Удалить"
          tone="danger"
          onClose={() => setDeleteReservationTarget(null)}
          onConfirm={() => void removeReservation(deleteReservationTarget)}
        />
      ) : null}
    </aside>
  );
}

function InlinePrepaymentAmountOverlay({
  reservation,
  onClose,
  onConfirm
}: {
  reservation: Reservation;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [value, setValue] = useState(String(reservation.prepayment || Math.round(reservation.total * 0.5)));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const amount = clampNumber(parsePriceInput(value), 0, reservation.total);
  const balance = Math.max(0, reservation.total - amount);

  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }, 0);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(amount);
  }

  return (
    <div className="gpb-inline-prepayment-overlay">
      <form className="gpb-inline-prepayment-card" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label="Сумма предоплаты">
        <header>
          <div>
            <strong>Предоплата получена</strong>
            <span>Введите фактическую сумму, которую внес клиент.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-inline-prepayment-body">
          <label>
            Сумма предоплаты
            <input
              ref={inputRef}
              inputMode="numeric"
              value={formatExpenseAmountInput(value)}
              onChange={(event) => setValue(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="gpb-prepayment-modal-summary">
            <span>Итого: <b>{formatPrice(reservation.total)}</b></span>
            <span>Остаток: <b>{formatPrice(balance)}</b></span>
          </div>
        </div>
        <footer>
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button className="gpb-primary" type="submit">Сохранить</button>
        </footer>
      </form>
    </div>
  );
}

function InlineReservationRoomActionOverlay({
  actionLabel,
  emptyLabel,
  reservation,
  rooms,
  selectedRoomId,
  title,
  onClose,
  onConfirm,
  onSelect
}: {
  actionLabel: string;
  emptyLabel: string;
  reservation: Reservation;
  rooms: Room[];
  selectedRoomId: string;
  title: string;
  onClose: () => void;
  onConfirm: (roomId: string) => void;
  onSelect: (roomId: string) => void;
}) {
  const items = getReservationItems(reservation, rooms).filter((item) => reservation.roomIds.includes(item.roomId));
  const selectedItem = items.find((item) => item.roomId === selectedRoomId) ?? items[0];

  return (
    <div className="gpb-inline-prepayment-overlay">
      <div className="gpb-inline-prepayment-card">
        <header>
          <div>
            <strong>{title}</strong>
            <span>Выберите конкретный номер этой брони.</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </header>
        <div className="gpb-room-action-list">
          {items.length ? items.map((item) => {
            const room = rooms.find((candidate) => candidate.id === item.roomId);
            const label = room ? `${room.number || room.title} | ${formatShortDayMonth(item.checkIn)}-${formatShortDayMonth(item.checkOut)}` : item.roomId;
            const balance = Math.max(0, item.total - (item.paidAmount ?? item.prepayment ?? 0));
            return (
              <button
                className={item.roomId === selectedItem?.roomId ? "is-active" : ""}
                key={item.id}
                type="button"
                onClick={() => onSelect(item.roomId)}
              >
                <span>{label}</span>
                <b>{formatPrice(balance)}</b>
              </button>
            );
          }) : <span className="gpb-room-action-empty">{emptyLabel}</span>}
        </div>
        <footer>
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button
            className="gpb-primary"
            type="button"
            disabled={!selectedItem}
            onClick={() => selectedItem && onConfirm(selectedItem.roomId)}
          >
            {actionLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function InlineReservationExtendOverlay({
  reservation,
  onClose,
  onConfirm
}: {
  reservation: Reservation;
  onClose: () => void;
  onConfirm: (nights: number, amount: number, paidNow: boolean) => void;
}) {
  const [value, setValue] = useState("1");
  const [paidNow, setPaidNow] = useState(false);
  const currentNights = Math.max(1, getNightsCount(reservation.checkIn, reservation.checkOut));
  const defaultExtensionAmount = Math.round(reservation.total / currentNights);
  const [amountValue, setAmountValue] = useState(formatExpenseAmountInput(String(defaultExtensionAmount)));
  const [isAmountEdited, setIsAmountEdited] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const nights = Math.max(1, Number(value.replace(/\D/g, "")) || 1);
  const fallbackExtensionAmount = defaultExtensionAmount * nights;
  const extensionAmount = parsePriceInput(amountValue) || fallbackExtensionAmount;
  const nextCheckOut = formatDateInput(addDays(parseDateInput(reservation.checkOut), nights));
  const currentPaidAmount = getReservationPaidAmount(reservation);
  const nextTotal = reservation.total + extensionAmount;
  const nextPaidAmount = paidNow ? Math.min(nextTotal, currentPaidAmount + extensionAmount) : currentPaidAmount;
  const nextBalance = Math.max(0, nextTotal - nextPaidAmount);

  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }, 0);
  }, []);

  useEffect(() => {
    if (!isAmountEdited) {
      setAmountValue(formatExpenseAmountInput(String(defaultExtensionAmount * nights)));
    }
  }, [defaultExtensionAmount, isAmountEdited, nights]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onConfirm(nights, extensionAmount, paidNow);
  }

  return (
    <div className="gpb-inline-prepayment-overlay">
      <form className="gpb-inline-prepayment-card" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label="Продлить проживание">
        <header>
          <div>
            <strong>Продлить проживание</strong>
            <span>Стоимость считается по цене, по которой клиент заехал.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-inline-prepayment-body">
          <label>
            На сколько ночей продлить
            <input
              ref={inputRef}
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <label>
            Сумма продления
            <input
              inputMode="numeric"
              value={amountValue}
              onChange={(event) => {
                setIsAmountEdited(true);
                setAmountValue(formatExpenseAmountInput(event.target.value));
              }}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="gpb-prepayment-modal-summary">
            <span>Новый выезд: <b>{formatKazakhDate(nextCheckOut)}</b></span>
            <span>Продление: <b>{formatPrice(extensionAmount)}</b></span>
            <span>Итого: <b>{formatPrice(nextTotal)}</b></span>
            <span>Остаток: <b>{formatPrice(nextBalance)}</b></span>
          </div>
          <label className={`gpb-inline-payment-toggle ${paidNow ? "is-active" : ""}`}>
            <input
              checked={paidNow}
              type="checkbox"
              onChange={(event) => setPaidNow(event.target.checked)}
            />
            <span>Продление оплачено сейчас</span>
          </label>
        </div>
        <footer>
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button className="gpb-primary" type="submit">Сохранить</button>
        </footer>
      </form>
    </div>
  );
}

function PaymentMethodRequiredOverlay({
  methods,
  onClose,
  onSelect
}: {
  methods: SettingMethod[];
  onClose: () => void;
  onSelect: (methodId: string) => void;
}) {
  return (
    <div className="gpb-inline-prepayment-overlay">
      <div className="gpb-inline-prepayment-card" role="dialog" aria-modal="true" aria-label="Выберите способ оплаты">
        <header>
          <div>
            <strong>Выберите способ оплаты</strong>
            <span>Перед предоплатой, доплатой или подтверждением нужно отметить способ оплаты.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-payment-required-options">
          {methods.map((method) => (
            <button key={method.id} type="button" onClick={() => onSelect(method.id)}>
              {method.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CancelReservationModal({
  onClose,
  onSelectReason
}: {
  onClose: () => void;
  onSelectReason: (reason: string) => void;
}) {
  return (
    <div className="gpb-create-backdrop">
      <div className="gpb-cancel-reservation-modal" role="dialog" aria-modal="true" aria-label="Причина снятия брони">
        <div className="gpb-create-header">
          <div>
            <strong>Причина снятия брони</strong>
            <span>Выберите вариант, чтобы снять бронь</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="gpb-cancel-reservation-body">
          <button type="button" onClick={() => onSelectReason("Клиент отменил, предоплата не возвращается")}>
            Клиент отменил, предоплата не возвращается
          </button>
          <button type="button" onClick={() => onSelectReason("Отель отменил, предоплата возвращается")}>
            Отель отменил, предоплата возвращается
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({
  amount,
  checkIn,
  checkOut,
  companyRequisites,
  guestName,
  guestPhone,
  rooms,
  onClose
}: {
  amount: number;
  checkIn: string;
  checkOut: string;
  companyRequisites: Record<string, string>;
  guestName: string;
  guestPhone: string;
  rooms: Room[];
  onClose: () => void;
}) {
  const [buyerName, setBuyerName] = useState(guestName || "");
  const [buyerBin, setBuyerBin] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerPhone, setBuyerPhone] = useState(guestPhone || "");
  const [invoiceComment, setInvoiceComment] = useState("");
  const [actionState, setActionState] = useState<"idle" | "copied" | "inserted" | "error">("idle");
  const invoiceText = buildInvoiceText({
    amount,
    buyerAddress,
    buyerBin,
    buyerName,
    buyerPhone,
    checkIn,
    checkOut,
    companyRequisites,
    invoiceComment,
    rooms
  });

  async function copyInvoice() {
    const copied = await copyTextToClipboard(invoiceText);
    setActionState(copied ? "copied" : "error");
    window.setTimeout(() => setActionState("idle"), 2200);
  }

  async function insertInvoice() {
    const inserted = await insertTextIntoActiveWhatsAppChat(invoiceText);
    setActionState(inserted ? "inserted" : "error");
    window.setTimeout(() => setActionState("idle"), 2200);
  }

  return (
    <div className="gpb-create-backdrop gpb-invoice-backdrop">
      <div className="gpb-create-modal gpb-invoice-modal" role="dialog" aria-modal="true" aria-label="Счет на оплату">
        <header className="gpb-create-header">
          <div>
            <strong>Счет на оплату</strong>
            <span>Реквизиты покупателя и текст счета для отправки клиенту.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <main className="gpb-invoice-body">
          <section className="gpb-invoice-section">
            <h2>Покупатель</h2>
            <label>
              Название / ФИО
              <input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} placeholder="Например: ТОО Ромашка" />
            </label>
            <label>
              БИН / ИИН
              <input value={buyerBin} onChange={(event) => setBuyerBin(event.target.value)} placeholder="000000000000" />
            </label>
            <label>
              Телефон
              <input value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} placeholder="+7..." />
            </label>
            <label>
              Адрес
              <input value={buyerAddress} onChange={(event) => setBuyerAddress(event.target.value)} placeholder="Адрес покупателя" />
            </label>
            <label className="gpb-grid-full">
              Комментарий
              <textarea value={invoiceComment} onChange={(event) => setInvoiceComment(event.target.value)} placeholder="Например: счет за проживание и сауну" />
            </label>
          </section>
          <section className="gpb-invoice-section">
            <h2>Предпросмотр</h2>
            <textarea className="gpb-invoice-preview" readOnly value={invoiceText} />
          </section>
        </main>
        <footer className="gpb-create-footer">
          <button className="gpb-secondary gpb-invoice-icon-action" type="button" onClick={onClose} title="Закрыть" aria-label="Закрыть">
            <X size={18} />
          </button>
          <button className="gpb-secondary gpb-invoice-icon-action" type="button" onClick={copyInvoice} title={actionState === "copied" ? "Скопировано" : "Копировать"} aria-label="Копировать">
            <Copy size={18} />
          </button>
          <button className="gpb-primary gpb-invoice-icon-action" type="button" onClick={insertInvoice} title={actionState === "inserted" ? "Вставлено" : "Вставить в чат"} aria-label="Вставить в чат">
            <ClipboardPaste size={18} />
          </button>
          {actionState === "error" ? <span className="gpb-inline-error">Не удалось выполнить действие.</span> : null}
        </footer>
      </div>
    </div>
  );
}

function RoomDateOverrideModal({
  checkIn,
  checkOut,
  fallbackCheckIn,
  fallbackCheckOut,
  room,
  onClose,
  onSave
}: {
  checkIn: string;
  checkOut: string;
  fallbackCheckIn: string;
  fallbackCheckOut: string;
  room: Room;
  onClose: () => void;
  onSave: (checkIn: string, checkOut: string) => void;
}) {
  const [nextCheckIn, setNextCheckIn] = useState(checkIn);
  const [nextCheckOut, setNextCheckOut] = useState(checkOut);
  const isInvalid = !nextCheckIn || !nextCheckOut || nextCheckOut <= nextCheckIn;

  return (
    <div className="gpb-create-backdrop">
      <form
        className="gpb-create-modal gpb-room-date-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Даты номера"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isInvalid) onSave(nextCheckIn, nextCheckOut);
        }}
      >
        <header className="gpb-create-header">
          <div>
            <strong>Даты номера {room.number || room.title}</strong>
            <span>Если номер бронируется на другой период, укажите его отдельно.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-create-form gpb-room-date-form">
          <label>
            Заезд
            <input type="date" value={nextCheckIn} onChange={(event) => setNextCheckIn(event.target.value)} />
          </label>
          <label>
            Выезд
            <input type="date" value={nextCheckOut} onChange={(event) => setNextCheckOut(event.target.value)} />
          </label>
        </div>
        <footer className="gpb-create-footer">
          <button className="gpb-secondary" type="button" onClick={() => onSave(fallbackCheckIn, fallbackCheckOut)}>
            Сбросить
          </button>
          <button className="gpb-primary" type="submit" disabled={isInvalid}>Сохранить</button>
        </footer>
      </form>
    </div>
  );
}

function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  tone = "danger",
  onClose,
  onConfirm
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="gpb-create-backdrop gpb-settings-field-backdrop">
      <div className="gpb-confirm-action-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="gpb-create-header">
          <div>
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <footer className="gpb-create-footer">
          <button type="button" className="gpb-secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className={tone === "danger" ? "gpb-danger-button" : "gpb-primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function PasswordConfirmModal({
  title,
  description,
  confirmLabel,
  expectedPassword,
  onClose,
  onConfirm
}: {
  title: string;
  description: string;
  confirmLabel: string;
  expectedPassword: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const normalizedExpectedPassword = expectedPassword.trim() || "0000";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.trim() !== normalizedExpectedPassword) {
      setError("Неверный пароль");
      return;
    }
    onConfirm();
  }

  return (
    <div className="gpb-create-backdrop gpb-settings-field-backdrop">
      <form className="gpb-confirm-action-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label={title}>
        <header className="gpb-create-header">
          <div>
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-create-form">
          <label className="gpb-grid-full">
            Пароль
            <input autoFocus type="password" value={password} onChange={(event) => {
              setPassword(event.target.value);
              setError("");
            }} />
          </label>
          {error ? <div className="gpb-form-error">{error}</div> : null}
        </div>
        <footer className="gpb-create-footer">
          <button type="button" className="gpb-secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="gpb-danger-button">
            {confirmLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

function GuestDatabaseModal({
  breakfastPricePerPerson,
  reservations,
  rooms,
  servicePassword,
  onUpdateReservation,
  onClearFields,
  onClearRowFields,
  onClose
}: {
  breakfastPricePerPerson: number;
  reservations: Reservation[];
  rooms: Room[];
  servicePassword: string;
  onUpdateReservation: (reservation: Reservation) => Promise<void>;
  onClearFields: () => Promise<void>;
  onClearRowFields: (row: { draftKey?: string; phone: string; reservationId: string }) => Promise<void>;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<GuestContact[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ChatBookingDraft>>({});
  const [isClearingFields, setIsClearingFields] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [activeFilterColumn, setActiveFilterColumn] = useState("");
  const [filterPopoverPosition, setFilterPopoverPosition] = useState({ left: 0, top: 0 });
  const [guestDatabaseFilters, setGuestDatabaseFilters] = useState<Record<string, string>>({});
  const [guestDatabaseSort, setGuestDatabaseSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [editingGuestPhone, setEditingGuestPhone] = useState("");
  const [guestEditForm, setGuestEditForm] = useState<GuestDatabaseEditForm>(createEmptyGuestDatabaseEditForm());
  const [deleteGuestTarget, setDeleteGuestTarget] = useState<GuestDatabaseRow | null>(null);
  const [isClearFieldsConfirmOpen, setIsClearFieldsConfirmOpen] = useState(false);
  const [clearRowTarget, setClearRowTarget] = useState<GuestDatabaseRow | null>(null);

  useEffect(() => {
    let isCancelled = false;
    setStatus("loading");
    Promise.all([getGuestContacts(), getAllChatBookingDrafts()])
      .then(([items, loadedDrafts]) => {
        if (isCancelled) return;
        setContacts(items);
        setDrafts(loadedDrafts);
        setStatus("ready");
      })
      .catch(() => {
        if (isCancelled) return;
        setContacts([]);
        setDrafts({});
        setStatus("error");
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => contacts.map((contact) => buildGuestDatabaseRow(
      contact,
      reservations,
      Object.entries(drafts).map(([key, draft]) => ({ draft, key })),
      rooms,
      breakfastPricePerPerson
    )),
    [breakfastPricePerPerson, contacts, drafts, reservations, rooms]
  );
  const visibleRows = useMemo(
    () => sortGuestDatabaseRows(filterGuestDatabaseRows(rows, guestDatabaseFilters), guestDatabaseSort),
    [guestDatabaseFilters, guestDatabaseSort, rows]
  );
  const guestRoomsColumnWidth = useMemo(() => getGuestDatabaseRoomsColumnWidth(visibleRows), [visibleRows]);
  const activeColumn = GUEST_DATABASE_COLUMNS.find((column) => column.key === activeFilterColumn) ?? null;

  async function handleClearFields() {
    setIsClearingFields(true);
    await onClearFields();
    setDrafts({});
    setIsClearingFields(false);
    setIsClearFieldsConfirmOpen(false);
  }

  function updateGuestDatabaseFilter(key: string, value: string) {
    setGuestDatabaseFilters((current) => {
      const next = { ...current };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function toggleGuestDatabaseMultiFilter(key: string, value: string) {
    setGuestDatabaseFilters((current) => {
      const selected = parseGuestDatabaseMultiFilter(current[key]);
      const nextSelected = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : selected.concat(value);
      const next = { ...current };
      if (nextSelected.length) {
        next[key] = nextSelected.join("||");
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function clearGuestDatabaseColumnFilter(columnKey: string) {
    setGuestDatabaseFilters((current) => {
      const next = { ...current };
      delete next[columnKey];
      delete next[`${columnKey}:from`];
      delete next[`${columnKey}:to`];
      return next;
    });
    setGuestDatabaseSort((current) => current?.key === columnKey ? null : current);
  }

  function toggleGuestDatabaseColumnFilter(columnKey: string, event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const popoverWidth = 360;
    const safeLeft = Math.min(Math.max(12, rect.left), window.innerWidth - popoverWidth - 12);
    setFilterPopoverPosition({ left: safeLeft, top: rect.bottom + 8 });
    setActiveFilterColumn((current) => current === columnKey ? "" : columnKey);
  }

  function startGuestDatabaseEdit(row: GuestDatabaseRow) {
    setEditingGuestPhone(row.phone);
    setGuestEditForm({
      phone: row.phone,
      appeal: row.appeal,
      inquiryDate: formatDateTimeInputValue(row.inquiryDate),
      status: row.statusValue,
      checkIn: row.checkInValue,
      checkOut: row.checkOutValue,
      nights: String(row.nightsValue || ""),
      rooms: row.rooms,
      roomIds: row.roomIds,
      addOnSales: row.addOnSalesValue ? String(row.addOnSalesValue) : "",
      totalSales: row.totalSalesValue ? String(row.totalSalesValue) : "",
      food: row.food,
      sleepingPlaces: String(row.sleepingPlacesValue || ""),
      price: row.priceValue ? String(row.priceValue) : "",
      discountedPrice: row.discountedPriceValue ? String(row.discountedPriceValue) : "",
      prepayment: row.prepaymentValue ? String(row.prepaymentValue) : "",
      prepaymentReceived: row.prepaymentReceived ? "Да" : row.reservationId ? "Нет" : "",
      discountPercent: row.discountValue ? String(row.discountValue) : "",
      balance: row.balanceValue ? String(row.balanceValue) : "",
      paymentMethod: row.paymentMethodValue,
      balancePaid: row.balancePaidValue ? "Да" : row.reservationId ? "Нет" : "",
      checkedIn: row.checkedInValue ? "Да" : row.reservationId ? "Нет" : "",
      checkedOut: row.checkedOutValue ? "Да" : row.reservationId ? "Нет" : ""
    });
  }

  async function saveGuestDatabaseEdit(row: GuestDatabaseRow) {
    const originalPhone = row.phone;
    const nextPhone = formatPhoneDigits(guestEditForm.phone);
    const nextAppeal = guestEditForm.appeal.trim();
    if (!nextPhone || !nextAppeal || !guestEditForm.inquiryDate) return;

    const nextContact: GuestContact = {
      phone: nextPhone,
      appeal: nextAppeal,
      inquiryDate: new Date(guestEditForm.inquiryDate).toISOString()
    };
    if (normalizePhoneSearch(originalPhone) !== normalizePhoneSearch(nextPhone)) {
      await deleteGuestContact(originalPhone);
    }
    const savedContact = await saveGuestContact(nextContact);
    setContacts((current) =>
      current
        .filter((contact) => normalizePhoneSearch(contact.phone) !== normalizePhoneSearch(originalPhone))
        .concat(savedContact)
        .sort((left, right) => right.inquiryDate.localeCompare(left.inquiryDate))
    );
    const reservation = row.reservationId ? reservations.find((item) => item.id === row.reservationId) : null;
    if (reservation) {
      const editedReservation = buildEditedGuestDatabaseReservation(reservation, guestEditForm, rooms);
      void sendDebugLog("guest-database-edit-save", {
        rowPhone: row.phone,
        reservationId: reservation.id,
        formBalance: guestEditForm.balance,
        formPrepayment: guestEditForm.prepayment,
        formDiscountedPrice: guestEditForm.discountedPrice,
        previous: {
          total: reservation.total,
          paidAmount: reservation.paidAmount,
          prepayment: reservation.prepayment,
          balance: getReservationBalance(reservation)
        },
        next: {
          total: editedReservation.total,
          paidAmount: editedReservation.paidAmount,
          prepayment: editedReservation.prepayment,
          balance: getReservationBalance(editedReservation)
        }
      });
      await onUpdateReservation(editedReservation);
      await syncGuestDatabaseAddOnSales(row, guestEditForm, reservations, editedReservation, onUpdateReservation);
      await saveMatchingGuestDatabaseDrafts(row, drafts, guestEditForm, rooms, editedReservation);
      setDrafts((current) => updateMatchingGuestDatabaseDraftState(row, current, guestEditForm, rooms, editedReservation));
    } else {
      await syncGuestDatabaseAddOnSales(row, guestEditForm, reservations, null, onUpdateReservation);
      await saveMatchingGuestDatabaseDrafts(row, drafts, guestEditForm, rooms, null);
      setDrafts((current) => updateMatchingGuestDatabaseDraftState(row, current, guestEditForm, rooms, null));
    }
    setEditingGuestPhone("");
  }

  async function removeGuestDatabaseRow(row: GuestDatabaseRow) {
    await deleteGuestContact(row.phone);
    setContacts((current) => current.filter((contact) => normalizePhoneSearch(contact.phone) !== normalizePhoneSearch(row.phone)));
    setDeleteGuestTarget(null);
  }

  async function handleClearRowFields(row: GuestDatabaseRow) {
    await onClearRowFields({ draftKey: row.draftKey, phone: row.phone, reservationId: row.reservationId });
    if (row.draftKey) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.draftKey];
        return next;
      });
    }
    setClearRowTarget(null);
  }

  return (
    <div className="gpb-modal-backdrop">
      <div className="gpb-catalog-modal gpb-empty-guests-modal" role="dialog" aria-modal="true" aria-label="База гостей">
        <header className="gpb-catalog-header">
          <div>
            <h1>База гостей</h1>
            <span>Контакты, согласования, брони и оплаты в одной строке.</span>
          </div>
          <div className="gpb-catalog-header-actions">
            <button type="button" onClick={() => setIsClearFieldsConfirmOpen(true)} disabled={isClearingFields}>
              {isClearingFields ? "Очищаю..." : "Очистить поля"}
            </button>
            <button className="gpb-icon-only-button" type="button" onClick={onClose} title="Закрыть">
              <X size={20} />
            </button>
          </div>
        </header>
        <main className="gpb-empty-guests-body">
          {status === "loading" ? (
            <div className="gpb-guests-empty-state">Загружаю базу...</div>
          ) : null}
          {status === "error" ? (
            <div className="gpb-guests-empty-state is-error">
              Backend недоступен. Запусти backend и открой базу еще раз.
            </div>
          ) : null}
          {status === "ready" && !contacts.length ? (
            <div className="gpb-guests-empty-state">В базе пока нет гостей.</div>
          ) : null}
          {status === "ready" && rows.length ? (
            <div className="gpb-guests-table" style={{ "--gpb-guests-rooms-width": `${guestRoomsColumnWidth}px` } as React.CSSProperties}>
              <div className="gpb-guests-row is-header">
                {GUEST_DATABASE_COLUMNS.map((column) => (
                  <button
                    className={activeFilterColumn === column.key || hasGuestDatabaseColumnFilter(column.key, guestDatabaseFilters, guestDatabaseSort) ? "is-active" : ""}
                    key={column.key}
                    type="button"
                    onClick={(event) => toggleGuestDatabaseColumnFilter(column.key, event)}
                  >
                    {column.label}
                  </button>
                ))}
                <span>Действия</span>
              </div>
              {activeColumn ? (
                <div className="gpb-guests-filter-popover" style={{ left: filterPopoverPosition.left, top: filterPopoverPosition.top }}>
                  <div>
                    <strong>{activeColumn.label}</strong>
                    <button type="button" onClick={() => setActiveFilterColumn("")}>
                      <X size={14} />
                    </button>
                  </div>
                  <div className="gpb-guests-filter-actions">
                    <button
                      className={guestDatabaseSort?.key === activeColumn.key && guestDatabaseSort.direction === "asc" ? "is-active" : ""}
                      type="button"
                      onClick={() => setGuestDatabaseSort({ key: activeColumn.key, direction: "asc" })}
                    >
                      Сортировать ↑
                    </button>
                    <button
                      className={guestDatabaseSort?.key === activeColumn.key && guestDatabaseSort.direction === "desc" ? "is-active" : ""}
                      type="button"
                      onClick={() => setGuestDatabaseSort({ key: activeColumn.key, direction: "desc" })}
                    >
                      Сортировать ↓
                    </button>
                  </div>
                  {activeColumn.type === "select" ? (
                    <div className="gpb-guests-filter-options">
                      {activeColumn.options?.map((option) => {
                        const selected = parseGuestDatabaseMultiFilter(guestDatabaseFilters[activeColumn.key]).includes(option);
                        return (
                          <button
                            className={selected ? "is-active" : ""}
                            key={option}
                            type="button"
                            onClick={() => toggleGuestDatabaseMultiFilter(activeColumn.key, option)}
                          >
                            <Check size={14} />
                            <span>{option}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : activeColumn.type === "number" ? (
                    <div className="gpb-guests-filter-range">
                      <input
                        inputMode="numeric"
                        placeholder="От"
                        value={guestDatabaseFilters[`${activeColumn.key}:from`] ?? ""}
                        onChange={(event) => updateGuestDatabaseFilter(`${activeColumn.key}:from`, event.target.value.replace(/\D/g, ""))}
                      />
                      <input
                        inputMode="numeric"
                        placeholder="До"
                        value={guestDatabaseFilters[`${activeColumn.key}:to`] ?? ""}
                        onChange={(event) => updateGuestDatabaseFilter(`${activeColumn.key}:to`, event.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  ) : activeColumn.type === "date" ? (
                    <div className="gpb-guests-filter-range">
                      <input type="date" value={guestDatabaseFilters[`${activeColumn.key}:from`] ?? ""} onChange={(event) => updateGuestDatabaseFilter(`${activeColumn.key}:from`, event.target.value)} />
                      <input type="date" value={guestDatabaseFilters[`${activeColumn.key}:to`] ?? ""} onChange={(event) => updateGuestDatabaseFilter(`${activeColumn.key}:to`, event.target.value)} />
                    </div>
                  ) : (
                    <input
                      placeholder="Поиск"
                      value={guestDatabaseFilters[activeColumn.key] ?? ""}
                      onChange={(event) => updateGuestDatabaseFilter(activeColumn.key, event.target.value)}
                    />
                  )}
                  <button type="button" onClick={() => clearGuestDatabaseColumnFilter(activeColumn.key)}>
                    Сбросить колонку
                  </button>
                </div>
              ) : null}
              {visibleRows.map((row) => {
                const isEditing = editingGuestPhone === row.phone;
                return (
                <div className="gpb-guests-row" key={row.phone}>
                  {isEditing ? (
                    <>
                      <input
                        className="gpb-guests-inline-input"
                        value={guestEditForm.phone}
                        onChange={(event) => setGuestEditForm((current) => ({ ...current, phone: event.target.value }))}
                      />
                      <input
                        className="gpb-guests-inline-input"
                        value={guestEditForm.appeal}
                        onChange={(event) => setGuestEditForm((current) => ({ ...current, appeal: event.target.value }))}
                      />
                      <input
                        className="gpb-guests-inline-input"
                        type="datetime-local"
                        value={guestEditForm.inquiryDate}
                        onChange={(event) => setGuestEditForm((current) => ({ ...current, inquiryDate: event.target.value }))}
                      />
                    </>
                  ) : (
                    <>
                      <strong>{formatReservationPhone(row.phone)}</strong>
                      <span>{row.appeal}</span>
                      <span>{formatDateTimeText(row.inquiryDate)}</span>
                    </>
                  )}
                  {isEditing ? (
                    <>
                      <select className="gpb-guests-inline-input" value={guestEditForm.status} onChange={(event) => setGuestEditForm((current) => ({ ...current, status: event.target.value }))}>
                        <option value="">Нет</option>
                        <option value="Прайс отправлен">Прайс отправлен</option>
                        <option value="Номер отправлен">Номер отправлен</option>
                        <option value="На согласовании">На согласовании</option>
                        <option value="Предоплата получена">Предоплата получена</option>
                        <option value="Забронировано">Забронировано</option>
                        <option value="Въехал">Въехал</option>
                        <option value="Продлен">Продлен</option>
                        <option value="Выехал">Выехал</option>
                        <option value="Снято с брони">Снято с брони</option>
                        <option value="Незаезд">Незаезд</option>
                      </select>
                      <input className="gpb-guests-inline-input" type="date" value={guestEditForm.checkIn} onChange={(event) => setGuestEditForm((current) => updateGuestEditCalculatedFields({ ...current, checkIn: event.target.value }, rooms))} />
                      <input className="gpb-guests-inline-input" type="date" value={guestEditForm.checkOut} onChange={(event) => setGuestEditForm((current) => updateGuestEditCalculatedFields({ ...current, checkOut: event.target.value }, rooms))} />
                      <input className="gpb-guests-inline-input" inputMode="numeric" value={guestEditForm.nights} onChange={(event) => setGuestEditForm((current) => {
                        const nights = event.target.value.replace(/\D/g, "");
                        const checkOut = current.checkIn && nights ? formatDateInput(addDays(parseDateInput(current.checkIn), Number(nights))) : current.checkOut;
                        return updateGuestEditCalculatedFields({ ...current, nights, checkOut }, rooms);
                      })} />
                      <details className="gpb-guests-rooms-dropdown">
                        <summary>
                          {guestEditForm.roomIds.length ? getGuestEditRoomLabel(guestEditForm.roomIds, rooms) : "Выбрать номера"}
                        </summary>
                        <div>
                          {rooms.filter((room) => room.bookable && (isStayBookingObject(room) || isHourlyBookingObject(room))).map((room) => {
                            const checked = guestEditForm.roomIds.includes(room.id);
                            return (
                              <label key={room.id}>
                                <input
                                  checked={checked}
                                  type="checkbox"
                                  onChange={() => {
                                    setGuestEditForm((current) => {
                                      const roomIds = current.roomIds.includes(room.id)
                                        ? current.roomIds.filter((roomId) => roomId !== room.id)
                                        : current.roomIds.concat(room.id);
                                      return updateGuestEditCalculatedFields({ ...current, roomIds, rooms: getGuestEditRoomLabel(roomIds, rooms) }, rooms);
                                    });
                                  }}
                                />
                                <span>{room.number ? `${room.number} ${room.title}` : room.title}</span>
                              </label>
                            );
                          })}
                        </div>
                      </details>
                      <select className="gpb-guests-inline-input" value={guestEditForm.food} onChange={(event) => setGuestEditForm((current) => ({ ...current, food: event.target.value }))}>
                        <option value="">Нет</option>
                        <option value="Без завтрака">Без завтрака</option>
                        <option value="Завтрак">Завтрак</option>
                      </select>
                      <input className="gpb-guests-inline-input" inputMode="numeric" value={guestEditForm.sleepingPlaces} onChange={(event) => setGuestEditForm((current) => ({ ...current, sleepingPlaces: event.target.value.replace(/\D/g, "") }))} />
                      <input className="gpb-guests-inline-input" inputMode="numeric" value={formatExpenseAmountInput(guestEditForm.price)} onChange={(event) => setGuestEditForm((current) => ({ ...current, price: event.target.value }))} />
                      <input className="gpb-guests-inline-input" inputMode="numeric" value={guestEditForm.discountPercent} onChange={(event) => setGuestEditForm((current) => updateGuestEditCalculatedFields({ ...current, discountPercent: event.target.value.replace(/\D/g, "") }, rooms))} />
                      <input className="gpb-guests-inline-input" inputMode="numeric" value={formatExpenseAmountInput(guestEditForm.discountedPrice)} onChange={(event) => setGuestEditForm((current) => ({ ...current, discountedPrice: event.target.value }))} />
                      <input className="gpb-guests-inline-input" inputMode="numeric" value={formatExpenseAmountInput(guestEditForm.prepayment)} onChange={(event) => setGuestEditForm((current) => ({ ...current, prepayment: event.target.value }))} />
                      <input className="gpb-guests-inline-input" inputMode="numeric" value={formatExpenseAmountInput(guestEditForm.balance)} onChange={(event) => setGuestEditForm((current) => ({ ...current, balance: event.target.value }))} />
                      <input className="gpb-guests-inline-input" inputMode="numeric" value={formatExpenseAmountInput(guestEditForm.addOnSales)} onChange={(event) => setGuestEditForm((current) => ({ ...current, addOnSales: event.target.value }))} />
                      <input className="gpb-guests-inline-input" inputMode="numeric" readOnly value={formatExpenseAmountInput(guestEditForm.totalSales)} />
                    </>
                  ) : (
                    <>
                      <span className={`is-status-${row.statusTone}`}>{row.status}</span>
                      <span className={row.checkInTone ? `is-date-${row.checkInTone}` : ""}>{row.checkIn}</span>
                      <span className={row.checkOutTone ? `is-date-${row.checkOutTone}` : ""}>{row.checkOut}</span>
                      <span>{row.nights}</span>
                      <span>{row.rooms}</span>
                      <span>{row.food}</span>
                      <span>{row.sleepingPlaces}</span>
                      <span>{row.price}</span>
                      <span className={row.hasDiscount ? "is-positive" : ""}>{row.discount}</span>
                      <span>{row.discountedPrice}</span>
                      <span className={row.prepaymentTone ? `is-money-${row.prepaymentTone}` : ""}>{row.prepayment}</span>
                      <span className={row.balanceTone ? `is-money-${row.balanceTone}` : ""}>{row.balance}</span>
                      <span className={row.hasAddOnSales ? "is-money-done" : ""}>{row.addOnSales}</span>
                      <span className={row.totalSalesValue > 0 ? "is-positive" : ""}>{row.totalSales}</span>
                    </>
                  )}
                  <span className="gpb-guests-row-actions">
                    {isEditing ? (
                      <button type="button" onClick={() => saveGuestDatabaseEdit(row)} title="Сохранить">
                        <Check size={14} />
                      </button>
                    ) : (
                      <button type="button" onClick={() => startGuestDatabaseEdit(row)} title="Редактировать">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button type="button" onClick={() => setClearRowTarget(row)} title="Очистить поля строки">
                      <Eraser size={14} />
                    </button>
                    <button type="button" onClick={() => setDeleteGuestTarget(row)} title="Удалить">
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
              );
              })}
              {!visibleRows.length ? <div className="gpb-guests-empty-state">По выбранным фильтрам гостей нет.</div> : null}
            </div>
          ) : null}
        </main>
        {deleteGuestTarget ? (
          <ConfirmActionModal
            title="Удалить гостя?"
            description={`${deleteGuestTarget.appeal || formatReservationPhone(deleteGuestTarget.phone)} · запись будет удалена из базы`}
            confirmLabel="Удалить"
            tone="danger"
            onClose={() => setDeleteGuestTarget(null)}
            onConfirm={() => void removeGuestDatabaseRow(deleteGuestTarget)}
          />
        ) : null}
        {isClearFieldsConfirmOpen ? (
          <PasswordConfirmModal
            title="Очистить поля?"
            description="Телефон, обращение и дата обращения останутся. Поля броней и согласований будут очищены."
            confirmLabel="Очистить"
            expectedPassword={servicePassword}
            onClose={() => setIsClearFieldsConfirmOpen(false)}
            onConfirm={() => void handleClearFields()}
          />
        ) : null}
        {clearRowTarget ? (
          <PasswordConfirmModal
            title="Очистить строку?"
            description={`${clearRowTarget.appeal || formatReservationPhone(clearRowTarget.phone)} · телефон, обращение и дата обращения останутся.`}
            confirmLabel="Очистить строку"
            expectedPassword={servicePassword}
            onClose={() => setClearRowTarget(null)}
            onConfirm={() => void handleClearRowFields(clearRowTarget)}
          />
        ) : null}
      </div>
    </div>
  );
}

function buildGuestDatabaseRow(
  contact: GuestContact,
  reservations: Reservation[],
  drafts: Array<{ draft: ChatBookingDraft; key: string }>,
  rooms: Room[],
  breakfastPricePerPerson = 0
) {
  const contactPhone = normalizePhoneSearch(contact.phone);
  const contactAppeal = normalizeContactLookupText(contact.appeal);
  const matchingReservations = reservations
    .filter((reservation) => {
      const reservationPhone = normalizePhoneSearch(reservation.phone);
      const reservationName = normalizeContactLookupText(reservation.guestFirstName);
      return Boolean(
        (contactPhone && reservationPhone && contactPhone === reservationPhone) ||
        (contactAppeal && reservationName && contactAppeal === reservationName)
      );
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const matchingDrafts = drafts
    .filter(({ draft }) => {
      const draftPhone = normalizePhoneSearch(draft.phone);
      const draftName = normalizeContactLookupText(draft.guestFirstName);
      return Boolean(
        (contactPhone && draftPhone && contactPhone === draftPhone) ||
        (contactAppeal && draftName && contactAppeal === draftName)
      );
    })
    .sort((left, right) => right.draft.updatedAt.localeCompare(left.draft.updatedAt));
  const latestReservation = matchingReservations.find((reservation) => !reservation.isAddOnSale) ?? matchingReservations[0] ?? null;
  const latestDraftEntry = matchingDrafts[0] ?? null;
  const latestDraft = latestDraftEntry?.draft ?? null;
  const reservation = latestReservation ?? latestDraft?.lastReservation ?? null;
  const agreementSent = Boolean(latestDraft?.agreementEverSent || latestDraft?.agreementSent || reservation?.status === "pending");
  const bookedRooms = reservation
    ? reservation.roomIds.map((roomId) => rooms.find((room) => room.id === roomId)).filter((room): room is Room => Boolean(room))
    : latestDraft?.selectedBookingRoomIds.map((roomId) => rooms.find((room) => room.id === roomId)).filter((room): room is Room => Boolean(room)) ?? [];
  const finance = reservation ? getReservationFinance(reservation) : null;
  const hasAnyPayment = Boolean(reservation?.prepaymentReceivedAt || reservation?.balancePaidAt || (reservation?.paidAmount ?? 0) > 0);
  const shouldShowBalance = Boolean(
    reservation && (
      hasAnyPayment ||
      reservation.status === "booked" ||
      reservation.checkedInAt ||
      reservation.checkedOutAt ||
      reservation.extendedAt
    )
  );
  const checkedOut = reservation ? isReservationCheckedOut(reservation) : false;
  const draftTotals = !reservation && latestDraft
    ? calculateBookingTotals(
      bookedRooms,
      latestDraft.checkIn,
      latestDraft.checkOut,
      latestDraft.extraBed,
      getDraftExtraInventoryCounts(latestDraft).airBeds + getDraftExtraInventoryCounts(latestDraft).rollaways,
      latestDraft.hourlyHours,
      latestDraft.discountPercent,
      latestDraft.breakfastIncluded ?? true,
      breakfastPricePerPerson
    )
    : null;
  const draftEffectiveTotals = draftTotals ? getEffectiveBookingTotals(draftTotals, latestDraft?.manualTotalAmount ?? 0, latestDraft?.discountPercent ?? 0) : null;
  const statusLabel = reservation ? getReservationStatusLabel(reservation) : getDraftGuestDatabaseStatus(latestDraft, agreementSent);
  const prepaymentAmount = reservation?.prepayment ?? 0;
  const balanceAmount = shouldShowBalance ? finance?.displayBalance ?? 0 : 0;
  const addOnSalesTotal = matchingReservations
    .filter((matchingReservation) => matchingReservation.isAddOnSale && matchingReservation.status !== "cancelled")
    .reduce((sum, matchingReservation) => sum + matchingReservation.total, 0);
  const totalSalesAmount = (reservation?.total ?? draftEffectiveTotals?.total ?? 0) + addOnSalesTotal;
  const paymentMethodLabels = Array.from(new Set(
    matchingReservations
      .filter((matchingReservation) => Boolean(
        matchingReservation.paymentMethod &&
        matchingReservation.status !== "cancelled" &&
        (
          matchingReservation.prepaymentReceivedAt ||
          matchingReservation.balancePaidAt ||
          (matchingReservation.paidAmount ?? 0) > 0
        )
      ))
      .map((matchingReservation) => getManualSalePaymentLabel(matchingReservation.paymentMethod ?? ""))
      .filter(Boolean)
  ));

  return {
    addOnSales: addOnSalesTotal > 0 ? formatAnalyticsMoney(addOnSalesTotal) : "",
    addOnSalesValue: addOnSalesTotal,
    appeal: contact.appeal,
    balance: reservation ? formatAnalyticsMoney(balanceAmount) : "",
    balanceTone: reservation?.balancePaidAt ? "done" : balanceAmount > 0 ? "planned" : "",
    balanceValue: balanceAmount,
    balancePaid: reservation?.balancePaidAt ? "Да" : reservation ? "Нет" : "",
    balancePaidValue: Boolean(reservation?.balancePaidAt),
    checkIn: reservation?.checkIn ? formatShortDayMonth(reservation.checkIn) : latestDraft?.checkIn ? formatShortDayMonth(latestDraft.checkIn) : "",
    checkInTone: reservation?.checkedInAt ? "done" : getGuestDatabaseDateTone(reservation?.checkIn ?? latestDraft?.checkIn ?? ""),
    checkInValue: reservation?.checkIn ?? latestDraft?.checkIn ?? "",
    checkOut: reservation?.checkOut ? formatShortDayMonth(reservation.checkOut) : latestDraft?.checkOut ? formatShortDayMonth(latestDraft.checkOut) : "",
    checkOutTone: checkedOut ? "done" : getGuestDatabaseDateTone(reservation?.checkOut ?? latestDraft?.checkOut ?? ""),
    checkOutValue: reservation?.checkOut ?? latestDraft?.checkOut ?? "",
    checkedIn: reservation?.checkedInAt ? "Да" : reservation ? "Нет" : "",
    checkedInValue: Boolean(reservation?.checkedInAt),
    checkedOut: checkedOut ? "Да" : reservation ? "Нет" : "",
    checkedOutValue: checkedOut,
    discount: reservation
      ? `${reservation.discountPercent}% / ${formatAnalyticsMoney(reservation.discountAmount)}`
      : draftEffectiveTotals ? `${draftEffectiveTotals.discountPercent}% / ${formatAnalyticsMoney(draftEffectiveTotals.discountAmount)}` : "",
    discountValue: reservation?.discountPercent ?? draftEffectiveTotals?.discountPercent ?? 0,
    discountedPrice: reservation ? formatAnalyticsMoney(reservation.total) : draftEffectiveTotals ? formatAnalyticsMoney(draftEffectiveTotals.total) : "",
    discountedPriceValue: reservation?.total ?? draftEffectiveTotals?.total ?? 0,
    hasDiscount: Boolean((reservation && reservation.discountAmount > 0) || (draftEffectiveTotals && draftEffectiveTotals.discountAmount > 0)),
    hasAddOnSales: addOnSalesTotal > 0,
    inquiryDate: contact.inquiryDate,
    inquiryDateValue: contact.inquiryDate.slice(0, 10),
    nights: reservation ? `${getNightsCount(reservation.checkIn, reservation.checkOut)}` : latestDraft ? `${getNightsCount(latestDraft.checkIn, latestDraft.checkOut)}` : "",
    nightsValue: reservation ? getNightsCount(reservation.checkIn, reservation.checkOut) : latestDraft ? getNightsCount(latestDraft.checkIn, latestDraft.checkOut) : 0,
    hasPaymentMethod: paymentMethodLabels.length > 0,
    food: reservation ? reservation.breakfastIncluded === false ? "Без завтрака" : "Завтрак" : latestDraft ? latestDraft.breakfastIncluded === false ? "Без завтрака" : "Завтрак" : "",
    paymentMethod: paymentMethodLabels.length ? paymentMethodLabels.join(" · ") : reservation ? "Нет" : "",
    paymentMethodValue: reservation?.paymentMethod ?? "",
    phone: contact.phone,
    price: reservation ? formatAnalyticsMoney(reservation.subtotal) : draftEffectiveTotals ? formatAnalyticsMoney(draftEffectiveTotals.subtotal) : "",
    priceValue: reservation?.subtotal ?? draftEffectiveTotals?.subtotal ?? 0,
    prepayment: reservation ? formatAnalyticsMoney(prepaymentAmount) : "",
    prepaymentReceived: Boolean(reservation?.prepaymentReceivedAt),
    prepaymentReceivedLabel: reservation?.prepaymentReceivedAt ? "Да" : reservation ? "Нет" : "",
    prepaymentTone: reservation?.prepaymentReceivedAt ? "done" : prepaymentAmount > 0 ? "planned" : "",
    prepaymentValue: prepaymentAmount,
    reservationId: reservation?.id ?? "",
    draftKey: latestDraftEntry?.key ?? "",
    rooms: bookedRooms.map((room) => room.number || room.title).join(", "),
    roomIds: bookedRooms.map((room) => room.id),
    sleepingPlaces: reservation ? `${calculateReservationSleepingPlacesTotal(reservation, bookedRooms)}` : "",
    sleepingPlacesValue: reservation ? calculateReservationSleepingPlacesTotal(reservation, bookedRooms) : 0,
    status: statusLabel,
    statusTone: getGuestDatabaseStatusTone(statusLabel),
    statusValue: statusLabel,
    totalSales: totalSalesAmount > 0 ? formatAnalyticsMoney(totalSalesAmount) : "",
    totalSalesValue: totalSalesAmount
  };
}

function getDraftGuestDatabaseStatus(draft: ChatBookingDraft | null, agreementSent: boolean) {
  if (agreementSent) return "На согласовании";
  if (draft?.catalogStatus === "price-sent") return "Прайс отправлен";
  if (draft?.catalogStatus === "room-sent") return "Номер отправлен";
  return "";
}

function getGuestDatabaseStatusTone(status: string) {
  if (status === "Прайс отправлен" || status === "Номер отправлен") return "info";
  if (status === "На согласовании") return "pending";
  if (status === "Предоплата получена" || status === "Забронировано" || status === "Въехал") return "success";
  if (status === "Продлен") return "extended";
  if (status === "Выехал") return "muted";
  if (status === "Снято с брони" || status === "Незаезд") return "danger";
  return "empty";
}

function getGuestDatabaseDateTone(date: string) {
  if (!date) return "";
  const target = parseDateInput(date);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (daysUntil < 0) return "overdue";
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "soon";
  return "";
}

type GuestDatabaseEditForm = {
  addOnSales: string;
  appeal: string;
  balance: string;
  balancePaid: string;
  checkIn: string;
  checkOut: string;
  checkedIn: string;
  checkedOut: string;
  discountPercent: string;
  discountedPrice: string;
  food: string;
  inquiryDate: string;
  nights: string;
  paymentMethod: string;
  phone: string;
  prepayment: string;
  prepaymentReceived: string;
  price: string;
  roomIds: string[];
  rooms: string;
  sleepingPlaces: string;
  status: string;
  totalSales: string;
};

function createEmptyGuestDatabaseEditForm(): GuestDatabaseEditForm {
  return {
    addOnSales: "",
    appeal: "",
    balance: "",
    balancePaid: "",
    checkIn: "",
    checkOut: "",
    checkedIn: "",
    checkedOut: "",
    discountPercent: "",
    discountedPrice: "",
    food: "",
    inquiryDate: "",
    nights: "",
    paymentMethod: "",
    phone: "",
    prepayment: "",
    prepaymentReceived: "",
    price: "",
    roomIds: [],
    rooms: "",
    sleepingPlaces: "",
    status: "",
    totalSales: ""
  };
}

function buildEditedGuestDatabaseReservation(reservation: Reservation, form: GuestDatabaseEditForm, rooms: Room[]): Reservation {
  const checkIn = form.checkIn || reservation.checkIn;
  const nights = Math.max(1, Number(form.nights) || getNightsCount(checkIn, form.checkOut || reservation.checkOut));
  const checkOut = form.checkOut || formatDateInput(addDays(parseDateInput(checkIn), nights));
  const subtotal = parsePriceInput(form.price) || reservation.subtotal;
  const total = parsePriceInput(form.discountedPrice) || Math.max(0, subtotal - parsePriceInput(form.balance));
  const discountPercent = clampNumber(Number(form.discountPercent) || 0, 0, 100);
  const discountAmount = Math.max(0, subtotal - total);
  const prepayment = parsePriceInput(form.prepayment);
  const balanceInput = parsePriceInput(form.balance);
  const roomIds = form.roomIds.length ? form.roomIds : resolveGuestDatabaseRoomIds(form.rooms, rooms, reservation.roomIds);
  const now = new Date().toISOString();
  const statusLabel = form.status || getReservationStatusLabel(reservation);
  const isPrepaymentReceived = form.prepaymentReceived === "Да" || statusLabel === "Предоплата получена";
  const isCheckedOut = statusLabel === "Выехал" || form.checkedOut === "Да";
  const isExtended = statusLabel === "Продлен";
  const isCheckedIn = isCheckedOut || isExtended || statusLabel === "Въехал" || (form.checkedIn === "Да" && statusLabel === "Забронировано");
  const isBalancePaid = form.balancePaid === "Да";
  const isNoShow = statusLabel === "Незаезд";
  const isCancelled = statusLabel === "Снято с брони" || isNoShow;
  const isCatalogOnlyStatus = statusLabel === "Прайс отправлен" || statusLabel === "Номер отправлен";

  return {
    ...reservation,
    balancePaidAt: isBalancePaid ? reservation.balancePaidAt ?? now : undefined,
    checkIn,
    checkOut,
    checkedInAt: isCheckedIn ? reservation.checkedInAt ?? now : undefined,
    checkedOutAt: isCheckedOut ? reservation.checkedOutAt ?? now : undefined,
    extendedAt: isExtended ? reservation.extendedAt ?? now : undefined,
    discountAmount,
    discountPercent,
    guestFirstName: form.appeal.trim() || reservation.guestFirstName,
    breakfastIncluded: form.food !== "Без завтрака",
    breakfastDiscountAmount: form.food === "Без завтрака" ? reservation.breakfastDiscountAmount ?? 0 : 0,
    noShowAt: isNoShow ? reservation.noShowAt ?? now : undefined,
    paymentMethod: form.paymentMethod || undefined,
    paidAmount: isBalancePaid ? total : form.balance.trim() ? Math.max(0, total - balanceInput) : isPrepaymentReceived ? prepayment : 0,
    phone: formatPhoneDigits(form.phone) || reservation.phone,
    prepayment,
    prepaymentReceivedAt: prepayment > 0 && isPrepaymentReceived ? reservation.prepaymentReceivedAt ?? now : undefined,
    roomIds,
    status: isCancelled ? "cancelled" : statusLabel === "На согласовании" || isCatalogOnlyStatus ? "pending" : "booked",
    subtotal,
    total
  };
}

async function syncGuestDatabaseAddOnSales(
  row: GuestDatabaseRow,
  form: GuestDatabaseEditForm,
  reservations: Reservation[],
  parentReservation: Reservation | null,
  onUpdateReservation: (reservation: Reservation) => Promise<void>
) {
  const targetTotal = parsePriceInput(form.addOnSales);
  const activeAddOns = getMatchingGuestDatabaseAddOnReservations(row, form, reservations)
    .filter((reservation) => reservation.status !== "cancelled")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const currentTotal = activeAddOns.reduce((sum, reservation) => sum + reservation.total, 0);
  if (targetTotal === currentTotal) return;

  const now = new Date().toISOString();
  if (targetTotal <= 0) {
    await Promise.all(activeAddOns.map((reservation) => onUpdateReservation({
      ...reservation,
      status: "cancelled",
      comment: [reservation.comment, "Корректировка доп продаж из базы гостей: 0 тг"].filter(Boolean).join("\n")
    })));
    return;
  }

  const [primaryAddOn, ...duplicateAddOns] = activeAddOns;
  const nextPhone = formatPhoneDigits(form.phone) || parentReservation?.phone || row.phone;
  const nextGuestName = form.appeal.trim() || parentReservation?.guestFirstName || row.appeal;
  const fallbackDate = form.checkIn || parentReservation?.checkIn || formatDateInput(new Date());

  const nextPrimaryAddOn: Reservation = primaryAddOn
    ? buildGuestDatabaseEditedAddOnReservation(primaryAddOn, targetTotal)
    : {
      id: `reservation-addon-manual-${Date.now()}`,
      roomIds: [],
      guestFirstName: nextGuestName,
      phone: nextPhone,
      checkIn: fallbackDate,
      checkOut: fallbackDate,
      checkInTime: parentReservation?.checkInTime ?? DEFAULT_CHECK_IN_TIME,
      checkOutTime: parentReservation?.checkOutTime ?? DEFAULT_CHECK_OUT_TIME,
      comment: parentReservation ? `Корректировка доп продаж к брони ${parentReservation.id}` : "Корректировка доп продаж из базы гостей",
      adminComment: parentReservation?.adminComment,
      adults: parentReservation?.adults ?? 0,
      children: parentReservation?.children ?? 0,
      hasPet: false,
      extraBed: false,
      airMattressCount: 0,
      rollawayCount: 0,
      hourlyHours: 0,
      discountPercent: 0,
      subtotal: targetTotal,
      discountAmount: 0,
      total: targetTotal,
      prepayment: targetTotal,
      paidAmount: targetTotal,
      paymentLink: parentReservation?.paymentLink ?? "",
      paymentMethod: parentReservation?.paymentMethod,
      breakfastIncluded: false,
      isManualSale: true,
      isAddOnSale: true,
      parentReservationId: parentReservation?.id,
      status: "booked",
      prepaymentReceivedAt: now,
      balancePaidAt: now,
      createdAt: now
    };

  await Promise.all([
    onUpdateReservation(nextPrimaryAddOn),
    ...duplicateAddOns.map((reservation) => onUpdateReservation({
      ...reservation,
      status: "cancelled" as const,
      comment: [reservation.comment, "Дубль доп продажи отменен через базу гостей"].filter(Boolean).join("\n")
    }))
  ]);
}

function buildGuestDatabaseEditedAddOnReservation(reservation: Reservation, total: number): Reservation {
  const wasPaid = Boolean(reservation.prepaymentReceivedAt || reservation.balancePaidAt || (reservation.paidAmount ?? 0) > 0);
  return {
    ...reservation,
    discountAmount: 0,
    discountPercent: 0,
    noShowAt: undefined,
    paidAmount: wasPaid ? total : 0,
    prepayment: wasPaid ? total : 0,
    status: "booked",
    subtotal: total,
    total
  };
}

function getMatchingGuestDatabaseAddOnReservations(row: GuestDatabaseRow, form: GuestDatabaseEditForm, reservations: Reservation[]) {
  const rowPhone = normalizePhoneSearch(row.phone);
  const rowAppeal = normalizeContactLookupText(row.appeal);
  const formPhone = normalizePhoneSearch(form.phone);
  const formAppeal = normalizeContactLookupText(form.appeal);

  return reservations.filter((reservation) => {
    if (!reservation.isAddOnSale) return false;
    const reservationPhone = normalizePhoneSearch(reservation.phone);
    const reservationName = normalizeContactLookupText(reservation.guestFirstName);
    return Boolean(
      (rowPhone && reservationPhone && rowPhone === reservationPhone) ||
      (formPhone && reservationPhone && formPhone === reservationPhone) ||
      (rowAppeal && reservationName && rowAppeal === reservationName) ||
      (formAppeal && reservationName && formAppeal === reservationName)
    );
  });
}

async function saveMatchingGuestDatabaseDrafts(
  row: GuestDatabaseRow,
  drafts: Record<string, ChatBookingDraft>,
  form: GuestDatabaseEditForm,
  rooms: Room[],
  editedReservation: Reservation | null
) {
  const nextEntries = getMatchingGuestDatabaseDraftEntries(row, drafts);
  await Promise.all(nextEntries.map(([key, draft]) =>
    saveChatBookingDraft(key, buildEditedGuestDatabaseDraft(draft, form, rooms, editedReservation))
  ));
}

function updateMatchingGuestDatabaseDraftState(
  row: GuestDatabaseRow,
  drafts: Record<string, ChatBookingDraft>,
  form: GuestDatabaseEditForm,
  rooms: Room[],
  editedReservation: Reservation | null
) {
  const nextDrafts = { ...drafts };
  getMatchingGuestDatabaseDraftEntries(row, drafts).forEach(([key, draft]) => {
    nextDrafts[key] = buildEditedGuestDatabaseDraft(draft, form, rooms, editedReservation);
  });
  return nextDrafts;
}

function getMatchingGuestDatabaseDraftEntries(row: GuestDatabaseRow, drafts: Record<string, ChatBookingDraft>) {
  const rowPhone = normalizePhoneSearch(row.phone);
  const rowAppeal = normalizeContactLookupText(row.appeal);
  return Object.entries(drafts).filter(([key, draft]) => {
    const draftPhone = normalizePhoneSearch(draft.phone);
    const draftName = normalizeContactLookupText(draft.guestFirstName);
    return Boolean(
      key === row.draftKey ||
      (rowPhone && draftPhone && rowPhone === draftPhone) ||
      (rowAppeal && draftName && rowAppeal === draftName)
    );
  });
}

function buildEditedGuestDatabaseDraft(
  draft: ChatBookingDraft,
  form: GuestDatabaseEditForm,
  rooms: Room[],
  editedReservation: Reservation | null
): ChatBookingDraft {
  const checkIn = form.checkIn || draft.checkIn;
  const nights = Math.max(1, Number(form.nights) || getNightsCount(checkIn, form.checkOut || draft.checkOut));
  const checkOut = form.checkOut || formatDateInput(addDays(parseDateInput(checkIn), nights));
  const roomIds = form.roomIds.length ? form.roomIds : resolveGuestDatabaseRoomIds(form.rooms, rooms, draft.selectedBookingRoomIds);
  const discountedPrice = parsePriceInput(form.discountedPrice);
  const statusLabel = form.status || "";

  return {
    ...draft,
    agreementEverSent: draft.agreementEverSent || statusLabel === "На согласовании",
    agreementSent: draft.agreementSent || statusLabel === "На согласовании",
    catalogStatus: statusLabel === "Прайс отправлен" ? "price-sent" : statusLabel === "Номер отправлен" ? "room-sent" : draft.catalogStatus,
    catalogStatusAt: statusLabel === "Прайс отправлен" || statusLabel === "Номер отправлен" ? draft.catalogStatusAt ?? new Date().toISOString() : draft.catalogStatusAt,
    checkIn,
    checkOut,
    discountPercent: clampNumber(Number(form.discountPercent) || 0, 0, 100),
    guestFirstName: form.appeal.trim() || draft.guestFirstName,
    lastReservation: editedReservation ?? draft.lastReservation,
    manualSaleAmount: discountedPrice || draft.manualSaleAmount,
    manualSalePaymentMethod: form.paymentMethod || draft.manualSalePaymentMethod,
    manualTotalAmount: discountedPrice || draft.manualTotalAmount,
    phone: formatPhoneDigits(form.phone) || draft.phone,
    prepaymentAlreadyPaid: parsePriceInput(form.prepayment) > 0 || draft.prepaymentAlreadyPaid,
    selectedBookingRoomIds: roomIds,
    selectedRoomId: roomIds[0] || draft.selectedRoomId,
    updatedAt: new Date().toISOString()
  };
}

function resolveGuestDatabaseRoomIds(value: string, rooms: Room[], fallbackRoomIds: string[]) {
  const tokens = value.split(/[,|]+/).map((item) => item.trim()).filter(Boolean);
  if (!tokens.length) return fallbackRoomIds;
  const matchedIds = tokens
    .map((token) => {
      const normalizedToken = token.toLowerCase();
      return rooms.find((room) =>
        room.id.toLowerCase() === normalizedToken ||
        room.number.toLowerCase() === normalizedToken ||
        room.title.toLowerCase() === normalizedToken ||
        `${room.number} ${room.title}`.trim().toLowerCase() === normalizedToken
      )?.id;
    })
    .filter((id): id is string => Boolean(id));
  return matchedIds.length ? Array.from(new Set(matchedIds)) : fallbackRoomIds;
}

function updateGuestEditCalculatedFields(form: GuestDatabaseEditForm, rooms: Room[]): GuestDatabaseEditForm {
  const selectedRooms = form.roomIds.map((roomId) => rooms.find((room) => room.id === roomId)).filter((room): room is Room => Boolean(room));
  if (!selectedRooms.length) return form;

  const subtotal = selectedRooms.reduce((sum, room) => sum + calculateRoomStayPrice(room, form.checkIn, form.checkOut), 0);
  const discountPercent = clampNumber(Number(form.discountPercent) || 0, 0, 100);
  const discountAmount = Math.round(subtotal * discountPercent / 100);
  const total = Math.max(0, subtotal - discountAmount);
  return {
    ...form,
    discountedPrice: String(total),
    prepayment: String(Math.round(total * 0.5)),
    price: String(subtotal),
    rooms: getGuestEditRoomLabel(form.roomIds, rooms),
    sleepingPlaces: String(selectedRooms.reduce((sum, room) => sum + calculateRoomSleepingPlacesTotal(room), 0))
  };
}

function getGuestEditRoomLabel(roomIds: string[], rooms: Room[]) {
  return roomIds
    .map((roomId) => rooms.find((room) => room.id === roomId))
    .filter((room): room is Room => Boolean(room))
    .map((room) => room.number || room.title)
    .join(", ");
}

const GUEST_DATABASE_COLUMNS = [
  { key: "phone", label: "Телефон", type: "text" },
  { key: "appeal", label: "Обращение", type: "text" },
  { key: "inquiryDateValue", label: "Дата обращения", type: "date" },
  { key: "statusValue", label: "Статус", type: "select", options: ["Прайс отправлен", "Номер отправлен", "На согласовании", "Предоплата получена", "Забронировано", "Въехал", "Продлен", "Выехал", "Снято с брони", "Незаезд"] },
  { key: "checkInValue", label: "Заезд", type: "date" },
  { key: "checkOutValue", label: "Выезд", type: "date" },
  { key: "nightsValue", label: "Ночей", type: "number" },
  { key: "rooms", label: "Номера", type: "text" },
  { key: "food", label: "Питание", type: "select", options: ["Без завтрака", "Завтрак"] },
  { key: "sleepingPlacesValue", label: "Мест", type: "number" },
  { key: "priceValue", label: "Цена", type: "number" },
  { key: "discountValue", label: "Скидка", type: "number" },
  { key: "discountedPriceValue", label: "Со скидкой", type: "number" },
  { key: "prepaymentValue", label: "Предоплата", type: "number" },
  { key: "balanceValue", label: "Остаток", type: "number" },
  { key: "addOnSalesValue", label: "Доп", type: "number" },
  { key: "totalSalesValue", label: "Итого", type: "number" }
] as const;

type GuestDatabaseColumn = typeof GUEST_DATABASE_COLUMNS[number];
type GuestDatabaseRow = ReturnType<typeof buildGuestDatabaseRow>;

function hasGuestDatabaseColumnFilter(columnKey: string, filters: Record<string, string>, sort: { key: string; direction: "asc" | "desc" } | null) {
  return Boolean(filters[columnKey] || filters[`${columnKey}:from`] || filters[`${columnKey}:to`] || sort?.key === columnKey);
}

function filterGuestDatabaseRows(rows: GuestDatabaseRow[], filters: Record<string, string>) {
  return rows.filter((row) => GUEST_DATABASE_COLUMNS.every((column) => matchesGuestDatabaseFilter(row, column, filters)));
}

function matchesGuestDatabaseFilter(row: GuestDatabaseRow, column: GuestDatabaseColumn, filters: Record<string, string>) {
  const value = getGuestDatabaseSortValue(row, column.key);
  if (column.type === "number") {
    const numericValue = Number(value) || 0;
    const from = filters[`${column.key}:from`] ? Number(filters[`${column.key}:from`]) : null;
    const to = filters[`${column.key}:to`] ? Number(filters[`${column.key}:to`]) : null;
    return (from === null || numericValue >= from) && (to === null || numericValue <= to);
  }
  if (column.type === "date") {
    const dateValue = String(value || "");
    const from = filters[`${column.key}:from`];
    const to = filters[`${column.key}:to`];
    return (!from || dateValue >= from) && (!to || dateValue <= to);
  }
  const filterValue = filters[column.key];
  if (!filterValue) return true;
  if (column.type === "select") {
    const selectedValues = parseGuestDatabaseMultiFilter(filterValue);
    if (!selectedValues.length) return true;
    return selectedValues.includes(String(value ?? ""));
  }
  return String(value ?? "").toLowerCase().includes(filterValue.toLowerCase());
}

function parseGuestDatabaseMultiFilter(value?: string) {
  return (value || "").split("||").map((item) => item.trim()).filter(Boolean);
}

function sortGuestDatabaseRows(rows: GuestDatabaseRow[], sort: { key: string; direction: "asc" | "desc" } | null) {
  if (!sort) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = getGuestDatabaseSortValue(left, sort.key);
    const rightValue = getGuestDatabaseSortValue(right, sort.key);
    if (typeof leftValue === "number" || typeof rightValue === "number") {
      return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction;
    }
    return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), "ru") * direction;
  });
}

function getGuestDatabaseRoomsColumnWidth(rows: GuestDatabaseRow[]) {
  return 64;
}

function formatDateTimeInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function getGuestDatabaseSortValue(row: GuestDatabaseRow, key: string) {
  return (row as unknown as Record<string, string | number | boolean>)[key] ?? "";
}

function ExpensesModal({ reservations, onClose }: { reservations: Reservation[]; onClose: () => void }) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [isExpenseFormOpen, setIsExpenseFormOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState("");
  const [deleteExpenseTarget, setDeleteExpenseTarget] = useState<ExpenseEntry | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    categoryId: "",
    categoryQuery: "",
    amount: "",
    paymentDate: formatDateInput(new Date())
  });
  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let isCancelled = false;
    Promise.all([getExpenseCategories(), getExpenseEntries()])
      .then(([nextCategories, nextEntries]) => {
        if (isCancelled) return;
        setCategories(nextCategories);
        setEntries(nextEntries);
        setLoadState("ready");
      })
      .catch(() => {
        if (isCancelled) return;
        setCategories([]);
        setEntries([]);
        setLoadState("ready");
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const revenue = useMemo(
    () => reservations
      .filter((reservation) => reservation.status === "booked")
      .reduce((sum, reservation) => sum + getReservationFinance(reservation).revenue, 0),
    [reservations]
  );
  const fixedTotal = useMemo(() => entries.filter((entry) => entry.type === "fixed").reduce((sum, entry) => sum + entry.amount, 0), [entries]);
  const variableTotal = useMemo(() => entries.filter((entry) => entry.type === "variable").reduce((sum, entry) => sum + entry.amount, 0), [entries]);
  const totalExpenses = fixedTotal + variableTotal;
  const fixedGap = Math.max(0, fixedTotal - revenue);
  const profitAfterExpenses = revenue - totalExpenses;
  const sortedEntries = useMemo(
    () => entries.slice().sort((left, right) => right.paymentDate.localeCompare(left.paymentDate) || right.createdAt.localeCompare(left.createdAt)),
    [entries]
  );
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    entries.forEach((entry) => {
      totals.set(entry.title, (totals.get(entry.title) ?? 0) + entry.amount);
    });
    return Array.from(totals.entries())
      .map(([title, amount]) => ({ title, amount }))
      .sort((left, right) => right.amount - left.amount);
  }, [entries]);

  function openCreateExpenseForm() {
    setEditingExpenseId("");
    setIsExpenseFormOpen(true);
    setExpenseForm({
      categoryId: "",
      categoryQuery: "",
      amount: "",
      paymentDate: formatDateInput(new Date())
    });
  }

  function openEditExpenseForm(entry: ExpenseEntry) {
    setEditingExpenseId(entry.id);
    setIsExpenseFormOpen(true);
    setExpenseForm({
      categoryId: entry.categoryId,
      categoryQuery: entry.title,
      amount: formatExpenseAmountInput(String(entry.amount)),
      paymentDate: entry.paymentDate || formatDateInput(new Date())
    });
  }

  async function createOrSelectExpenseCategory(title: string) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return null;
    const existingCategory = categories.find((category) => (
      category.title.trim().toLowerCase() === normalizedTitle.toLowerCase()
    ));
    if (existingCategory) {
      setExpenseForm((current) => ({
        ...current,
        categoryId: existingCategory.id,
        categoryQuery: existingCategory.title
      }));
      return existingCategory;
    }

    const category: ExpenseCategory = {
      id: createExpenseId("category"),
      type: "variable",
      title: normalizedTitle,
      createdAt: new Date().toISOString()
    };
    const nextCategories = categories.concat(category);
    setCategories(nextCategories);
    await saveExpenseCategories(nextCategories);
    setExpenseForm((current) => ({
      ...current,
      categoryId: category.id,
      categoryQuery: category.title
    }));
    return category;
  }

  async function saveExpenseFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = expenseForm.categoryId
      ? categories.find((item) => item.id === expenseForm.categoryId)
      : await createOrSelectExpenseCategory(expenseForm.categoryQuery);
    if (!category) return;
    const amount = parsePriceInput(expenseForm.amount);
    if (!amount) return;

    const nextEntries = editingExpenseId
      ? entries.map((entry) => entry.id === editingExpenseId
        ? {
          ...entry,
          categoryId: category.id,
          type: category.type,
          title: category.title,
          amount,
          paymentDate: expenseForm.paymentDate || formatDateInput(new Date())
        }
        : entry)
      : entries.concat({
        id: createExpenseId("entry"),
        categoryId: category.id,
        type: category.type,
        title: category.title,
        amount,
        paymentDate: expenseForm.paymentDate || formatDateInput(new Date()),
        note: "",
        createdAt: new Date().toISOString()
      });
    setEntries(nextEntries);
    await saveExpenseEntries(nextEntries);
    setIsExpenseFormOpen(false);
    setEditingExpenseId("");
  }

  async function deleteExpenseEntry(entry: ExpenseEntry) {
    const nextEntries = entries.filter((item) => item.id !== entry.id);
    setEntries(nextEntries);
    await saveExpenseEntries(nextEntries);
    setDeleteExpenseTarget(null);
  }

  return (
    <div className="gpb-modal-backdrop">
      <div className="gpb-catalog-modal gpb-expenses-modal" role="dialog" aria-modal="true" aria-label="Расходы и зарплаты">
        <header className="gpb-catalog-header">
          <div>
            <h1>Расходы и зарплаты</h1>
            <span>Единый список расходов с категориями, суммами и датами выплат.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={22} />
          </button>
        </header>

        <main className="gpb-expenses-body">
          {loadState === "loading" ? <div className="gpb-guests-empty-state">Загружаю расходы...</div> : null}

          <section className="gpb-expenses-layout">
            <div className="gpb-expenses-left">
              <section className="gpb-expenses-summary">
                <AnalyticsCard label="Выручка" value={formatAnalyticsMoney(revenue)} />
                <AnalyticsCard label="Расходы" value={formatAnalyticsMoney(totalExpenses)} />
                <AnalyticsCard label="До покрытия постоянных" value={formatAnalyticsMoney(fixedGap)} />
                <AnalyticsCard label="После расходов" value={formatAnalyticsMoney(profitAfterExpenses)} />
              </section>

              <section className="gpb-expenses-table-card">
                <header>
                  <div>
                    <strong>Расходы</strong>
                    <span>Список всех расходов с датой, статьей и суммой.</span>
                  </div>
                </header>

                {sortedEntries.length ? (
                  <div className="gpb-expenses-table">
                    <div className="gpb-expenses-row is-header">
                      <span>Дата</span>
                      <span>Статья</span>
                      <span>Сумма</span>
                      <span>Действия</span>
                    </div>
                    {sortedEntries.map((entry) => (
                      <div className="gpb-expenses-row" key={entry.id}>
                        <span>{formatShortDateText(entry.paymentDate)}</span>
                        <strong>{entry.title}</strong>
                        <b>{formatAnalyticsMoney(entry.amount)}</b>
                        <div>
                          <button type="button" onClick={() => openEditExpenseForm(entry)} title="Редактировать">
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="is-danger" onClick={() => setDeleteExpenseTarget(entry)} title="Удалить">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="gpb-expenses-empty">Расходов пока нет.</div>
                )}

                <button className="gpb-expense-create-floating" type="button" onClick={openCreateExpenseForm}>
                  <Plus size={16} />
                  Создать расход
                </button>
              </section>
            </div>

            <aside className="gpb-expenses-charts">
              <ExpensePieChart
                title="Доход / расход"
                items={[
                  { title: "Доход", amount: revenue, color: "#0f7a63" },
                  { title: "Расход", amount: totalExpenses, color: "#b42318" }
                ]}
              />
              <ExpensePieChart
                title="Категории"
                items={categoryTotals.map((item, index) => ({
                  title: item.title,
                  amount: item.amount,
                  color: EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length]
                }))}
              />
            </aside>
          </section>
        </main>

        {isExpenseFormOpen ? (
          <ExpenseFormModal
            categories={categories}
            form={expenseForm}
            onChange={setExpenseForm}
            onCreateOrSelectCategory={createOrSelectExpenseCategory}
            onSubmit={saveExpenseFromForm}
            onClose={() => {
              setIsExpenseFormOpen(false);
              setEditingExpenseId("");
            }}
            isEditing={Boolean(editingExpenseId)}
          />
        ) : null}
        {deleteExpenseTarget ? (
          <DeleteExpenseModal
            entry={deleteExpenseTarget}
            onClose={() => setDeleteExpenseTarget(null)}
            onConfirm={() => void deleteExpenseEntry(deleteExpenseTarget)}
          />
        ) : null}
      </div>
    </div>
  );
}

function DeleteExpenseModal({
  entry,
  onClose,
  onConfirm
}: {
  entry: ExpenseEntry;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="gpb-create-backdrop gpb-settings-field-backdrop">
      <div className="gpb-delete-expense-modal" role="dialog" aria-modal="true" aria-label="Удалить расход">
        <header className="gpb-create-header">
          <div>
            <strong>Удалить расход?</strong>
            <span>{entry.title} · {formatAnalyticsMoney(entry.amount)}</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-delete-expense-body">
          <p>Расход будет удален из списка и перестанет учитываться в аналитике.</p>
        </div>
        <footer className="gpb-create-footer">
          <button type="button" className="gpb-secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="gpb-danger-button" onClick={onConfirm}>
            Удалить
          </button>
        </footer>
      </div>
    </div>
  );
}

function ExpenseFormModal({
  categories,
  form,
  onChange,
  onCreateOrSelectCategory,
  onSubmit,
  onClose,
  isEditing
}: {
  categories: ExpenseCategory[];
  form: { categoryId: string; categoryQuery: string; amount: string; paymentDate: string };
  onChange: (form: { categoryId: string; categoryQuery: string; amount: string; paymentDate: string }) => void;
  onCreateOrSelectCategory: (title: string) => Promise<ExpenseCategory | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  isEditing: boolean;
}) {
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState(form.categoryQuery);
  const categorySearchInputRef = useRef<HTMLInputElement | null>(null);
  const query = categorySearch.trim();
  const visibleCategories = categories
    .filter((category) => !query || category.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);
  const hasExactCategory = categories.some((category) => category.title.trim().toLowerCase() === query.toLowerCase());

  useEffect(() => {
    if (!isCategoryPickerOpen) return;
    setCategorySearch(form.categoryQuery);
    window.setTimeout(() => categorySearchInputRef.current?.focus(), 0);
  }, [form.categoryQuery, isCategoryPickerOpen]);

  async function handleCategoryCreateOrSelect(title = categorySearch) {
    await onCreateOrSelectCategory(title);
  }

  return (
    <div className="gpb-create-backdrop gpb-settings-field-backdrop">
      <form className="gpb-create-modal gpb-expense-form-modal" onSubmit={onSubmit} role="dialog" aria-modal="true" aria-label="Создать расход">
        <header className="gpb-create-header">
          <div>
            <strong>{isEditing ? "Редактировать расход" : "Создать расход"}</strong>
            <span>Выберите статью или создайте новую прямо из поля</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>

        <div className="gpb-expense-form-body">
          <label className="gpb-expense-category-picker">
            Статья расхода
            <input
              readOnly
              value={form.categoryQuery}
              onClick={() => setIsCategoryPickerOpen(true)}
              onFocus={() => setIsCategoryPickerOpen(true)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== "ArrowDown") return;
                event.preventDefault();
                setIsCategoryPickerOpen(true);
              }}
              placeholder="Начните писать или выберите из списка"
            />
            <div className={isCategoryPickerOpen ? "gpb-expense-category-options is-open" : "gpb-expense-category-options"}>
              <input
                ref={categorySearchInputRef}
                className="gpb-expense-category-search"
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void handleCategoryCreateOrSelect(categorySearch);
                  setIsCategoryPickerOpen(false);
                }}
                placeholder="Поиск или новая статья"
              />
              {visibleCategories.map((category) => (
                <button
                  type="button"
                  className={category.id === form.categoryId ? "is-active" : ""}
                  key={category.id}
                  onClick={() => {
                    onChange({ ...form, categoryId: category.id, categoryQuery: category.title });
                    setIsCategoryPickerOpen(false);
                  }}
                >
                  {category.title}
                </button>
              ))}
              {query && !hasExactCategory ? (
                <button
                  type="button"
                  className="is-create"
                  onClick={() => {
                    void handleCategoryCreateOrSelect(categorySearch);
                    setIsCategoryPickerOpen(false);
                  }}
                >
                  Создать "{query}"
                </button>
              ) : null}
            </div>
          </label>

          <label>
            Сумма
            <input
              inputMode="numeric"
              value={form.amount}
              onChange={(event) => onChange({ ...form, amount: formatExpenseAmountInput(event.target.value) })}
              placeholder="0"
            />
          </label>

          <label>
            Дата выплаты
            <input type="date" value={form.paymentDate} onChange={(event) => onChange({ ...form, paymentDate: event.target.value })} />
          </label>
        </div>

        <footer className="gpb-create-footer">
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button className="gpb-primary" type="submit">{isEditing ? "Сохранить" : "Создать"}</button>
        </footer>
      </form>
    </div>
  );
}

const EXPENSE_CHART_COLORS = ["#0f7a63", "#2563eb", "#d97706", "#7c3aed", "#be123c", "#0891b2", "#65a30d"];

function ExpensePieChart({
  title,
  items
}: {
  title: string;
  items: Array<{ title: string; amount: number; color: string }>;
}) {
  const visibleItems = items.filter((item) => item.amount > 0);
  const total = visibleItems.reduce((sum, item) => sum + item.amount, 0);
  let cursor = 0;
  const background = total
    ? visibleItems.map((item) => {
      const start = cursor;
      const size = (item.amount / total) * 100;
      cursor += size;
      return `${item.color} ${start}% ${cursor}%`;
    }).join(", ")
    : "#e5e9ee 0% 100%";

  return (
    <section className="gpb-expense-chart-card">
      <header>
        <strong>{title}</strong>
        <span>{formatAnalyticsMoney(total)}</span>
      </header>
      <div className="gpb-expense-pie" style={{ background: `conic-gradient(${background})` }}>
        <span>{total ? "100%" : "0"}</span>
      </div>
      {visibleItems.length ? (
        <div className="gpb-expense-chart-legend">
          {visibleItems.map((item) => (
            <div key={item.title}>
              <i style={{ background: item.color }} />
              <span>{item.title}</span>
              <b>{formatAnalyticsMoney(item.amount)}</b>
            </div>
          ))}
        </div>
      ) : (
        <p>Данных пока нет</p>
      )}
    </section>
  );
}

function AvailabilityConflictList({
  checkIn,
  checkOut,
  conflicts
}: {
  checkIn: string;
  checkOut: string;
  conflicts: AvailabilityConflict[];
}) {
  if (!conflicts.length) {
    return null;
  }

  return (
    <div className="gpb-availability-conflicts">
      <strong>Заняты в период {formatReservationRangeText(checkIn, checkOut)}</strong>
      <div>
        {conflicts.map(({ busyFrom, busyTo, reservation, room }) => (
          <div className="gpb-availability-conflict-row" key={`${room.id}-${reservation.id}`}>
            <b>{formatBookingPickerObjectLabel(room)} - Занято</b>
            <span>
              {isHourlyBookingObject(room)
                ? `${formatShortDateText(reservation.checkIn)} · ${busyFrom}-${busyTo}`
                : formatReservationRangeText(reservation.checkIn, reservation.checkOut)}
            </span>
            {reservation.guestFirstName ? <small>{reservation.guestFirstName}</small> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatReservationRangeText(checkIn: string, checkOut: string) {
  return formatReservationDateRange({ checkIn, checkOut });
}

function HeaderWeatherStrip({ weatherState }: { weatherState: WeatherState }) {
  const parts = weatherState.status === "ready"
    ? orderWeatherDayPartsForPanel(weatherState.forecast.dayParts)
    : [
      { label: "Утро", temperature: Number.NaN, precipitationProbability: 0 },
      { label: "День", temperature: Number.NaN, precipitationProbability: 0 },
      { label: "Вечер", temperature: Number.NaN, precipitationProbability: 0 },
      { label: "Ночь", temperature: Number.NaN, precipitationProbability: 0 }
    ];

  return (
    <div className="gpb-header-weather-strip" title={weatherState.status === "ready" ? getWeatherDescription(weatherState.forecast.weatherCode) : getWeatherStateMessage(weatherState)}>
      {parts.map((part) => (
        <span key={part.label}>
          <b>{part.label}</b>
          <strong>{Number.isFinite(part.temperature) ? `${Math.round(part.temperature)}°` : "-"}</strong>
        </span>
      ))}
    </div>
  );
}

function CatalogAvailabilityChips({ summary }: { summary: CatalogAvailabilitySummary }) {
  const items = summary.mode === "booked"
    ? [
      ["Забронировано номера", summary.rooms],
      ["Сауна", summary.saunas],
      ["Беседка", summary.gazebos],
      ["Матрасы", summary.airBeds],
      ["Раскладушки", summary.rollaways]
    ] as const
    : [
      ["Доступные номера", summary.rooms],
      ["Сауна", summary.saunas],
      ["Беседка", summary.gazebos],
      ["Надувные матрасы", summary.airBeds],
      ["Раскладушки", summary.rollaways]
    ] as const;

  return (
    <div className="gpb-catalog-availability-chips">
      {items
        .filter(([, value]) => summary.mode !== "booked" || value > 0)
        .map(([label, value]) => (
          <span key={label}>
            {label}: <b>{value}</b>
          </span>
        ))}
    </div>
  );
}

function PricePdfOptionsModal({
  availabilitySummary,
  checkIn,
  checkOut,
  defaultCheckInTime,
  defaultCheckOutTime,
  draggedRoomId,
  discountPercent,
  galleryPhotoCount,
  galleryPhotoPaths,
  galleryVideoCount,
  galleryVideoPaths,
  groupPeriodTotals,
  giftText,
  includeGallery,
  linkIds,
  linkMethods,
  minRooms,
  options,
  periodDiscountFrom,
  periodDiscountPercent,
  periodDiscountTo,
  rooms,
  selectedRoomIds,
  submitLabel,
  summary,
  onClose,
  onDragEnd,
  onDragStart,
  onDropRoom,
  onGroupPeriodTotalsChange,
  onIncludeGalleryChange,
  onPeriodDiscountChange,
  onCopyLink,
  onDownloadStory,
  onSubmitStory,
  onSubmit,
  onToggleLink,
  onToggle,
  onToggleRoom
}: {
  availabilitySummary: CatalogAvailabilitySummary;
  checkIn: string;
  checkOut: string;
  defaultCheckInTime: string;
  defaultCheckOutTime: string;
  draggedRoomId: string;
  discountPercent: number;
  galleryPhotoCount: number;
  galleryPhotoPaths: string[];
  galleryVideoCount: number;
  galleryVideoPaths: string[];
  groupPeriodTotals: boolean;
  giftText: string;
  includeGallery: boolean;
  linkIds: string[];
  linkMethods: Array<SettingMethod & { value: string }>;
  minRooms: number;
  options: PricePdfSummaryOptionKey[];
  periodDiscountFrom: string;
  periodDiscountPercent: number;
  periodDiscountTo: string;
  rooms: Room[];
  selectedRoomIds: string[];
  submitLabel: string;
  summary: CatalogAvailabilitySummary;
  onClose: () => void;
  onDragEnd: () => void;
  onDragStart: (roomId: string) => void;
  onDropRoom: (roomId: string) => void;
  onGroupPeriodTotalsChange: (value: boolean) => void;
  onIncludeGalleryChange: (value: boolean) => void;
  onPeriodDiscountChange: (patch: Partial<{ periodDiscountPercent: number; periodDiscountFrom: string; periodDiscountTo: string }>) => void;
  onCopyLink: (value: string) => void | Promise<void>;
  onDownloadStory?: () => void;
  onSubmitStory?: (items: Array<{ blob: Blob; name: string }>) => void | Promise<void>;
  onSubmit: () => void;
  onToggleLink: (methodId: string) => void;
  onToggle: (option: PricePdfSummaryOptionKey) => void;
  onToggleRoom: (roomId: string) => void;
}) {
  const [previewMode, setPreviewMode] = useState<"pdf" | "story">("pdf");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [storyPreviewItems, setStoryPreviewItems] = useState<Array<{ blob: Blob; name: string; url: string }>>([]);
  const [storyPreviewIndex, setStoryPreviewIndex] = useState(0);
  const [storyExportMode, setStoryExportMode] = useState<"list" | "images">("images");
  const [storyIncludeImages, setStoryIncludeImages] = useState(true);
  const [pdfPreviewState, setPdfPreviewState] = useState<"idle" | "loading" | "error">("idle");
  const [storyPreviewState, setStoryPreviewState] = useState<"idle" | "loading" | "error">("idle");
  const [isStoryDownloading, setIsStoryDownloading] = useState(false);
  const optionRows = getPricePdfSummaryOptionRows(summary);
  const hasSelectedOptions = options.length > 0 && selectedRoomIds.length > 0;
  const canDownloadStory = selectedRoomIds.length > 0 && !isStoryDownloading;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const orderedRooms = selectedRoomIds.map((roomId) => roomById.get(roomId)).filter((room): room is Room => Boolean(room));
  const selectedSet = new Set(selectedRoomIds);
  const unselectedRooms = rooms.filter((room) => !selectedSet.has(room.id));
  const displayRooms = orderedRooms.concat(unselectedRooms);
  const configuredLinks = linkMethods.filter((method) => method.value.trim());
  const previewKey = [
    checkIn,
    checkOut,
    discountPercent,
    giftText,
    includeGallery,
    linkIds.join("|"),
    minRooms,
    options.join("|"),
    selectedRoomIds.join("|"),
    galleryPhotoPaths.join("|"),
    galleryVideoPaths.join("|"),
    String(groupPeriodTotals),
    periodDiscountFrom,
    String(periodDiscountPercent),
    periodDiscountTo,
    storyExportMode,
    storyIncludeImages
  ].join("::");

  async function buildStoryExportItems() {
    if (!orderedRooms.length) return [];
    if (storyExportMode === "list") {
      return [{
        blob: await createSocialPriceImageBlob({
          checkIn,
          checkOut,
          description: giftText,
          groupPeriodTotals,
          periodDiscountFrom,
          periodDiscountPercent,
          periodDiscountTo,
          rooms: orderedRooms
        }),
        name: `story-list-${checkIn || formatDateInput(new Date())}.png`
      }];
    }

    const results = await Promise.allSettled(orderedRooms.map(async (room, index) => {
      const blob = await createSocialPriceRoomImageBlob({
        checkIn,
        checkOut,
        description: giftText,
        groupPeriodTotals,
        includePhoto: storyIncludeImages,
        periodDiscountFrom,
        periodDiscountPercent,
        periodDiscountTo,
        room
      });
      const label = (formatBookingPickerObjectLabel(room) || `object-${index + 1}`).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      return {
        blob,
        name: `story-${checkIn || formatDateInput(new Date())}-${label || index + 1}.png`
      };
    }));

    return results
      .filter((result): result is PromiseFulfilledResult<{ blob: Blob; name: string }> => result.status === "fulfilled")
      .map((result) => result.value);
  }

  useEffect(() => {
    let isCancelled = false;
    setPdfPreviewState("loading");
    setStoryPreviewState("loading");

    async function renderPreviews() {
      if (!orderedRooms.length) {
        setPdfPreviewUrl((previousUrl) => {
          if (previousUrl) URL.revokeObjectURL(previousUrl);
          return "";
        });
        setStoryPreviewItems((previousItems) => {
          previousItems.forEach((item) => URL.revokeObjectURL(item.url));
          return [];
        });
        setPdfPreviewState("idle");
        setStoryPreviewState("idle");
        return;
      }

      try {
        const linkMethodsRecord = Object.fromEntries(linkMethods.map((method) => [method.id, method.value]));
        const pdfFile = await createPriceProposalPdfFile({
          availabilitySummary,
          checkIn,
          checkOut,
          checkInTime: defaultCheckInTime,
          checkOutTime: defaultCheckOutTime,
          discountPercent,
          giftText,
          galleryPhotoPaths,
          galleryVideoPaths,
          groupPeriodTotals,
          includeGallery,
          linkIds,
          linkMethods: linkMethodsRecord,
          minRooms,
          mode: "available",
          rooms: orderedRooms,
          summaryOptions: options
        });
        const nextPdfUrl = URL.createObjectURL(pdfFile);
        if (isCancelled) {
          URL.revokeObjectURL(nextPdfUrl);
        } else {
          setPdfPreviewUrl((previousUrl) => {
            if (previousUrl) URL.revokeObjectURL(previousUrl);
            return nextPdfUrl;
          });
          setPdfPreviewState("idle");
        }
      } catch (error) {
        console.error("[GPB] PDF preview failed", error);
        void sendDebugLog("price-pdf-preview-failed", {
          message: error instanceof Error ? error.message : String(error),
          checkIn,
          checkOut,
          selectedRoomIds
        });
        if (!isCancelled) setPdfPreviewState("error");
      }

      try {
        const nextStoryItems = await buildStoryExportItems();
        const nextStoryItemsWithUrls = nextStoryItems.map((item) => ({
          ...item,
          url: URL.createObjectURL(item.blob)
        }));

        if (isCancelled) {
          nextStoryItemsWithUrls.forEach((item) => URL.revokeObjectURL(item.url));
          return;
        }

        setStoryPreviewItems((previousItems) => {
          previousItems.forEach((item) => URL.revokeObjectURL(item.url));
          return nextStoryItemsWithUrls;
        });
        setStoryPreviewIndex((currentIndex) => Math.min(currentIndex, Math.max(0, nextStoryItemsWithUrls.length - 1)));
        setStoryPreviewState("idle");
      } catch (error) {
        console.error("[GPB] Story preview failed", error);
        if (!isCancelled) setStoryPreviewState("error");
      }
    }

    void renderPreviews();
    return () => {
      isCancelled = true;
    };
  }, [previewKey]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      storyPreviewItems.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  async function downloadStoryZip() {
    if (!orderedRooms.length) return;
    setIsStoryDownloading(true);
    void sendDebugLog("story-download-start", {
      checkIn,
      checkOut,
      mode: storyExportMode,
      selectedRoomIds,
      selectedRooms: orderedRooms.map((room) => formatBookingPickerObjectLabel(room)),
      storyPreviewItems: storyPreviewItems.length
    });
    try {
      const items = storyPreviewItems.length
        ? storyPreviewItems.map((item) => ({ name: item.name, blob: item.blob }))
        : await buildStoryExportItems();
      void sendDebugLog("story-download-items-ready", {
        count: items.length,
        files: items.map((item) => ({ name: item.name, size: item.blob.size, type: item.blob.type }))
      });
      if (!items.length) {
        void sendDebugLog("story-download-empty", { selectedRoomIds });
        return;
      }
      if (items.length === 1) {
        downloadBlobFile(items[0].blob, items[0].name);
        void sendDebugLog("story-download-single-triggered", { name: items[0].name, size: items[0].blob.size });
        return;
      }
      const zipBlob = await createZipBlob(items);
      downloadBlobFile(zipBlob, `stories-${checkIn || formatDateInput(new Date())}.zip`);
      void sendDebugLog("story-download-zip-triggered", { files: items.length, zipSize: zipBlob.size });
    } catch (error) {
      console.error("[GPB] Story download failed", error);
      void sendDebugLog("story-download-failed", {
        message: error instanceof Error ? error.message : String(error),
        mode: storyExportMode,
        selectedRoomIds
      });
      const items = storyPreviewItems.length
        ? storyPreviewItems.map((item) => ({ name: item.name, blob: item.blob }))
        : await buildStoryExportItems().catch(() => []);
      for (const item of items) {
        downloadBlobFile(item.blob, item.name);
        await waitForDelay(160);
      }
      void sendDebugLog("story-download-fallback-triggered", { files: items.length });
    } finally {
      setIsStoryDownloading(false);
    }
  }

  async function submitCurrentPreview() {
    if (previewMode === "pdf") {
      onSubmit();
      return;
    }

    if (onDownloadStory) {
      await downloadStoryZip();
      return;
    }

    if (!onSubmitStory) return;
    setIsStoryDownloading(true);
    try {
      const items = storyPreviewItems.length
        ? storyPreviewItems.map((item) => ({ name: item.name, blob: item.blob }))
        : await buildStoryExportItems();
      if (!items.length) return;
      await onSubmitStory(items);
      onClose();
    } finally {
      setIsStoryDownloading(false);
    }
  }

  return (
    <div className="gpb-create-backdrop gpb-price-pdf-options-backdrop">
      <div className="gpb-confirm-action-modal gpb-price-pdf-options-modal" role="dialog" aria-modal="true" aria-label="Параметры прайса">
        <header className="gpb-create-header">
          <div>
            <strong>Параметры прайса</strong>
            <span>Выберите строки сводки, которые попадут в PDF.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-price-pdf-options-workspace">
          <div className="gpb-price-pdf-options-list">
            <section className="gpb-price-pdf-options-section">
            <strong>Карточки в прайсе</strong>
            <div className="gpb-price-pdf-room-list">
              {displayRooms.map((room) => {
                const isSelected = selectedRoomIds.includes(room.id);
                return (
                <label
                  key={room.id}
                  className={`gpb-price-pdf-room-option ${draggedRoomId === room.id ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""}`}
                  draggable={isSelected}
                  onDragEnd={onDragEnd}
                  onDragOver={(event) => {
                    if (isSelected) event.preventDefault();
                  }}
                  onDragStart={() => {
                    if (isSelected) onDragStart(room.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (isSelected) onDropRoom(room.id);
                  }}
                >
                  <input
                    checked={isSelected}
                    type="checkbox"
                    onChange={() => onToggleRoom(room.id)}
                  />
                  <RoomCatalogThumb room={room} />
                  <span>
                    <b>{formatBookingPickerObjectLabel(room)}</b>
                    <small>{getPanelObjectMetaLine(room)}</small>
                  </span>
                </label>
              );
              })}
            </div>
            </section>
            <section className="gpb-price-pdf-options-section">
            <strong>Строки сводки и допместа</strong>
          <div className="gpb-price-period-discount">
            <div className="gpb-price-period-discount-head">
              <span>Скидка на дату / период</span>
              <b>{periodDiscountPercent}%</b>
            </div>
            <div className="gpb-price-period-discount-control">
              <button
                type="button"
                onClick={() => onPeriodDiscountChange({ periodDiscountPercent: Math.max(0, periodDiscountPercent - 1) })}
              >
                -
              </button>
              <input
                min="0"
                max="100"
                type="number"
                value={periodDiscountPercent}
                onChange={(event) => onPeriodDiscountChange({ periodDiscountPercent: clampNumber(toNumber(event.target.value, periodDiscountPercent), 0, 100) })}
              />
              <button
                type="button"
                onClick={() => onPeriodDiscountChange({ periodDiscountPercent: Math.min(100, periodDiscountPercent + 1) })}
              >
                +
              </button>
            </div>
            <div className="gpb-price-period-discount-dates">
              <label>
                С
                <input
                  type="date"
                  value={periodDiscountFrom}
                  onChange={(event) => onPeriodDiscountChange({ periodDiscountFrom: event.target.value })}
                />
              </label>
              <label>
                По
                <input
                  type="date"
                  value={periodDiscountTo}
                  onChange={(event) => onPeriodDiscountChange({ periodDiscountTo: event.target.value })}
                />
              </label>
            </div>
            <small>Если нужна скидка на один день, поставьте одинаковую дату.</small>
          </div>
          <label className="gpb-price-pdf-option">
            <input
              checked={groupPeriodTotals}
              type="checkbox"
              onChange={(event) => onGroupPeriodTotalsChange(event.target.checked)}
            />
            <span>Группировать суммы</span>
            <small>Итог за выбранный период</small>
          </label>
          {optionRows.map((item) => (
            <label key={item.key} className="gpb-price-pdf-option">
              <input
                checked={options.includes(item.key)}
                type="checkbox"
                onChange={() => onToggle(item.key)}
              />
              <span>{item.label}</span>
              {item.value ? <b>{item.value}</b> : null}
            </label>
          ))}
            <label className="gpb-price-pdf-option">
              <input
                checked={includeGallery}
                disabled={galleryPhotoCount + galleryVideoCount === 0}
                type="checkbox"
                onChange={(event) => onIncludeGalleryChange(event.target.checked)}
              />
              <span>Включить галерею объекта</span>
              <b>{galleryPhotoCount} фото · {galleryVideoCount} видео</b>
            </label>
            {configuredLinks.length ? (
              <div className="gpb-price-pdf-link-list">
                <strong>Ссылки</strong>
                {configuredLinks.map((method) => (
                  <label key={method.id} className="gpb-price-pdf-link-option">
                    <input
                      checked={linkIds.includes(method.id)}
                      type="checkbox"
                      onChange={() => onToggleLink(method.id)}
                    />
                    <span>
                      <b>{method.label}</b>
                      <small>{method.value}</small>
                    </span>
                    <button type="button" onClick={(event) => {
                      event.preventDefault();
                      void onCopyLink(method.value);
                    }} title={`Скопировать ${method.label}`}>
                      <Copy size={15} />
                    </button>
                  </label>
                ))}
              </div>
            ) : null}
            </section>
          </div>
          <section className="gpb-price-preview-pane">
            <div className="gpb-price-preview-tabs">
              <button
                className={previewMode === "pdf" ? "is-active" : ""}
                type="button"
                onClick={() => setPreviewMode("pdf")}
              >
                PDF
              </button>
              <button
                className={previewMode === "story" ? "is-active" : ""}
                type="button"
                onClick={() => setPreviewMode("story")}
              >
                Сторис
              </button>
            </div>
            {previewMode === "story" ? (
              <div className="gpb-price-story-controls">
                <div className="gpb-price-preview-tabs is-compact">
                  <button
                    className={storyExportMode === "list" ? "is-active" : ""}
                    type="button"
                    onClick={() => {
                      setStoryExportMode("list");
                      setStoryPreviewIndex(0);
                    }}
                  >
                    Список
                  </button>
                  <button
                    className={storyExportMode === "images" ? "is-active" : ""}
                    type="button"
                    onClick={() => {
                      setStoryExportMode("images");
                      setStoryPreviewIndex(0);
                    }}
                  >
                    Картинки
                  </button>
                </div>
                {storyExportMode === "images" ? (
                  <label className="gpb-price-preview-check">
                    <input
                      checked={storyIncludeImages}
                      type="checkbox"
                      onChange={(event) => setStoryIncludeImages(event.target.checked)}
                    />
                    С картинками
                  </label>
                ) : null}
              </div>
            ) : null}
            <div className="gpb-price-preview-frame">
              {previewMode === "pdf" && pdfPreviewState === "loading" ? (
                <div className="gpb-price-preview-empty">Готовлю предпросмотр...</div>
              ) : previewMode === "story" && storyPreviewState === "loading" ? (
                <div className="gpb-price-preview-empty">Готовлю предпросмотр...</div>
              ) : previewMode === "pdf" && pdfPreviewState === "error" ? (
                <div className="gpb-price-preview-empty is-error">Не удалось собрать PDF-предпросмотр</div>
              ) : previewMode === "story" && storyPreviewState === "error" ? (
                <div className="gpb-price-preview-empty is-error">Не удалось собрать предпросмотр</div>
              ) : previewMode === "pdf" && pdfPreviewUrl ? (
                <iframe title="Предпросмотр PDF" src={pdfPreviewUrl} />
              ) : previewMode === "story" && storyPreviewItems[storyPreviewIndex] ? (
                <img src={storyPreviewItems[storyPreviewIndex].url} alt="Предпросмотр сторис" />
              ) : (
                <div className="gpb-price-preview-empty">Выберите карточки</div>
              )}
            </div>
            {previewMode === "story" && storyPreviewItems.length > 1 ? (
              <div className="gpb-price-preview-pager">
                <button type="button" onClick={() => setStoryPreviewIndex((index) => Math.max(0, index - 1))}>
                  <ChevronLeft size={16} />
                </button>
                <span>{storyPreviewIndex + 1} / {storyPreviewItems.length}</span>
                <button type="button" onClick={() => setStoryPreviewIndex((index) => Math.min(storyPreviewItems.length - 1, index + 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : null}
          </section>
        </div>
        <footer className="gpb-create-footer">
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button
            className="gpb-primary"
            type="button"
            onClick={() => void submitCurrentPreview()}
            disabled={previewMode === "story" ? !canDownloadStory : !hasSelectedOptions}
          >
            {previewMode === "story"
              ? isStoryDownloading
                ? "Готовлю..."
                : onDownloadStory ? "Скачать сторис" : "Отправить сторис"
              : submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SocialPriceImageModal({
  checkIn,
  checkOut,
  description,
  rooms,
  selectedRoomIds,
  onClose,
  onDescriptionChange,
  onDownload,
  onToggleRoom
}: {
  checkIn: string;
  checkOut: string;
  description: string;
  rooms: Room[];
  selectedRoomIds: string[];
  onClose: () => void;
  onDescriptionChange: (value: string) => void;
  onDownload: () => void;
  onToggleRoom: (roomId: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const roomById = useMemo(() => new Map(rooms.map((room) => [room.id, room])), [rooms]);
  const orderedRooms = selectedRoomIds.map((roomId) => roomById.get(roomId)).filter((room): room is Room => Boolean(room));
  const selectedSet = new Set(selectedRoomIds);
  const displayRooms = orderedRooms.concat(rooms.filter((room) => !selectedSet.has(room.id)));

  useEffect(() => {
    let isCancelled = false;
    let objectUrl = "";
    async function renderPreview() {
      if (!orderedRooms.length) {
        setPreviewUrl("");
        return;
      }
      const blob = await createSocialPriceImageBlob({ checkIn, checkOut, description, rooms: orderedRooms });
      if (isCancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return objectUrl;
      });
    }
    void renderPreview();
    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [checkIn, checkOut, description, orderedRooms.map((room) => room.id).join("|")]);

  return (
    <div className="gpb-create-backdrop gpb-social-price-backdrop">
      <div className="gpb-social-price-modal" role="dialog" aria-modal="true" aria-label="Прайс для соцсетей">
        <header className="gpb-create-header">
          <div>
            <strong>Прайс для соцсетей</strong>
            <span>Одна картинка 1080 x 1920 для сторис, статуса WhatsApp и Instagram.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-social-price-body">
          <aside className="gpb-social-price-controls">
            <label className="gpb-social-price-field">
              Описание
              <textarea
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value)}
                placeholder="Например: Прайс на выходные или предложение на май."
              />
            </label>
            <section className="gpb-social-price-section">
              <strong>Что включить</strong>
              <div className="gpb-social-price-room-list">
                {displayRooms.map((room) => {
                  const isSelected = selectedRoomIds.includes(room.id);
                  return (
                    <label key={room.id} className={`gpb-social-price-room ${isSelected ? "is-selected" : ""}`}>
                      <input
                        checked={isSelected}
                        type="checkbox"
                        onChange={() => onToggleRoom(room.id)}
                      />
                      <span className="gpb-social-price-room-icon">{getSocialPriceObjectIcon(room)}</span>
                      <span>
                        <b>{getSocialPriceObjectTitle(room)}</b>
                        <small>{getSocialPriceObjectMeta(room, checkIn, checkOut)}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          </aside>
          <section className="gpb-social-price-preview">
            {previewUrl ? (
              <img src={previewUrl} alt="Предпросмотр прайса для соцсетей" />
            ) : (
              <div className="gpb-social-price-empty">Выберите хотя бы один объект</div>
            )}
          </section>
        </div>
        <footer className="gpb-create-footer">
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button className="gpb-primary" type="button" onClick={onDownload} disabled={!orderedRooms.length}>
            <Download size={16} />
            Скачать PNG
          </button>
        </footer>
      </div>
    </div>
  );
}

function getPricePdfSummaryOptionRows(summary: CatalogAvailabilitySummary): Array<{ key: PricePdfSummaryOptionKey; label: string; value?: string }> {
  return [
    { key: "period", label: "Период" },
    { key: "rooms", label: "Доступные номера", value: `${summary.rooms}` },
    { key: "saunas", label: "Сауна", value: `${summary.saunas}` },
    { key: "sleepingPlaces", label: "Спальных мест", value: `${summary.sleepingPlaces}` },
    { key: "airBeds", label: "Надувные матрасы", value: `${summary.airBeds}` },
    { key: "rollaways", label: "Раскладушки", value: `${summary.rollaways}` },
    { key: "subtotal", label: "Стоимость до скидки" },
    { key: "discount", label: "Скидка" },
    { key: "total", label: "Итого" },
    { key: "prepayment", label: "Предоплата 50%" },
    { key: "conditions", label: "Условия бронирования" }
  ];
}

function orderWeatherDayPartsForPanel(dayParts: WeatherDayPart[]) {
  const order = ["Утро", "День", "Вечер", "Ночь"];
  return [...dayParts].sort((left, right) => order.indexOf(left.label) - order.indexOf(right.label));
}

function TodayWeatherSummary({ locationName, weatherState }: { locationName: string; weatherState: WeatherState }) {
  if (weatherState.status === "ready") {
    const forecast = weatherState.forecast;
    return (
      <div className="gpb-today-weather-summary">
        <span>Сегодня · {locationName}</span>
        <strong>
          {Math.round(forecast.minTemperature)}...{Math.round(forecast.maxTemperature)} °C
        </strong>
        <small>{getWeatherDescription(forecast.weatherCode)}</small>
        <div className="gpb-today-weather-dayparts">
          {forecast.dayParts.map((part) => (
            <span key={part.label}>
              <b>{part.label}</b>
              {Number.isFinite(part.temperature) ? `${Math.round(part.temperature)}°` : "-"}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="gpb-today-weather-summary is-muted">
      <span>Сегодня · {locationName}</span>
      <strong>{weatherState.status === "loading" ? "Загрузка" : "-"}</strong>
      <small>{getWeatherStateMessage(weatherState)}</small>
    </div>
  );
}

function getWeatherStateMessage(weatherState: WeatherState) {
  if (weatherState.status === "idle") return "Погода";
  if (weatherState.status === "loading") return "Обновляю прогноз";
  if (weatherState.status === "ready") return getWeatherDescription(weatherState.forecast.weatherCode);
  return weatherState.message;
}

function buildSettingMethodList(defaultMethods: SettingMethod[], values: Record<string, string>) {
  const defaultIds = new Set(defaultMethods.map((method) => method.id));
  const customMethods = Object.keys(values)
    .filter((fieldId) => !defaultIds.has(fieldId))
    .map((fieldId) => ({ id: fieldId, label: fieldId }));
  return defaultMethods.concat(customMethods);
}

function buildPaymentMethodSelectionList(values: Record<string, string>) {
  const defaultIds = new Set(PAYMENT_METHODS.map((method) => method.id));
  const defaultMethods = PAYMENT_METHODS.filter((method) => (
    ALWAYS_AVAILABLE_PAYMENT_METHOD_IDS.has(method.id) || Boolean(values[method.id]?.trim())
  ));
  const customMethods = Object.keys(values)
    .filter((fieldId) => !defaultIds.has(fieldId))
    .map((fieldId) => ({ id: fieldId, label: fieldId }));
  return defaultMethods.concat(customMethods);
}

function getSettingMethod(defaultMethods: SettingMethod[], values: Record<string, string>, methodId: string) {
  return buildSettingMethodList(defaultMethods, values).find((method) => method.id === methodId) ?? null;
}

function getLinkMethodPlaceholder(method: SettingMethod) {
  if (method.id === "whatsapp") return "Например: https://wa.me/77001234567";
  if (method.id === "2gis") return "Ссылка 2GIS";
  if (method.id === "instagram") return "Ссылка Instagram";
  return `Ссылка ${method.label}`;
}

function createCustomSettingFieldId(name: string | null, values: Record<string, string>) {
  const cleanName = (name ?? "").trim();
  if (!cleanName) return "";
  if (!values[cleanName]) return cleanName;

  let index = 2;
  let nextName = `${cleanName} ${index}`;
  while (values[nextName]) {
    index += 1;
    nextName = `${cleanName} ${index}`;
  }
  return nextName;
}

function removeRecordKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...nextRecord } = record;
  return nextRecord;
}

function SettingsModal({
  companyRequisites,
  defaultCheckInTime,
  linkMethods,
  menuItems,
  menuUploadItemId,
  objectGalleryPhotoPaths,
  objectGalleryUploadState,
  objectGalleryVideoPaths,
  paymentMethods,
  weatherLatitude,
  weatherLocationName,
  weatherLongitude,
  inventoryAirBeds,
  inventoryRollaways,
  inventoryCustomFields,
  packageDiscountPercent,
  packagePeriodDiscountPercent,
  packagePeriodDiscountFrom,
  packagePeriodDiscountTo,
  breakfastPricePerPerson,
  packageCustomFields,
  packageGiftText,
  packageIncludeAmenities,
  packageMinRooms,
  servicePassword,
  onClose,
  onCompanyRequisiteChange,
  onCompanyRequisiteDelete,
  onCompanyRequisitesSave,
  onDefaultCheckInTimeChange,
  onLinkMethodChange,
  onLinkMethodDelete,
  onLinkSettingsSave,
  onMenuItemChange,
  onMenuItemCreate,
  onMenuItemDelete,
  onMenuItemPhotoUpload,
  onMenuItemsBulkPriceChange,
  onMenuItemsSave,
  onObjectGalleryDelete,
  onObjectGallerySave,
  onObjectGalleryUpload,
  onPaymentMethodChange,
  onPaymentMethodDelete,
  onPaymentSettingsSave,
  onWeatherSettingsChange,
  onInventorySettingsChange,
  onInventoryCustomFieldChange,
  onInventoryCustomFieldDelete,
  onPackageSettingsChange,
  onPackageCustomFieldChange,
  onPackageCustomFieldDelete,
  onServicePasswordChange
}: {
  companyRequisites: Record<string, string>;
  defaultCheckInTime: string;
  linkMethods: Record<string, string>;
  menuItems: MenuItem[];
  menuUploadItemId: string;
  objectGalleryPhotoPaths: string[];
  objectGalleryUploadState: { message: string; status: "idle" | "uploading" | "error" };
  objectGalleryVideoPaths: string[];
  paymentMethods: Record<string, string>;
  weatherLatitude: number;
  weatherLocationName: string;
  weatherLongitude: number;
  inventoryAirBeds: number;
  inventoryRollaways: number;
  inventoryCustomFields: Record<string, string>;
  packageDiscountPercent: number;
  packagePeriodDiscountPercent: number;
  packagePeriodDiscountFrom: string;
  packagePeriodDiscountTo: string;
  breakfastPricePerPerson: number;
  packageCustomFields: Record<string, string>;
  packageGiftText: string;
  packageIncludeAmenities: boolean;
  packageMinRooms: number;
  servicePassword: string;
  onClose: () => void;
  onCompanyRequisiteChange: (fieldId: string, value: string) => void;
  onCompanyRequisiteDelete: (fieldId: string) => void;
  onCompanyRequisitesSave: () => void;
  onDefaultCheckInTimeChange: (value: string) => void;
  onLinkMethodChange: (methodId: string, value: string) => void;
  onLinkMethodDelete: (methodId: string) => void;
  onLinkSettingsSave: () => void;
  onMenuItemChange: (itemId: string, patch: Partial<MenuItem>) => void;
  onMenuItemCreate: () => void;
  onMenuItemDelete: (itemId: string) => void;
  onMenuItemPhotoUpload: (itemId: string, fileList: FileList | null) => void;
  onMenuItemsBulkPriceChange: (percent: number) => void;
  onMenuItemsSave: () => void;
  onObjectGalleryDelete: (path: string) => void;
  onObjectGallerySave: () => void;
  onObjectGalleryUpload: (fileList: FileList | null) => void;
  onPaymentMethodChange: (methodId: string, value: string) => void;
  onPaymentMethodDelete: (methodId: string) => void;
  onPaymentSettingsSave: () => void;
  onWeatherSettingsChange: (settings: { name: string; latitude: number; longitude: number }) => void;
  onInventorySettingsChange: (settings: { airBeds: number; rollaways: number }) => void;
  onInventoryCustomFieldChange: (fieldId: string, value: string) => void;
  onInventoryCustomFieldDelete: (fieldId: string) => void;
  onPackageSettingsChange: (settings: {
    discountPercent: number;
    periodDiscountPercent: number;
    periodDiscountFrom: string;
    periodDiscountTo: string;
    breakfastPricePerPerson: number;
    giftText: string;
    includeAmenities: boolean;
    minRooms: number;
  }) => void;
  onPackageCustomFieldChange: (fieldId: string, value: string) => void;
  onPackageCustomFieldDelete: (fieldId: string) => void;
  onServicePasswordChange: (value: string) => void;
}) {
  const [localWeatherName, setLocalWeatherName] = useState(weatherLocationName);
  const [localWeatherLatitude, setLocalWeatherLatitude] = useState(String(weatherLatitude));
  const [localWeatherLongitude, setLocalWeatherLongitude] = useState(String(weatherLongitude));
  const [localAirBeds, setLocalAirBeds] = useState(String(inventoryAirBeds));
  const [localRollaways, setLocalRollaways] = useState(String(inventoryRollaways));
  const [localPackageDiscount, setLocalPackageDiscount] = useState(String(packageDiscountPercent));
  const [localPackagePeriodDiscount, setLocalPackagePeriodDiscount] = useState(String(packagePeriodDiscountPercent));
  const [localPackagePeriodFrom, setLocalPackagePeriodFrom] = useState(packagePeriodDiscountFrom);
  const [localPackagePeriodTo, setLocalPackagePeriodTo] = useState(packagePeriodDiscountTo);
  const [localBreakfastPrice, setLocalBreakfastPrice] = useState(String(breakfastPricePerPerson));
  const [localPackageGift, setLocalPackageGift] = useState(packageGiftText);
  const [localPackageMinRooms, setLocalPackageMinRooms] = useState(String(packageMinRooms));
  const [localPackageIncludeAmenities, setLocalPackageIncludeAmenities] = useState(packageIncludeAmenities);
  const [menuBulkPricePercent, setMenuBulkPricePercent] = useState(0);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupStatus, setBackupStatus] = useState<"idle" | "busy" | "error">("idle");
  const objectGalleryPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const objectGalleryVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [backupOptions, setBackupOptions] = useState<BackupExportOptions>({
    chatDrafts: true,
    expenses: true,
    guestContacts: true,
    localRoomsCache: true,
    media: false,
    paymentSettings: true,
    reservations: true,
    rooms: true
  });
  const [activeSettingsSection, setActiveSettingsSection] = useState<
    "payment" | "company" | "links" | "gallery" | "menu" | "package" | "inventory" | "weather" | "backup" | "service"
  >("payment");
  const [customFieldRequest, setCustomFieldRequest] = useState<{
    existingValues: Record<string, string>;
    onCreate: (fieldId: string) => void;
    placeholder: string;
    title: string;
  } | null>(null);
  const paymentMethodList = buildSettingMethodList(PAYMENT_METHODS, paymentMethods);
  const companyRequisiteList = buildSettingMethodList(COMPANY_REQUISITE_FIELDS, companyRequisites);
  const linkMethodList = buildSettingMethodList(LINK_METHODS, linkMethods);
  const settingsSections = [
    { id: "payment", label: "Оплата", icon: Banknote },
    { id: "company", label: "Моя компания", icon: Hotel },
    { id: "links", label: "Ссылки", icon: Send },
    { id: "gallery", label: "Галерея", icon: Image },
    { id: "menu", label: "Меню", icon: Utensils },
    { id: "package", label: "Прайс / пакет", icon: Hotel },
    { id: "inventory", label: "Инвентарь", icon: BedDouble },
    { id: "weather", label: "Погода и время", icon: CloudSun },
    { id: "backup", label: "Резервная копия", icon: Download },
    { id: "service", label: "Сервис", icon: Settings }
  ] as const;

  function addPaymentMethodField() {
    openCustomFieldOverlay("Новый способ оплаты", "Например: Карта другого банка", paymentMethods, (fieldId) => onPaymentMethodChange(fieldId, ""));
  }

  function addLinkMethodField() {
    openCustomFieldOverlay("Новая ссылка", "Например: Столовая", linkMethods, (fieldId) => onLinkMethodChange(fieldId, ""));
  }

  function addCompanyRequisiteField() {
    openCustomFieldOverlay("Новое поле реквизитов", "Например: Директор или email", companyRequisites, (fieldId) => onCompanyRequisiteChange(fieldId, ""));
  }

  function addInventoryField() {
    openCustomFieldOverlay("Новое поле инвентаря", "Например: Детские кроватки", inventoryCustomFields, (fieldId) => onInventoryCustomFieldChange(fieldId, ""));
  }

  function addPackageField() {
    openCustomFieldOverlay("Новое поле пакета", "Например: Бонус для группы", packageCustomFields, (fieldId) => onPackageCustomFieldChange(fieldId, ""));
  }

  function openCustomFieldOverlay(
    title: string,
    placeholder: string,
    existingValues: Record<string, string>,
    onCreate: (fieldId: string) => void
  ) {
    setCustomFieldRequest({ existingValues, onCreate, placeholder, title });
  }

  function handleCreateCustomField(name: string) {
    if (!customFieldRequest) return;
    const fieldId = createCustomSettingFieldId(name, customFieldRequest.existingValues);
    if (!fieldId) return;

    customFieldRequest.onCreate(fieldId);
    setCustomFieldRequest(null);
  }

  function handleWeatherLocationSelect(name: string) {
    const location = WEATHER_LOCATIONS.find((item) => item.name === name);
    if (!location) return;

    setLocalWeatherName(location.name);
    setLocalWeatherLatitude(String(location.latitude));
    setLocalWeatherLongitude(String(location.longitude));
    onWeatherSettingsChange(location);
  }

  function saveWeatherSettings() {
    onWeatherSettingsChange({
      name: localWeatherName.trim() || "Место",
      latitude: toNumber(localWeatherLatitude, weatherLatitude),
      longitude: toNumber(localWeatherLongitude, weatherLongitude)
    });
  }

  function saveInventorySettings() {
    onInventorySettingsChange({
      airBeds: toNumber(localAirBeds, inventoryAirBeds),
      rollaways: toNumber(localRollaways, inventoryRollaways)
    });
  }

  function savePackageSettings() {
    onPackageSettingsChange({
      discountPercent: clampNumber(toNumber(localPackageDiscount, packageDiscountPercent), 0, 100),
      periodDiscountPercent: clampNumber(toNumber(localPackagePeriodDiscount, packagePeriodDiscountPercent), 0, 100),
      periodDiscountFrom: localPackagePeriodFrom,
      periodDiscountTo: localPackagePeriodTo,
      breakfastPricePerPerson: Math.max(0, toNumber(localBreakfastPrice, breakfastPricePerPerson)),
      giftText: localPackageGift.trim(),
      includeAmenities: localPackageIncludeAmenities,
      minRooms: toNumber(localPackageMinRooms, packageMinRooms)
    });
  }

  async function exportBackupFile() {
    setBackupStatus("busy");
    setBackupMessage("Собираю резервную копию...");

    try {
      const [server, local] = await Promise.all([
        exportServerBackupData(backupOptions),
        exportLocalBackupData(backupOptions)
      ]);
      const backup = {
        exportedAt: new Date().toISOString(),
        exportOptions: backupOptions,
        kind: "gpb-whatsapp-booking-backup",
        local,
        server,
        version: 1
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `gpb-backup-${formatDateInput(new Date())}.gpbbackup`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupStatus("idle");
      setBackupMessage("Файл создан. Его можно отправить себе в WhatsApp и импортировать на другом компьютере.");
    } catch (error) {
      setBackupStatus("error");
      setBackupMessage(formatBackupError(error, "Не удалось создать резервную копию"));
    }
  }

  function openBackupImport() {
    backupInputRef.current?.click();
  }

  async function importBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBackupStatus("busy");
    setBackupMessage("Импортирую без перезаписи существующих данных...");

    try {
      const content = await file.text();
      const backup = JSON.parse(content) as Record<string, unknown>;
      if (backup.kind !== "gpb-whatsapp-booking-backup" || typeof backup.server !== "object" || typeof backup.local !== "object") {
        throw new Error("Это не файл резервной копии GPB");
      }

      const serverReport = await importServerBackupData(backup.server as Record<string, unknown>);
      const localReport = await importLocalBackupData(backup.local as Record<string, unknown>);
      setBackupStatus("idle");
      setBackupMessage(`Импорт готов. Сервер: ${formatBackupReport(serverReport)}. Локально: ${formatBackupReport(localReport)}.`);
    } catch (error) {
      setBackupStatus("error");
      setBackupMessage(formatBackupError(error, "Не удалось импортировать резервную копию"));
    }
  }

  function toggleBackupOption(option: keyof BackupExportOptions) {
    setBackupOptions((current) => ({
      ...current,
      [option]: !current[option]
    }));
  }

  return (
    <div className="gpb-modal-backdrop">
      <div className="gpb-catalog-modal gpb-settings-modal" role="dialog" aria-modal="true" aria-label="Настройки">
        <header className="gpb-catalog-header">
          <div>
            <strong>Настройки</strong>
            <span>Оплата, стандартное время заезда и другие рабочие параметры.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={20} />
          </button>
        </header>

        <main className="gpb-settings-body">
          <nav className="gpb-settings-nav" aria-label="Разделы настроек">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  className={activeSettingsSection === section.id ? "is-active" : ""}
                  type="button"
                  onClick={() => setActiveSettingsSection(section.id)}
                >
                  <Icon size={17} />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="gpb-settings-content">
          <div className="gpb-settings-column gpb-settings-links-column">
            <section className={`gpb-settings-panel ${activeSettingsSection === "payment" ? "" : "is-hidden"}`}>
              <div className="gpb-editor-title">
                <Banknote size={20} />
                <h2>Способы оплаты</h2>
              </div>
              <div className="gpb-payment-method-list gpb-settings-input-grid">
                {paymentMethodList.map((method) => (
                  <label className={`gpb-payment-method-row ${!PAYMENT_METHODS.some((item) => item.id === method.id) ? "has-actions" : ""}`} key={method.id}>
                    <span>{method.label}</span>
                    <input
                      placeholder={`Ссылка или реквизиты ${method.label}`}
                      value={paymentMethods[method.id] ?? ""}
                      onChange={(event) => onPaymentMethodChange(method.id, event.target.value)}
                    />
                    {!PAYMENT_METHODS.some((item) => item.id === method.id) ? (
                      <button type="button" onClick={() => onPaymentMethodDelete(method.id)} title="Удалить поле">
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </label>
                ))}
              </div>
              <div className="gpb-settings-panel-actions">
                <button className="gpb-settings-add-button" type="button" onClick={addPaymentMethodField}>
                  <Plus size={16} />
                  Добавить
                </button>
                <button className="gpb-primary" type="button" onClick={onPaymentSettingsSave}>Сохранить</button>
              </div>
            </section>

            <section className={`gpb-settings-panel ${activeSettingsSection === "company" ? "" : "is-hidden"}`}>
              <div className="gpb-editor-title">
                <Hotel size={20} />
                <h2>Моя компания</h2>
              </div>
              <p className="gpb-settings-note">Реквизиты вашей компании для счета на оплату по перечислению.</p>
              <div className="gpb-payment-method-list gpb-settings-input-grid">
                {companyRequisiteList.map((field) => (
                  <label className={`gpb-payment-method-row ${!COMPANY_REQUISITE_FIELDS.some((item) => item.id === field.id) ? "has-actions" : ""}`} key={field.id}>
                    <span>{field.label}</span>
                    <input
                      placeholder={field.label}
                      value={companyRequisites[field.id] ?? ""}
                      onChange={(event) => onCompanyRequisiteChange(field.id, event.target.value)}
                    />
                    {!COMPANY_REQUISITE_FIELDS.some((item) => item.id === field.id) ? (
                      <button type="button" onClick={() => onCompanyRequisiteDelete(field.id)} title="Удалить поле">
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </label>
                ))}
              </div>
              <div className="gpb-settings-panel-actions">
                <button className="gpb-settings-add-button" type="button" onClick={addCompanyRequisiteField}>
                  <Plus size={16} />
                  Добавить
                </button>
                <button className="gpb-primary" type="button" onClick={onCompanyRequisitesSave}>Сохранить</button>
              </div>
            </section>

            <section className={`gpb-settings-panel ${activeSettingsSection === "links" ? "" : "is-hidden"}`}>
              <div className="gpb-editor-title">
                <Send size={20} />
                <h2>Ссылки для клиентов</h2>
              </div>
              <div className="gpb-payment-method-list gpb-settings-input-grid">
                {linkMethodList.map((method) => (
                  <label className={`gpb-payment-method-row ${!LINK_METHODS.some((item) => item.id === method.id) ? "has-actions" : ""}`} key={method.id}>
                    <span>{method.label}</span>
                    <input
                      placeholder={getLinkMethodPlaceholder(method)}
                      value={linkMethods[method.id] ?? ""}
                      onChange={(event) => onLinkMethodChange(method.id, event.target.value)}
                    />
                    {!LINK_METHODS.some((item) => item.id === method.id) ? (
                      <button type="button" onClick={() => onLinkMethodDelete(method.id)} title="Удалить поле">
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </label>
                ))}
              </div>
              <div className="gpb-settings-panel-actions">
                <button className="gpb-settings-add-button" type="button" onClick={addLinkMethodField}>
                  <Plus size={16} />
                  Добавить
                </button>
                <button className="gpb-primary" type="button" onClick={onLinkSettingsSave}>Сохранить</button>
              </div>
            </section>

            <section className={`gpb-settings-panel ${activeSettingsSection === "gallery" ? "" : "is-hidden"}`}>
              <div className="gpb-editor-title">
                <Image size={20} />
                <h2>Галерея объекта</h2>
              </div>
              <p className="gpb-settings-note">Фото территории, здания и преимуществ. Кнопка «Объект» отправляет эту галерею клиенту.</p>
              <input
                ref={objectGalleryPhotoInputRef}
                accept="image/*,.heic,.heif"
                hidden
                multiple
                type="file"
                onChange={(event) => {
                  onObjectGalleryUpload(event.target.files);
                  event.target.value = "";
                }}
              />
              <input
                ref={objectGalleryVideoInputRef}
                accept="video/*"
                hidden
                multiple
                type="file"
                onChange={(event) => {
                  onObjectGalleryUpload(event.target.files);
                  event.target.value = "";
                }}
              />
              {objectGalleryPhotoPaths.length || objectGalleryVideoPaths.length || objectGalleryUploadState.status === "uploading" ? (
                <div className="gpb-object-gallery-settings-grid">
                  {objectGalleryUploadState.status === "uploading" ? (
                    <div className="gpb-object-gallery-settings-item gpb-object-gallery-upload-card">
                      <div className="gpb-upload-spinner" aria-hidden="true" />
                      <strong>Обработка</strong>
                      <span>{objectGalleryUploadState.message}</span>
                    </div>
                  ) : null}
                  {objectGalleryPhotoPaths.map((path, index) => (
                    <div className="gpb-object-gallery-settings-item" key={path}>
                      <MediaImage alt={`Фото объекта ${index + 1}`} path={path} />
                      <button type="button" onClick={() => onObjectGalleryDelete(path)} title="Удалить фото">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {objectGalleryVideoPaths.map((path, index) => (
                    <div className="gpb-object-gallery-settings-item is-video" key={path}>
                      <MediaVideo path={path} />
                      <span>Видео {index + 1}</span>
                      <button type="button" onClick={() => onObjectGalleryDelete(path)} title="Удалить видео">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="gpb-settings-note">Галерея пока пустая.</p>
              )}
              {objectGalleryUploadState.status === "error" ? (
                <div className="gpb-settings-upload-error">{objectGalleryUploadState.message}</div>
              ) : null}
              <div className="gpb-settings-panel-actions gpb-settings-gallery-actions">
                <button className="gpb-settings-add-button" type="button" onClick={() => objectGalleryPhotoInputRef.current?.click()} disabled={objectGalleryUploadState.status === "uploading"}>
                  <Image size={16} />
                  Добавить фото
                </button>
                <button className="gpb-settings-add-button" type="button" onClick={() => objectGalleryVideoInputRef.current?.click()} disabled={objectGalleryUploadState.status === "uploading"}>
                  <Video size={16} />
                  Добавить видео
                </button>
                <button className="gpb-primary" type="button" onClick={onObjectGallerySave} disabled={objectGalleryUploadState.status === "uploading"}>Сохранить</button>
              </div>
            </section>

            <section className={`gpb-settings-panel ${activeSettingsSection === "menu" ? "" : "is-hidden"}`}>
              <div className="gpb-editor-title">
                <Utensils size={20} />
                <h2>Меню</h2>
              </div>
              <p className="gpb-settings-note">Блюда для допродаж и PDF-меню. Укажите название, фото, цену, время приготовления и состав.</p>
              <div className="gpb-menu-bulk-price">
                <span>Пакетное изменение цен</span>
                <div className="gpb-menu-bulk-controls">
                  <button type="button" onClick={() => setMenuBulkPricePercent((current) => clampNumber(current - 1, -100, 500))}>-</button>
                  <input
                    inputMode="numeric"
                    value={`${menuBulkPricePercent}%`}
                    onChange={(event) => setMenuBulkPricePercent(clampNumber(toNumber(event.target.value.replace(/[^\d-]/g, ""), 0), -100, 500))}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button type="button" onClick={() => setMenuBulkPricePercent((current) => clampNumber(current + 1, -100, 500))}>+</button>
                </div>
                <button className="gpb-primary" type="button" onClick={() => onMenuItemsBulkPriceChange(menuBulkPricePercent)} disabled={!menuItems.length || menuBulkPricePercent === 0}>
                  Применить
                </button>
              </div>
              {menuItems.length ? (
                <div className="gpb-menu-settings-list">
                  {menuItems.map((item) => (
                    <div className="gpb-menu-settings-card" key={item.id}>
                      <div className="gpb-menu-settings-photo">
                        {item.photoPath ? (
                          <MediaImage alt={item.title || "Блюдо"} path={item.photoPath} />
                        ) : (
                          <span>Фото</span>
                        )}
                        {menuUploadItemId === item.id ? <em>Загрузка...</em> : null}
                      </div>
                      <label>
                        Название блюда
                        <input value={item.title} onChange={(event) => onMenuItemChange(item.id, { title: event.target.value })} />
                      </label>
                      <label>
                        Цена
                        <input inputMode="numeric" value={formatExpenseAmountInput(String(item.price || ""))} onChange={(event) => onMenuItemChange(item.id, { price: parsePriceInput(event.target.value) })} />
                      </label>
                      <label>
                        Время пр-ния
                        <input placeholder="Например: 25 минут" value={item.cookingTime} onChange={(event) => onMenuItemChange(item.id, { cookingTime: event.target.value })} />
                      </label>
                      <label className="gpb-menu-composition-field">
                        Состав
                        <textarea value={item.composition} onChange={(event) => onMenuItemChange(item.id, { composition: event.target.value })} />
                      </label>
                      <div className="gpb-menu-settings-actions">
                        <label className="gpb-settings-add-button">
                          <Image size={15} />
                          Фото
                          <input
                            accept="image/*,.heic,.heif"
                            hidden
                            type="file"
                            onChange={(event) => {
                              onMenuItemPhotoUpload(item.id, event.target.files);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <button className="gpb-secondary" type="button" onClick={() => onMenuItemDelete(item.id)}>
                          <Trash2 size={15} />
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="gpb-settings-note">Меню пока пустое.</p>
              )}
              <div className="gpb-settings-panel-actions gpb-menu-panel-actions">
                <button className="gpb-settings-add-button" type="button" onClick={onMenuItemCreate}>
                  <Plus size={16} />
                  Добавить блюдо
                </button>
                <button className="gpb-primary" type="button" onClick={onMenuItemsSave}>Сохранить</button>
              </div>
            </section>
          </div>

          <div className="gpb-settings-column gpb-settings-controls-column">
            <div className="gpb-settings-stack">
              <section className={`gpb-settings-panel ${activeSettingsSection === "package" ? "" : "is-hidden"}`}>
                <div className="gpb-editor-title">
                  <Hotel size={20} />
                  <h2>Пакетное предложение</h2>
                </div>
                <div className="gpb-default-time-settings gpb-package-settings-grid">
                  <label>
                    Скидка при аренде всех номеров, %
                    <input min="0" max="100" type="number" value={localPackageDiscount} onChange={(event) => setLocalPackageDiscount(event.target.value)} />
                  </label>
                  <label>
                    Минимум номеров
                    <input min="0" type="number" value={localPackageMinRooms} onChange={(event) => setLocalPackageMinRooms(event.target.value)} />
                  </label>
                  <label>
                    Скидка на дату / период, %
                    <input min="0" max="100" type="number" value={localPackagePeriodDiscount} onChange={(event) => setLocalPackagePeriodDiscount(event.target.value)} />
                  </label>
                  <label>
                    Начало периода
                    <input type="date" value={localPackagePeriodFrom} onChange={(event) => setLocalPackagePeriodFrom(event.target.value)} />
                  </label>
                  <label>
                    Конец периода
                    <input type="date" value={localPackagePeriodTo} onChange={(event) => setLocalPackagePeriodTo(event.target.value)} />
                  </label>
                  <label>
                    Завтрак, тг / место
                    <input min="0" inputMode="numeric" value={localBreakfastPrice} onChange={(event) => setLocalBreakfastPrice(String(parsePriceInput(event.target.value)))} />
                  </label>
                  <label>
                    Расчет с завтраком
                    <input readOnly value="Цена номера" />
                  </label>
                  <label>
                    Расчет без завтрака
                    <input readOnly value={toNumber(localBreakfastPrice, 0) > 0 ? `Минус ${formatPrice(toNumber(localBreakfastPrice, 0))} за место` : "Без изменения"} />
                  </label>
                </div>
                <label className="gpb-checkbox-row">
                  <input type="checkbox" checked={localPackageIncludeAmenities} onChange={(event) => setLocalPackageIncludeAmenities(event.target.checked)} />
                  <span>Включать сауну, беседку, мангал и территорию в PDF</span>
                </label>
                <label className="gpb-wide-label">
                  Подарок / условие
                  <textarea
                    placeholder="Например: при аренде всех номеров сауна 2 часа в подарок"
                    value={localPackageGift}
                    onChange={(event) => setLocalPackageGift(event.target.value)}
                  />
                </label>
                <EditableSettingsFields
                  fields={packageCustomFields}
                  onChange={onPackageCustomFieldChange}
                  onDelete={onPackageCustomFieldDelete}
                />
                <div className="gpb-settings-panel-actions">
                  <button className="gpb-settings-add-button" type="button" onClick={addPackageField}>
                    <Plus size={16} />
                    Добавить
                  </button>
                  <button className="gpb-primary" type="button" onClick={savePackageSettings}>Сохранить</button>
                </div>
              </section>

              <section className={`gpb-settings-panel ${activeSettingsSection === "weather" ? "" : "is-hidden"}`}>
                <div className="gpb-editor-title">
                  <CloudSun size={20} />
                  <h2>Погода</h2>
                </div>
                <div className="gpb-weather-settings-grid">
                  <label>
                    Регион
                    <select value={localWeatherName} onChange={(event) => handleWeatherLocationSelect(event.target.value)}>
                      {WEATHER_LOCATIONS.map((location) => (
                        <option key={location.name} value={location.name}>{location.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Широта
                    <input inputMode="decimal" value={localWeatherLatitude} onChange={(event) => setLocalWeatherLatitude(event.target.value)} />
                  </label>
                  <label>
                    Долгота
                    <input inputMode="decimal" value={localWeatherLongitude} onChange={(event) => setLocalWeatherLongitude(event.target.value)} />
                  </label>
                  <button type="button" onClick={saveWeatherSettings}>Сохранить погоду</button>
                </div>
              </section>
            </div>

            <div className="gpb-settings-stack">
              <section className={`gpb-settings-panel ${activeSettingsSection === "inventory" ? "" : "is-hidden"}`}>
                <div className="gpb-editor-title">
                  <BedDouble size={20} />
                  <h2>Доп. инвентарь</h2>
                </div>
                <div className="gpb-default-time-settings">
                  <label>
                    Надувные матрасы
                    <input min="0" type="number" value={localAirBeds} onChange={(event) => setLocalAirBeds(event.target.value)} />
                  </label>
                  <label>
                    Раскладушки
                    <input min="0" type="number" value={localRollaways} onChange={(event) => setLocalRollaways(event.target.value)} />
                  </label>
                </div>
                <EditableSettingsFields
                  fields={inventoryCustomFields}
                  onChange={onInventoryCustomFieldChange}
                  onDelete={onInventoryCustomFieldDelete}
                />
                <div className="gpb-settings-panel-actions">
                  <button className="gpb-settings-add-button" type="button" onClick={addInventoryField}>
                    <Plus size={16} />
                    Создать новое поле
                  </button>
                  <button className="gpb-primary" type="button" onClick={saveInventorySettings}>Сохранить инвентарь</button>
                </div>
              </section>

              <section className={`gpb-settings-panel ${activeSettingsSection === "weather" ? "" : "is-hidden"}`}>
                <div className="gpb-editor-title">
                  <CalendarDays size={20} />
                  <h2>Время по умолчанию</h2>
                </div>
                <div className="gpb-default-time-settings">
                  <label>
                    Время заезда
                    <input type="time" value={defaultCheckInTime} onChange={(event) => onDefaultCheckInTimeChange(event.target.value)} />
                  </label>
                  <div className="gpb-fixed-checkout-time">
                    <span>Выезд</span>
                    <strong>{DEFAULT_CHECK_OUT_TIME}</strong>
                  </div>
                </div>
              </section>

              <section className={`gpb-settings-panel ${activeSettingsSection === "backup" ? "" : "is-hidden"}`}>
                <div className="gpb-editor-title">
                  <Download size={20} />
                  <h2>Резервная копия</h2>
                </div>
                <p className="gpb-settings-note">Экспорт сохраняет каталог, гостей, брони, настройки, расходы и фото/видео. Импорт добавляет только отсутствующее.</p>
                <div className="gpb-backup-option-grid">
                  <BackupOption checked={backupOptions.rooms} label="Каталог номеров и объектов" onChange={() => toggleBackupOption("rooms")} />
                  <BackupOption checked={backupOptions.media} label="Фото и видео" onChange={() => toggleBackupOption("media")} />
                  <BackupOption checked={backupOptions.guestContacts} label="База гостей" onChange={() => toggleBackupOption("guestContacts")} />
                  <BackupOption checked={backupOptions.reservations} label="Брони, календарь и аналитика" onChange={() => toggleBackupOption("reservations")} />
                  <BackupOption checked={backupOptions.chatDrafts} label="Состояния по чатам" onChange={() => toggleBackupOption("chatDrafts")} />
                  <BackupOption checked={backupOptions.paymentSettings} label="Настройки, ссылки и праздники" onChange={() => toggleBackupOption("paymentSettings")} />
                  <BackupOption checked={backupOptions.expenses} label="Расходы и категории" onChange={() => toggleBackupOption("expenses")} />
                  <BackupOption checked={backupOptions.localRoomsCache} label="Локальный кэш каталога" onChange={() => toggleBackupOption("localRoomsCache")} />
                </div>
                <div className="gpb-backup-actions">
                  <button className="gpb-primary" type="button" disabled={backupStatus === "busy"} onClick={exportBackupFile}>Экспорт</button>
                  <button className="gpb-settings-add-button" type="button" disabled={backupStatus === "busy"} onClick={openBackupImport}>Импорт</button>
                </div>
                <input ref={backupInputRef} accept=".gpbbackup,application/json" hidden type="file" onChange={importBackupFile} />
                {backupMessage ? (
                  <div className={`gpb-backup-status ${backupStatus === "error" ? "is-error" : ""}`}>{backupMessage}</div>
                ) : null}
              </section>

              <section className={`gpb-settings-panel ${activeSettingsSection === "service" ? "" : "is-hidden"}`}>
                <div className="gpb-editor-title">
                  <Settings size={20} />
                  <h2>Сервис</h2>
                </div>
                <label className="gpb-wide-label">
                  Пароль очистки
                  <input
                    type="password"
                    value={servicePassword}
                    onChange={(event) => onServicePasswordChange(event.target.value)}
                    placeholder="0000"
                  />
                </label>
                <p className="gpb-settings-note">Используется для очистки полей в базе гостей.</p>
              </section>
            </div>
          </div>
          </div>
        </main>
        {customFieldRequest ? (
          <CreateCustomFieldOverlay
            placeholder={customFieldRequest.placeholder}
            title={customFieldRequest.title}
            onClose={() => setCustomFieldRequest(null)}
            onCreate={handleCreateCustomField}
          />
        ) : null}
      </div>
    </div>
  );
}

function BackupOption({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="gpb-backup-option">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function formatBackupError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/extension context invalidated/i.test(message)) {
    return "Расширение было обновлено или перезагружено. Обнови вкладку WhatsApp Web и повтори экспорт/импорт.";
  }
  return message || fallback;
}

function formatBackupReport(report: Record<string, unknown>) {
  const totals = Object.values(report).reduce(
    (sum, value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return sum;
      const item = value as Record<string, unknown>;
      sum.imported += typeof item.imported === "number" ? item.imported : 0;
      sum.skipped += typeof item.skipped === "number" ? item.skipped : 0;
      sum.conflicts += typeof item.conflicts === "number" ? item.conflicts : 0;
      return sum;
    },
    { conflicts: 0, imported: 0, skipped: 0 }
  );

  return `добавлено ${totals.imported}, пропущено ${totals.skipped}, конфликтов ${totals.conflicts}`;
}

function CreateCustomFieldOverlay({
  placeholder,
  title,
  onClose,
  onCreate
}: {
  placeholder: string;
  title: string;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    onCreate(cleanName);
  }

  return (
    <div className="gpb-create-backdrop gpb-settings-field-backdrop">
      <form className="gpb-create-modal gpb-settings-field-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label={title}>
        <header className="gpb-create-header">
          <div>
            <strong>{title}</strong>
            <span>Введите название нового поля</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-create-form">
          <label className="gpb-wide-label">
            Название
            <input autoFocus placeholder={placeholder} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
        </div>
        <footer className="gpb-create-footer">
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button className="gpb-primary" type="submit" disabled={!name.trim()}>Создать</button>
        </footer>
      </form>
    </div>
  );
}

function EditableSettingsFields({
  fields,
  onChange,
  onDelete
}: {
  fields: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  onDelete: (fieldId: string) => void;
}) {
  const entries = Object.entries(fields);
  if (!entries.length) return null;

  return (
    <div className="gpb-custom-settings-fields">
      {entries.map(([fieldId, value]) => (
        <label className="gpb-payment-method-row has-actions" key={fieldId}>
          <span>{fieldId}</span>
          <input
            placeholder="Значение"
            value={value}
            onChange={(event) => onChange(fieldId, event.target.value)}
          />
          <div className="gpb-settings-row-actions">
            <button type="button" onClick={() => onDelete(fieldId)} title="Удалить поле">
              <Trash2 size={15} />
            </button>
          </div>
        </label>
      ))}
    </div>
  );
}

function ReservationsModal({
  reservations,
  rooms,
  onCancelReservation,
  onDeleteReservation,
  onMarkBalancePaid,
  onMarkCheckedIn,
  onUpdateReservation,
  onClose
}: {
  reservations: Reservation[];
  rooms: Room[];
  onCancelReservation: (reservation: Reservation) => void;
  onDeleteReservation: (reservation: Reservation) => void;
  onMarkBalancePaid: (reservation: Reservation) => void;
  onMarkCheckedIn: (reservation: Reservation) => void;
  onUpdateReservation: (reservation: Reservation) => Promise<void>;
  onClose: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<"booked" | "pending" | "cancelled" | "all">("booked");
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
  const [monthDate, setMonthDate] = useState(() => getMonthInputValue(new Date()));
  const [search, setSearch] = useState("");
  const [adminCopyState, setAdminCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [cookCopyState, setCookCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [deleteTarget, setDeleteTarget] = useState<Reservation | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [timelineLayers, setTimelineLayers] = useState({
    checkIn: true,
    cleaning: true,
    lodging: true,
    repair: true
  });
  const allTimelineLayersEnabled = Object.values(timelineLayers).every(Boolean);
  const timelineDays = useMemo(() => getMonthTimelineDays(monthDate), [monthDate]);
  const timelineRooms = useMemo(() => rooms
    .filter((room) => room.bookable && !room.hideInBookingPanel)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.number.localeCompare(right.number, "ru", { numeric: true })), [rooms]);
  const filteredCalendarReservations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return reservations
      .filter((reservation) => statusFilter === "all" || reservation.status === statusFilter)
      .filter((reservation) => {
        if (!normalizedSearch) return true;
        const roomText = reservation.roomIds
          .map((roomId) => rooms.find((room) => room.id === roomId))
          .filter((room): room is Room => Boolean(room))
          .map((room) => `${room.number} ${room.title}`)
          .join(" ")
          .toLowerCase();
        return `${reservation.guestFirstName} ${reservation.phone} ${roomText}`.toLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => left.checkIn.localeCompare(right.checkIn));
  }, [reservations, rooms, search, statusFilter]);

  const visibleReservations = useMemo(() => filteredCalendarReservations
    .filter((reservation) => !selectedDate || isReservationRelevantForCalendarDate(reservation, selectedDate))
    .sort((left, right) => left.checkIn.localeCompare(right.checkIn)), [filteredCalendarReservations, selectedDate]);

  async function handleCopyAdminBookings() {
    try {
      await navigator.clipboard.writeText(buildAdminBookingsExport(visibleReservations, rooms, selectedDate, reservations));
      setAdminCopyState("copied");
    } catch {
      setAdminCopyState("error");
    }
    window.setTimeout(() => setAdminCopyState("idle"), 2200);
  }

  async function handleCopyCookBookings() {
    try {
      await navigator.clipboard.writeText(buildCookBreakfastExport(selectedDate, reservations));
      setCookCopyState("copied");
    } catch {
      setCookCopyState("error");
    }
    window.setTimeout(() => setCookCopyState("idle"), 2200);
  }

  async function handleSaveEditedReservation(reservation: Reservation) {
    await onUpdateReservation(reservation);
    setEditingReservation(null);
  }

  async function handleConfirmDeleteReservation() {
    if (!deleteTarget) return;
    await onDeleteReservation(deleteTarget);
    setDeleteTarget(null);
  }

  return (
    <div className="gpb-modal-backdrop">
      <div className="gpb-catalog-modal gpb-reservations-modal" role="dialog" aria-modal="true" aria-label="Брони">
        <header className="gpb-catalog-header">
          <div>
            <strong>Брони</strong>
            <span>Календарь занятости, фильтры и управление бронями.</span>
          </div>
          <div className="gpb-catalog-header-actions">
            <button type="button" onClick={handleCopyAdminBookings} title="Скопировать брони для администратора">
              <Download size={17} />
              <span>{adminCopyState === "copied" ? "Скопировано" : adminCopyState === "error" ? "Ошибка" : "Копировать админу"}</span>
            </button>
            <button type="button" onClick={handleCopyCookBookings} title="Скопировать завтраки для повара">
              <Utensils size={17} />
              <span>{cookCopyState === "copied" ? "Скопировано" : cookCopyState === "error" ? "Ошибка" : "Копировать повару"}</span>
            </button>
            <button type="button" onClick={onClose} title="Закрыть" className="gpb-icon-only-button">
              <X size={20} />
            </button>
          </div>
        </header>

        <main className="gpb-reservations-body">
          <section className="gpb-reservation-filters">
            <label>
              Месяц
              <input type="month" value={monthDate} onChange={(event) => setMonthDate(event.target.value)} />
            </label>
            <label>
              Дата
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <label>
              Статус
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="booked">Подтвержденные</option>
                <option value="pending">Согласования</option>
                <option value="cancelled">Отмененные</option>
                <option value="all">Все</option>
              </select>
            </label>
            <label>
              Поиск
              <input placeholder="Имя, телефон, номер" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <div className="gpb-reservation-layer-toggles" aria-label="Что показывать в календаре">
              <button
                className={allTimelineLayersEnabled ? "is-active" : ""}
                type="button"
                onClick={() => {
                  const nextValue = !allTimelineLayersEnabled;
                  setTimelineLayers({ checkIn: nextValue, cleaning: nextValue, lodging: nextValue, repair: nextValue });
                }}
              >
                <Check size={14} />
                <span>Все</span>
              </button>
              {[
                ["lodging", "Проживание", "#8e98a3"],
                ["checkIn", "Заезд", "#138a63"],
                ["cleaning", "Уборка", "#7c3aed"],
                ["repair", "Ремонт", "#d12b2b"]
              ].map(([key, label, color]) => (
                <label key={key}>
                  <input
                    checked={timelineLayers[key as keyof typeof timelineLayers]}
                    type="checkbox"
                    onChange={(event) => setTimelineLayers((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <i style={{ backgroundColor: color }} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="gpb-reservations-layout">
            <ReservationTimelineBoard
              reservations={filteredCalendarReservations}
              rooms={timelineRooms}
              selectedDate={selectedDate}
              timelineLayers={timelineLayers}
              timelineDays={timelineDays}
              onSelectDate={setSelectedDate}
            />

            <div className="gpb-reservation-list-panel">
              <h2>{selectedDate ? `Брони на ${selectedDate}` : "Брони"}</h2>
              {visibleReservations.length ? (
                <div className="gpb-reservation-card-list">
                  {visibleReservations.map((reservation) => (
                    <ReservationCard
                      key={reservation.id}
                      reservation={reservation}
                      rooms={rooms}
                      onCancel={() => onCancelReservation(reservation)}
                      onDelete={() => setDeleteTarget(reservation)}
                      onEdit={() => setEditingReservation(reservation)}
                      onMarkBalancePaid={() => onMarkBalancePaid(reservation)}
                      onMarkCheckedIn={() => onMarkCheckedIn(reservation)}
                    />
                  ))}
                </div>
              ) : (
                <div className="gpb-empty-state">По выбранным фильтрам броней нет.</div>
              )}
            </div>
          </section>
        </main>
        {editingReservation ? (
          <EditReservationModal
            reservation={editingReservation}
            rooms={rooms}
            onClose={() => setEditingReservation(null)}
            onSave={handleSaveEditedReservation}
          />
        ) : null}
        {deleteTarget ? (
          <ConfirmActionModal
            title="Удалить бронь?"
            description={`${deleteTarget.guestFirstName || "Гость"} · удаление без восстановления`}
            confirmLabel="Удалить"
            tone="danger"
            onClose={() => setDeleteTarget(null)}
            onConfirm={() => void handleConfirmDeleteReservation()}
          />
        ) : null}
      </div>
    </div>
  );
}

function ReservationTimelineBoard({
  reservations,
  rooms,
  selectedDate,
  timelineLayers,
  timelineDays,
  onSelectDate
}: {
  reservations: Reservation[];
  rooms: Room[];
  selectedDate: string;
  timelineLayers: { checkIn: boolean; cleaning: boolean; lodging: boolean; repair: boolean };
  timelineDays: Array<{ date: string; dayNumber: number; weekday: string; isWeekend: boolean }>;
  onSelectDate: (date: string) => void;
}) {
  return (
    <div className="gpb-reservation-timeline-board" style={{ "--gpb-timeline-days": timelineDays.length } as React.CSSProperties}>
      <div className="gpb-reservation-timeline-header">
        <div className="gpb-timeline-room-header">Номер</div>
        {timelineDays.map((day) => (
          <button
            className={[
              "gpb-timeline-day-header",
              day.isWeekend ? "is-weekend" : "",
              day.date === selectedDate ? "is-selected" : ""
            ].filter(Boolean).join(" ")}
            key={day.date}
            type="button"
            onClick={() => onSelectDate(day.date)}
          >
            <strong>{day.dayNumber}</strong>
            <span>{day.weekday}</span>
          </button>
        ))}
      </div>
      <div className="gpb-reservation-timeline-rows">
        {rooms.map((room) => (
          <ReservationTimelineRoomRow
            key={room.id}
            reservations={reservations}
            room={room}
            selectedDate={selectedDate}
            timelineLayers={timelineLayers}
            timelineDays={timelineDays}
            onSelectDate={onSelectDate}
          />
        ))}
      </div>
    </div>
  );
}

function ReservationTimelineRoomRow({
  reservations,
  room,
  selectedDate,
  timelineLayers,
  timelineDays,
  onSelectDate
}: {
  reservations: Reservation[];
  room: Room;
  selectedDate: string;
  timelineLayers: { checkIn: boolean; cleaning: boolean; lodging: boolean; repair: boolean };
  timelineDays: Array<{ date: string; dayNumber: number; weekday: string; isWeekend: boolean }>;
  onSelectDate: (date: string) => void;
}) {
  const segments = buildReservationTimelineSegments(room, reservations, timelineDays);
  const cleaningSegments = buildCleaningTimelineSegments(room, reservations, timelineDays);
  const rowLaneCount = Math.max(1, ...segments.map((segment) => segment.lane + 1), room.status === "repair" ? 1 : 0);

  return (
    <div className="gpb-reservation-timeline-row" style={{ "--gpb-timeline-lanes": rowLaneCount } as React.CSSProperties}>
      <div className="gpb-timeline-room-cell">
        <strong>{room.number || room.title}</strong>
        <span>{room.title}</span>
      </div>
      {timelineDays.map((day, index) => (
        <button
          className={[
            "gpb-timeline-date-cell",
            day.isWeekend ? "is-weekend" : "",
            day.date === selectedDate ? "is-selected" : ""
          ].filter(Boolean).join(" ")}
          key={day.date}
          style={{ gridColumn: index + 2 }}
          type="button"
          onClick={() => onSelectDate(day.date)}
        />
      ))}
      {timelineLayers.repair && room.status === "repair" ? (
        <div
          className="gpb-timeline-status-bar is-repair"
          style={{ gridColumn: `2 / ${timelineDays.length + 2}`, "--gpb-timeline-lane": 0 } as React.CSSProperties}
          title={`${room.number || room.title}: на ремонте`}
        >
          Ремонт
        </div>
      ) : null}
      {timelineLayers.lodging ? segments.map((segment) => (
        <div
          className="gpb-timeline-reservation-bar"
          key={`${segment.reservation.id}-${segment.roomId}`}
          style={{ gridColumn: `${segment.startIndex + 2} / ${segment.endIndex + 3}`, "--gpb-timeline-lane": segment.lane } as React.CSSProperties}
          title={`${segment.reservation.guestFirstName || "Гость"} · ${formatReservationDateRange(segment.reservation)} · ${room.number || room.title}`}
        >
          <span>{segment.reservation.guestFirstName || "Гость"}</span>
        </div>
      )) : null}
      {timelineLayers.checkIn ? segments.map((segment) => (
        <div
          className="gpb-timeline-checkin-marker"
          key={`${segment.reservation.id}-${segment.roomId}-checkin`}
          style={{ gridColumn: segment.startIndex + 2, "--gpb-timeline-lane": segment.lane } as React.CSSProperties}
          title={`Заезд: ${segment.reservation.guestFirstName || "Гость"}`}
        />
      )) : null}
      {timelineLayers.cleaning ? cleaningSegments.map((segment) => (
        <div
          className="gpb-timeline-status-bar is-cleaning"
          key={`${segment.reservation.id}-${segment.roomId}-cleaning`}
          style={{ gridColumn: `${segment.dayIndex + 2} / ${segment.dayIndex + 3}`, "--gpb-timeline-lane": segment.lane } as React.CSSProperties}
          title={`Уборка после ${segment.reservation.guestFirstName || "гостя"}`}
        >
          Уборка
        </div>
      )) : null}
    </div>
  );
}

function ReservationCard({
  reservation,
  rooms,
  onCancel,
  onDelete,
  onEdit,
  onMarkBalancePaid,
  onMarkCheckedIn
}: {
  reservation: Reservation;
  rooms: Room[];
  onCancel: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMarkBalancePaid: () => void;
  onMarkCheckedIn: () => void;
}) {
  const bookedRooms = reservation.roomIds
    .map((roomId) => rooms.find((room) => room.id === roomId))
    .filter((room): room is Room => Boolean(room));
  const extraInventoryText = formatReservationExtraInventory(reservation);
  const includedText = getAdminIncludedText(bookedRooms, reservation);
  const balance = getReservationBalance(reservation);

  return (
    <article className="gpb-reservation-card">
      <div className="gpb-reservation-row-values">
        <strong>{reservation.guestFirstName || "Гость"}</strong>
        <span>{formatReservationPhone(reservation.phone)}</span>
        <span>{formatReservationDateRange(reservation)}</span>
        <span>{formatReservationRowRooms(bookedRooms)}</span>
        <span>{formatReservationGuestCountText(reservation).replace("Гости: ", "")}</span>
        <span>{includedText}</span>
        <b>{formatPrice(reservation.total)}</b>
        <span className={reservation.prepaymentReceivedAt ? "is-done" : "is-muted"}>Пред. {formatPrice(reservation.prepayment)}</span>
        <span className={reservation.balancePaidAt ? "is-done" : balance > 0 ? "" : "is-muted"}>Ост. {formatReservationPaymentAmount(balance)}</span>
        {extraInventoryText ? <span>{extraInventoryText}</span> : null}
        {reservation.checkedInAt ? <span className="is-done">Въезд</span> : null}
        {reservation.checkedOutAt ? <span className="is-done">Выезд</span> : null}
        {reservation.adminComment?.trim() ? <span>{reservation.adminComment.trim()}</span> : null}
      </div>
      <div className="gpb-reservation-card-actions">
        <button type="button" onClick={onMarkBalancePaid} disabled={!canMarkBalancePaid(reservation)}>
          {reservation.balancePaidAt ? "Доплата +" : "Принять доплату"}
        </button>
        <button type="button" onClick={onMarkCheckedIn} disabled={!canMarkCheckedIn(reservation)}>
          {reservation.checkedInAt ? "Въезд +" : "Отметить въезд"}
        </button>
        <button type="button" onClick={onCancel} disabled={reservation.status === "cancelled" || Boolean(reservation.balancePaidAt && reservation.checkedInAt)}>
          Снять
        </button>
        <button className="gpb-icon-only-button" type="button" onClick={onEdit} title="Редактировать">
          <Pencil size={15} />
        </button>
        <button className="gpb-icon-only-button is-danger" type="button" onClick={onDelete} title="Удалить">
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function AnalyticsModal({
  guestContacts,
  reservations,
  rooms,
  onCancelReservation,
  onClearStatistics,
  onDeleteReservation,
  onMarkBalancePaid,
  onMarkCheckedIn,
  onUpdateReservation,
  onClose
}: {
  guestContacts: GuestContact[];
  reservations: Reservation[];
  rooms: Room[];
  onCancelReservation: (reservation: Reservation) => void;
  onClearStatistics: () => Promise<void>;
  onDeleteReservation: (reservation: Reservation) => void;
  onMarkBalancePaid: (reservation: Reservation) => void;
  onMarkCheckedIn: (reservation: Reservation) => void;
  onUpdateReservation: (reservation: Reservation) => Promise<void>;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, ChatBookingDraft>>({});
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [isClearing, setIsClearing] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isAnalyticsSettingsOpen, setIsAnalyticsSettingsOpen] = useState(false);
  const [isClearStatisticsConfirmOpen, setIsClearStatisticsConfirmOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "booked" | "cancelled" | "checked-in" | "no-show" | "balance-due">("all");

  useEffect(() => {
    getAllChatBookingDrafts().then(setDrafts);
    getExpenseEntries().then(setExpenseEntries).catch(() => setExpenseEntries([]));
  }, []);

  const filteredReservations = useMemo(
    () => filterAnalyticsReservations(reservations, rooms, { dateFrom, dateTo, search: "", statusFilter }),
    [dateFrom, dateTo, reservations, rooms, statusFilter]
  );
  const filteredGuestContacts = useMemo(
    () => filterAnalyticsGuestContacts(guestContacts, { dateFrom, dateTo, search: "" }),
    [dateFrom, dateTo, guestContacts]
  );
  const filteredExpenseEntries = useMemo(
    () => filterAnalyticsExpenseEntries(expenseEntries, { dateFrom, dateTo }),
    [dateFrom, dateTo, expenseEntries]
  );
  const analytics = useMemo(
    () => buildAnalyticsSnapshot(filteredReservations, drafts, rooms, filteredGuestContacts, filteredExpenseEntries),
    [drafts, filteredExpenseEntries, filteredGuestContacts, filteredReservations, rooms]
  );
  const priceRecommendation = useMemo(
    () => buildAnalyticsPriceRecommendation({
      analytics,
      dateFrom,
      dateTo,
      expenseEntries: filteredExpenseEntries,
      reservations: filteredReservations,
      rooms
    }),
    [analytics, dateFrom, dateTo, filteredExpenseEntries, filteredReservations, rooms]
  );

  async function handleClearStatistics() {
    setIsClearing(true);
    await onClearStatistics();
    setDrafts({});
    setIsClearing(false);
    setIsClearStatisticsConfirmOpen(false);
  }

  function handleExportAnalytics() {
    downloadTextFile(
      `analytics-${formatDateInput(new Date())}.csv`,
      buildAnalyticsCsvExport(analytics),
      "text/csv;charset=utf-8"
    );
  }

  async function handleSaveEditedReservation(reservation: Reservation) {
    await onUpdateReservation(reservation);
    setEditingReservation(null);
  }

  return (
    <div className="gpb-modal-backdrop">
      <div className="gpb-catalog-modal gpb-analytics-modal" role="dialog" aria-modal="true" aria-label="Статистика">
        <header className="gpb-catalog-header">
          <div>
            <strong>Статистика</strong>
            <span>Базовые данные по обращениям, согласованиям, броням и продажам.</span>
          </div>
          <div className="gpb-catalog-header-actions">
            <button type="button" onClick={handleExportAnalytics} title="Экспорт аналитики">
              <Download size={17} />
              <span>Экспорт аналитики</span>
            </button>
            <div className="gpb-header-menu">
              <button type="button" onClick={() => setIsAnalyticsSettingsOpen((isOpen) => !isOpen)} title="Настройки аналитики">
                <Settings size={17} />
                <span>Настройки</span>
              </button>
              {isAnalyticsSettingsOpen ? (
                <div className="gpb-header-menu-popover">
                  <span>Каталог номеров не очищается.</span>
                  <button type="button" onClick={() => setIsClearStatisticsConfirmOpen(true)} disabled={isClearing}>
                    {isClearing ? "Очищаю..." : "Очистить статистику"}
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={onClose} title="Закрыть" className="gpb-icon-only-button">
              <X size={20} />
            </button>
          </div>
        </header>

        <main className="gpb-analytics-body">
          <section className="gpb-analytics-layout">
            <section className="gpb-analytics-left">
              <section className="gpb-analytics-filters">
                <label>
                  С даты
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                </label>
                <label>
                  По дату
                  <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                </label>
                <label>
                  Статус
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                    <option value="all">Все</option>
                    <option value="pending">Согласования</option>
                    <option value="booked">Забронировано</option>
                    <option value="checked-in">Въехали</option>
                    <option value="balance-due">Должны доплатить</option>
                    <option value="cancelled">Отменено</option>
                    <option value="no-show">Незаезд</option>
                  </select>
                </label>
              </section>

              <section className="gpb-analytics-cards">
                <h2>Сводка цифр</h2>
                <AnalyticsCard label="Обращения" value={analytics.inquiries} />
                <AnalyticsCard label="Согласования" value={analytics.pending} />
                <AnalyticsCard label="Продано" value={analytics.booked} />
                <AnalyticsCard label="Отменено" value={analytics.cancelled} />
                <AnalyticsCard label="Клиенты" value={analytics.clients} />
                <AnalyticsCard label="Выручка" value={formatAnalyticsMoney(analytics.revenue)} />
                <AnalyticsCard label="Предоплаты" value={formatAnalyticsMoney(analytics.prepayments)} />
                <AnalyticsCard label="Доплаты" value={formatAnalyticsMoney(analytics.balancePayments)} />
                <AnalyticsCard label="Остатки" value={formatAnalyticsMoney(analytics.outstandingBalance)} />
                <AnalyticsCard label="Расходы" value={formatAnalyticsMoney(analytics.expenses)} />
                <AnalyticsCard label="После расходов" value={formatAnalyticsMoney(analytics.profitAfterExpenses)} />
                <AnalyticsCard label="Незаезды" value={analytics.noShows} />
                <AnalyticsCard label="Средний чек" value={formatAnalyticsMoney(analytics.averageSale)} />
              </section>
            </section>

            <AnalyticsCharts analytics={analytics} recommendation={priceRecommendation} />
          </section>
        </main>
        {editingReservation ? (
          <EditReservationModal
            reservation={editingReservation}
            rooms={rooms}
            onClose={() => setEditingReservation(null)}
            onSave={handleSaveEditedReservation}
          />
        ) : null}
        {isClearStatisticsConfirmOpen ? (
          <ConfirmActionModal
            title="Очистить статистику?"
            description="Черновики и локальные брони будут очищены. Каталог номеров останется."
            confirmLabel="Очистить"
            tone="danger"
            onClose={() => setIsClearStatisticsConfirmOpen(false)}
            onConfirm={() => void handleClearStatistics()}
          />
        ) : null}
      </div>
    </div>
  );
}

function EditReservationModal({
  reservation,
  rooms,
  onClose,
  onSave
}: {
  reservation: Reservation;
  rooms: Room[];
  onClose: () => void;
  onSave: (reservation: Reservation) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Reservation>(reservation);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"client" | "dates" | "objects" | "finance" | "marks">("client");

  useEffect(() => {
    setDraft(reservation);
    setActiveSection("client");
  }, [reservation]);

  function updateDraft(patch: Partial<Reservation>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleRoom(roomId: string) {
    setDraft((current) => ({
      ...current,
      roomIds: current.roomIds.includes(roomId)
        ? current.roomIds.filter((id) => id !== roomId)
        : current.roomIds.concat(roomId)
    }));
  }

  function updateTimestamp(field: "prepaymentReceivedAt" | "balancePaidAt" | "checkedInAt" | "checkedOutAt" | "noShowAt", enabled: boolean) {
    updateDraft({ [field]: enabled ? draft[field] ?? new Date().toISOString() : undefined });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    await onSave({
      ...draft,
      adults: Math.max(0, draft.adults),
      children: Math.max(0, draft.children),
      airMattressCount: Math.max(0, draft.airMattressCount),
      rollawayCount: Math.max(0, draft.rollawayCount ?? 0),
      hourlyHours: Math.max(0, draft.hourlyHours),
      discountPercent: clampNumber(draft.discountPercent, 0, 100),
      subtotal: Math.max(0, draft.subtotal),
      discountAmount: Math.max(0, draft.discountAmount),
      total: Math.max(0, draft.total),
      prepayment: Math.max(0, draft.prepayment)
    });
    setIsSaving(false);
  }

  const editSections = [
    { id: "client" as const, label: "Клиент", icon: <Users size={18} /> },
    { id: "dates" as const, label: "Даты и гости", icon: <CalendarDays size={18} /> },
    { id: "objects" as const, label: "Объекты", icon: <Hotel size={18} /> },
    { id: "finance" as const, label: "Финансы", icon: <Banknote size={18} /> },
    { id: "marks" as const, label: "Отметки", icon: <Check size={18} /> }
  ];

  return (
    <div className="gpb-modal-backdrop gpb-nested-modal-backdrop">
      <form className="gpb-catalog-modal gpb-edit-reservation-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label="Редактировать заказ">
        <header className="gpb-catalog-header">
          <div>
            <strong>Редактировать заказ</strong>
            <span>{draft.guestFirstName || "Гость"} · {formatReservationDateRange(draft)}</span>
          </div>
          <div className="gpb-catalog-header-actions">
            <button className="gpb-primary" type="submit" disabled={isSaving}>
              {isSaving ? "Сохраняю..." : "Сохранить"}
            </button>
            <button type="button" onClick={onClose} title="Закрыть" className="gpb-icon-only-button">
              <X size={20} />
            </button>
          </div>
        </header>

        <main className="gpb-edit-reservation-layout">
          <aside className="gpb-edit-reservation-nav" aria-label="Разделы редактирования">
            {editSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={activeSection === section.id ? "is-active" : ""}
                onClick={() => setActiveSection(section.id)}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            ))}
          </aside>

          <div className="gpb-edit-reservation-content">
          {activeSection === "client" ? (
          <section className="gpb-edit-reservation-section gpb-edit-reservation-section-client">
            <h2>Клиент</h2>
            <label>
              ФИО
              <input value={draft.guestFirstName} onChange={(event) => updateDraft({ guestFirstName: event.target.value })} />
            </label>
            <label>
              Телефон
              <input value={draft.phone} onChange={(event) => updateDraft({ phone: event.target.value })} />
            </label>
            <label>
              Взрослые
              <input
                min="0"
                type="number"
                value={draft.adults}
                onChange={(event) => updateDraft({ adults: toNumber(event.target.value, 0) })}
              />
            </label>
            <label>
              Дети
              <input
                min="0"
                type="number"
                value={draft.children}
                onChange={(event) => updateDraft({ children: toNumber(event.target.value, 0) })}
              />
            </label>
            <label>
              Статус
              <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as Reservation["status"] })}>
                <option value="pending">На согласовании</option>
                <option value="booked">Забронировано</option>
                <option value="cancelled">Бронь отменена</option>
              </select>
            </label>
            <label className="gpb-grid-full">
              Комментарий
              <textarea value={draft.comment} onChange={(event) => updateDraft({ comment: event.target.value })} />
            </label>
          </section>
          ) : null}

          {activeSection === "dates" ? (
          <section className="gpb-edit-reservation-section gpb-edit-reservation-section-dates">
            <h2>Даты</h2>
            <label>
              Заезд
              <input type="date" value={draft.checkIn} onChange={(event) => updateDraft({ checkIn: event.target.value })} />
            </label>
            <label>
              Время заезда
              <input type="time" value={draft.checkInTime} onChange={(event) => updateDraft({ checkInTime: event.target.value })} />
            </label>
            <label>
              Выезд
              <input type="date" value={draft.checkOut} onChange={(event) => updateDraft({ checkOut: event.target.value })} />
            </label>
            <label>
              Время выезда
              <input type="time" value={draft.checkOutTime} onChange={(event) => updateDraft({ checkOutTime: event.target.value })} />
            </label>
            <label>
              Часы
              <input min="0" type="number" value={draft.hourlyHours} onChange={(event) => updateDraft({ hourlyHours: toNumber(event.target.value, 0) })} />
            </label>
            <label>
              Матрасы
              <input min="0" type="number" value={draft.airMattressCount} onChange={(event) => updateDraft({ airMattressCount: toNumber(event.target.value, 0) })} />
            </label>
            <label>
              Раскладушки
              <input min="0" type="number" value={draft.rollawayCount ?? 0} onChange={(event) => updateDraft({ rollawayCount: toNumber(event.target.value, 0) })} />
            </label>
            <label className="gpb-checkbox-line">
              <input type="checkbox" checked={draft.hasPet} onChange={(event) => updateDraft({ hasPet: event.target.checked })} />
              С питомцем
            </label>
            <label className="gpb-checkbox-line">
              <input type="checkbox" checked={draft.extraBed} onChange={(event) => updateDraft({ extraBed: event.target.checked })} />
              Доп. кровать
            </label>
          </section>
          ) : null}

          {activeSection === "objects" ? (
          <section className="gpb-edit-reservation-section gpb-edit-reservation-section-objects">
            <h2>Объекты</h2>
            <div className="gpb-edit-room-list">
              {rooms.filter((room) => room.bookable).map((room) => (
                <label className="gpb-edit-room-option" key={room.id}>
                  <input type="checkbox" checked={draft.roomIds.includes(room.id)} onChange={() => toggleRoom(room.id)} />
                  <span>{formatAnalyticsObjectLabel(room)}</span>
                  <small>{room.floor || ""}</small>
                </label>
              ))}
            </div>
          </section>
          ) : null}

          {activeSection === "finance" ? (
          <section className="gpb-edit-reservation-section gpb-edit-reservation-section-finance">
            <h2>Финансы</h2>
            <label>
              Сумма до скидки
              <input inputMode="numeric" value={getPriceInputValue(draft.subtotal, false)} onChange={(event) => updateDraft({ subtotal: parsePriceInput(event.target.value) })} />
            </label>
            <label>
              Скидка, %
              <input min="0" max="100" type="number" value={draft.discountPercent} onChange={(event) => updateDraft({ discountPercent: toNumber(event.target.value, 0) })} />
            </label>
            <label>
              Скидка, сумма
              <input inputMode="numeric" value={getPriceInputValue(draft.discountAmount, false)} onChange={(event) => updateDraft({ discountAmount: parsePriceInput(event.target.value) })} />
            </label>
            <label>
              Итого
              <input inputMode="numeric" value={getPriceInputValue(draft.total, false)} onChange={(event) => updateDraft({ total: parsePriceInput(event.target.value) })} />
            </label>
            <label>
              Предоплата
              <input inputMode="numeric" value={getPriceInputValue(draft.prepayment, false)} onChange={(event) => updateDraft({ prepayment: parsePriceInput(event.target.value) })} />
            </label>
            <label>
              Способ оплаты
              <input value={draft.paymentMethod ?? ""} onChange={(event) => updateDraft({ paymentMethod: event.target.value })} />
            </label>
            <label>
              Ссылка оплаты
              <input value={draft.paymentLink} onChange={(event) => updateDraft({ paymentLink: event.target.value })} />
            </label>
          </section>
          ) : null}

          {activeSection === "marks" ? (
          <section className="gpb-edit-reservation-section gpb-edit-reservation-section-marks">
            <h2>Отметки</h2>
            <div className="gpb-edit-mark-card">
              <label className="gpb-checkbox-line">
                <input type="checkbox" checked={Boolean(draft.prepaymentReceivedAt)} onChange={(event) => updateTimestamp("prepaymentReceivedAt", event.target.checked)} />
                Предоплата внесена
              </label>
              <label>
                Дата предоплаты
                <input value={draft.prepaymentReceivedAt ?? ""} onChange={(event) => updateDraft({ prepaymentReceivedAt: event.target.value || undefined })} />
              </label>
            </div>
            <div className="gpb-edit-mark-card">
              <label className="gpb-checkbox-line">
                <input type="checkbox" checked={Boolean(draft.balancePaidAt)} onChange={(event) => updateTimestamp("balancePaidAt", event.target.checked)} />
                Доплата внесена
              </label>
              <label>
                Дата доплаты
                <input value={draft.balancePaidAt ?? ""} onChange={(event) => updateDraft({ balancePaidAt: event.target.value || undefined })} />
              </label>
            </div>
            <div className="gpb-edit-mark-card">
              <label className="gpb-checkbox-line">
                <input type="checkbox" checked={Boolean(draft.checkedInAt)} onChange={(event) => updateTimestamp("checkedInAt", event.target.checked)} />
                Въезд отмечен
              </label>
              <label>
                Дата въезда
                <input value={draft.checkedInAt ?? ""} onChange={(event) => updateDraft({ checkedInAt: event.target.value || undefined })} />
              </label>
            </div>
            <div className="gpb-edit-mark-card">
              <label className="gpb-checkbox-line">
                <input type="checkbox" checked={Boolean(draft.checkedOutAt)} onChange={(event) => updateTimestamp("checkedOutAt", event.target.checked)} />
                Выезд отмечен
              </label>
              <label>
                Дата выезда
                <input value={draft.checkedOutAt ?? ""} onChange={(event) => updateDraft({ checkedOutAt: event.target.value || undefined })} />
              </label>
            </div>
            <div className="gpb-edit-mark-card">
              <label className="gpb-checkbox-line">
                <input type="checkbox" checked={Boolean(draft.noShowAt)} onChange={(event) => updateTimestamp("noShowAt", event.target.checked)} />
                Незаезд
              </label>
              <label>
                Дата незаезда
                <input value={draft.noShowAt ?? ""} onChange={(event) => updateDraft({ noShowAt: event.target.value || undefined })} />
              </label>
            </div>
            <div className="gpb-edit-mark-card">
              <div className="gpb-edit-mark-title">Создано</div>
              <label>
                Дата создания
                <input value={draft.createdAt} onChange={(event) => updateDraft({ createdAt: event.target.value })} />
              </label>
            </div>
          </section>
          ) : null}
          </div>
        </main>
      </form>
    </div>
  );
}

function AnalyticsCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="gpb-analytics-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AnalyticsCharts({
  analytics,
  recommendation
}: {
  analytics: ReturnType<typeof buildAnalyticsSnapshot>;
  recommendation: ReturnType<typeof buildAnalyticsPriceRecommendation>;
}) {
  const statusItems = [
    { title: "Согласования", amount: analytics.pending, color: "#2563eb" },
    { title: "Продано", amount: analytics.booked, color: "#0f7a63" },
    { title: "Отменено", amount: analytics.cancelled, color: "#d97706" },
    { title: "Незаезды", amount: analytics.noShows, color: "#b42318" }
  ];
  const financeItems = [
    { title: "Предоплаты", amount: analytics.prepayments, color: "#0f7a63" },
    { title: "Доплаты", amount: analytics.balancePayments, color: "#2563eb" },
    { title: "Остатки", amount: analytics.outstandingBalance, color: "#d97706" }
  ];
  const objectItems = analytics.roomSales.slice(0, 8).map((item, index) => ({
    title: `${item.number}${item.title ? ` ${item.title}` : ""}`.trim(),
    amount: item.revenue,
    color: EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length]
  }));

  return (
    <section className="gpb-analytics-panel gpb-analytics-chart-panel">
      <h2>Диаграммы</h2>
      <AnalyticsPriceRecommendation recommendation={recommendation} />
      <ExpensePieChart
        title="Доход / расход"
        items={[
          { title: "Доход", amount: analytics.revenue, color: "#0f7a63" },
          { title: "Расход", amount: analytics.expenses, color: "#b42318" }
        ]}
      />
      <ExpensePieChart title="Статусы" items={statusItems} />
      <ExpensePieChart title="Финансы" items={financeItems} />
      <ExpensePieChart
        title="Категории расходов"
        items={analytics.expenseCategories.map((item, index) => ({
          title: item.title,
          amount: item.amount,
          color: EXPENSE_CHART_COLORS[index % EXPENSE_CHART_COLORS.length]
        }))}
      />
      <ExpensePieChart title="Объекты" items={objectItems} />
    </section>
  );
}

function AnalyticsPriceRecommendation({ recommendation }: { recommendation: ReturnType<typeof buildAnalyticsPriceRecommendation> }) {
  return (
    <section className={`gpb-analytics-price-advice is-${recommendation.tone}`}>
      <header>
        <strong>Рекомендации по цене</strong>
        <span>{recommendation.periodLabel}</span>
      </header>
      <p>{recommendation.message}</p>
      <div className="gpb-analytics-price-advice-grid">
        <div>
          <span>Нужно закрыть</span>
          <b>{formatAnalyticsMoney(recommendation.gap)}</b>
        </div>
        <div>
          <span>Свободно</span>
          <b>{recommendation.availableRoomNights} номеро-ночей</b>
        </div>
        <div>
          <span>Мин. цена 50%</span>
          <b>{formatAnalyticsMoney(recommendation.requiredAveragePrice)}</b>
        </div>
        <div>
          <span>Средняя из настроек</span>
          <b>{formatAnalyticsMoney(recommendation.currentAveragePrice)}</b>
        </div>
        <div>
          <span>Мин. из настроек</span>
          <b>{formatAnalyticsMoney(recommendation.settingsMinPrice)}</b>
        </div>
        <div>
          <span>Запас скидки</span>
          <b>{recommendation.discountReservePercent}%</b>
        </div>
      </div>
      {recommendation.scenarios.length ? (
        <div className="gpb-analytics-price-scenarios">
          {recommendation.scenarios.map((scenario) => (
            <span key={scenario.loadPercent}>
              {scenario.loadPercent}%: <b>{formatAnalyticsMoney(scenario.settingsRevenue)}</b>
              <em>цель {formatAnalyticsMoney(scenario.targetRevenue)} · цена {formatAnalyticsMoney(scenario.price)}</em>
            </span>
          ))}
        </div>
      ) : null}
      <div className="gpb-analytics-demand">
        <strong>Ликвидность по базе</strong>
        <span>
          Чаще берут: {recommendation.highDemandRooms.length ? recommendation.highDemandRooms.join(", ") : "пока нет данных"}
        </span>
        <span>
          Слабее продаются: {recommendation.lowDemandRooms.length ? recommendation.lowDemandRooms.join(", ") : "пока нет данных"}
        </span>
      </div>
      <small>
        Доход: {formatAnalyticsMoney(recommendation.revenue)} · Расходы: {formatAnalyticsMoney(recommendation.expenses)} ·
        Остатки к получению: {formatAnalyticsMoney(recommendation.outstandingBalance)} · Цены сверены с настройками номеров
      </small>
    </section>
  );
}

function AnalyticsBarChart({
  title,
  items,
  emptyLabel = "Данных пока нет"
}: {
  title: string;
  items: Array<{ label: string; value: number; formatted?: string }>;
  emptyLabel?: string;
}) {
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <div className="gpb-analytics-chart">
      <strong>{title}</strong>
      {items.length ? (
        <div className="gpb-analytics-chart-list">
          {items.map((item) => (
            <div className="gpb-analytics-chart-row" key={item.label}>
              <span>{item.label}</span>
              <div className="gpb-analytics-chart-track">
                <i style={{ width: item.value > 0 ? `${Math.max(8, Math.round((item.value / maxValue) * 100))}%` : "0%" }} />
              </div>
              <b>{item.formatted ?? item.value}</b>
            </div>
          ))}
          {items.every((item) => item.value <= 0) ? <em>{emptyLabel}</em> : null}
        </div>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </div>
  );
}

function RoomCatalogModal({
  customAmenityOptions,
  customFoodOptions,
  customHolidayDates,
  customSleepingPlaceOptions,
  defaultCheckInTime,
  defaultCheckOutTime,
  dynamicPricingEnabled,
  dynamicPricingMarginPercent,
  dynamicPricingSeasonEnd,
  onCustomAmenityOptionsChange,
  onCustomFoodOptionsChange,
  onCustomHolidayDatesChange,
  onCustomSleepingPlaceOptionsChange,
  onDynamicPricingChange,
  onClose
}: {
  customAmenityOptions: string[];
  customFoodOptions: string[];
  customHolidayDates: string[];
  customSleepingPlaceOptions: string[];
  defaultCheckInTime: string;
  defaultCheckOutTime: string;
  dynamicPricingEnabled: boolean;
  dynamicPricingMarginPercent: number;
  dynamicPricingSeasonEnd: string;
  onCustomAmenityOptionsChange: (options: string[]) => Promise<void>;
  onCustomFoodOptionsChange: (options: string[]) => Promise<void>;
  onCustomHolidayDatesChange: (dates: string[]) => Promise<void>;
  onCustomSleepingPlaceOptionsChange: (options: string[]) => Promise<void>;
  onDynamicPricingChange: (patch: Partial<Pick<PaymentSettings, "dynamicPricingEnabled" | "dynamicPricingMarginPercent" | "dynamicPricingSeasonEnd">>) => Promise<void>;
  onClose: () => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [mediaError, setMediaError] = useState("");
  const [isTechnicalOpen, setIsTechnicalOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [focusedPriceRoomId, setFocusedPriceRoomId] = useState<string | null>(null);
  const [isHolidayCalendarOpen, setIsHolidayCalendarOpen] = useState(false);
  const [holidayCalendarMonth, setHolidayCalendarMonth] = useState(formatDateInput(new Date()).slice(0, 7));
  const [copiedPriceSettings, setCopiedPriceSettings] = useState<Pick<Room, "basePrice" | "weekdayPrice" | "weekendPrice" | "holidayPrice" | "extraBedPrice"> | null>(null);
  const [cropPath, setCropPath] = useState<string | null>(null);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [deleteRoomTarget, setDeleteRoomTarget] = useState<Room | null>(null);
  const [isAmenityCreateOpen, setIsAmenityCreateOpen] = useState(false);
  const [isFoodCreateOpen, setIsFoodCreateOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const skipNextAutoSaveRef = useRef(false);
  const activeRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const activeGroup = activeRoom?.group || DEFAULT_GROUPS[0] || "Без группы";
  const catalogPriceSummary = useMemo(() => buildCatalogPriceSummary(rooms), [rooms]);

  useEffect(() => {
    getRooms()
      .then((items) => {
        const loadedRooms = mergeRooms(items);
        skipNextAutoSaveRef.current = true;
        setRooms(loadedRooms);
        setSelectedRoomId((currentId) => currentId || loadedRooms[0]?.id || "");
        setLoadState("ready");
      })
      .catch(() => setLoadState("ready"));
  }, []);

  useEffect(() => {
    if (loadState !== "ready") return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(async () => {
      if (!rooms.length) {
        setSaveState("idle");
        return;
      }

      setSaveState("saving");
      try {
        await Promise.all(withSortOrder(rooms).map((room) => saveRoom(room)));
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [loadState, rooms]);

  function updateActiveRoom(patch: Partial<Room>) {
    if (!activeRoom) return;
    setSaveState("idle");
    setMediaError("");
    setRooms((currentRooms) =>
      currentRooms.map((room) => (room.id === activeRoom.id ? { ...room, ...patch } : room))
    );
  }

  function toggleAmenity(amenity: string) {
    if (!activeRoom) return;
    const amenities = parseAmenities(activeRoom.amenities);
    const nextAmenities = amenities.includes(amenity)
      ? amenities.filter((item) => item !== amenity)
      : amenities.concat(amenity);
    updateActiveRoom({ amenities: nextAmenities.join(", ") });
  }

  function removeAmenity(amenity: string) {
    if (!activeRoom) return;
    updateActiveRoom({ amenities: parseAmenities(activeRoom.amenities).filter((item) => item !== amenity).join(", ") });
  }

  function addAmenityToActiveRoom(name: string) {
    if (!activeRoom) return;
    const amenities = parseAmenities(activeRoom.amenities);
    if (!amenities.some((item) => item.toLowerCase() === name.toLowerCase())) {
      updateActiveRoom({ amenities: amenities.concat(name).join(", ") });
    }
  }

  async function createCustomAmenity(title: string) {
    const name = title.trim();
    if (!name || !activeRoom) return;
    if (!customAmenityOptions.some((item) => item.toLowerCase() === name.toLowerCase())) {
      await onCustomAmenityOptionsChange(customAmenityOptions.concat(name));
    }
    addAmenityToActiveRoom(name);
    setIsAmenityCreateOpen(false);
  }

  function updateActiveRoomClass(roomClass: string) {
    updateActiveRoom({
      occupancyLabel: roomClass,
      title: roomClass || getObjectTypeLabel(activeRoom ?? { category: "guest-room", objectType: "room" })
    });
  }

  function copyActiveRoomPrices() {
    if (!activeRoom) return;
    setCopiedPriceSettings({
      basePrice: activeRoom.basePrice,
      weekdayPrice: activeRoom.weekdayPrice,
      weekendPrice: activeRoom.weekendPrice,
      holidayPrice: activeRoom.holidayPrice,
      extraBedPrice: activeRoom.extraBedPrice
    });
  }

  function pasteActiveRoomPrices() {
    if (!activeRoom || !copiedPriceSettings) return;
    updateActiveRoom(copiedPriceSettings);
  }

  function moveActiveRoom(direction: -1 | 1) {
    if (!activeRoom) return;
    setSaveState("idle");
    setRooms((currentRooms) => {
      const currentIndex = currentRooms.findIndex((room) => room.id === activeRoom.id);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentRooms.length) {
        return currentRooms;
      }

      const nextRooms = [...currentRooms];
      const [room] = nextRooms.splice(currentIndex, 1);
      nextRooms.splice(nextIndex, 0, room);
      return withSortOrder(nextRooms);
    });
  }

  function moveDraggedRoom(targetRoomId: string) {
    if (!draggedRoomId || draggedRoomId === targetRoomId) {
      return;
    }

    setSaveState("idle");
    setRooms((currentRooms) => {
      const draggedIndex = currentRooms.findIndex((room) => room.id === draggedRoomId);
      const targetIndex = currentRooms.findIndex((room) => room.id === targetRoomId);
      if (draggedIndex < 0 || targetIndex < 0) {
        return currentRooms;
      }

      const nextRooms = [...currentRooms];
      const [draggedRoom] = nextRooms.splice(draggedIndex, 1);
      const targetRoom = currentRooms[targetIndex];
      const insertIndex = nextRooms.findIndex((room) => room.id === targetRoomId);
      nextRooms.splice(insertIndex, 0, { ...draggedRoom, group: targetRoom.group });
      return withSortOrder(nextRooms);
    });
    setDraggedRoomId(null);
  }

  function createCatalogObject(input: CreateCatalogObjectInput) {
    setSaveState("idle");
    setMediaError("");
    setIsTechnicalOpen(true);
    setIsCreateOpen(false);
    setRooms((currentRooms) => {
      const room = createCustomObject({
        category: input.category,
        floor: input.floor,
        group: input.group.trim() || activeGroup,
        number: input.number,
        objectType: input.objectType,
        sortOrder: currentRooms.length,
        roomClass: input.roomClass,
        nextNumber: getNextRoomNumber(currentRooms)
      });
      setSelectedRoomId(room.id);
      return withSortOrder(currentRooms.concat(room));
    });
  }

  async function handleSave() {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    setSaveState("saving");
    try {
      const roomsToSave = withSortOrder(rooms);
      const savedRooms = await Promise.all(roomsToSave.map((room) => saveRoom(room)));
      setRooms(withSortOrder(savedRooms));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function exportCatalogCsv() {
    downloadTextFile(`catalog-${formatDateInput(new Date())}.csv`, buildCatalogCsvExport(withSortOrder(rooms)), "text/csv;charset=utf-8");
  }

  async function handleDeleteRoom(room: Room) {

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    setSaveState("saving");
    setMediaError("");
    try {
      await deleteRoom(room.id);
      setRooms((currentRooms) => {
        const nextRooms = withSortOrder(currentRooms.filter((item) => item.id !== room.id));
        setSelectedRoomId(nextRooms[0]?.id || "");
        return nextRooms;
      });
      setSaveState("saved");
      setDeleteRoomTarget(null);
    } catch {
      setSaveState("error");
    }
  }

  async function handleMediaUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || !activeRoom) return;

    setSaveState("saving");
    setMediaError("");
    try {
      const updatedRoom = await uploadRoomMedia(activeRoom, file);
      setRooms((currentRooms) => currentRooms.map((room) => (room.id === updatedRoom.id ? updatedRoom : room)));
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setMediaError("Не удалось загрузить файл. Проверьте, что backend запущен: npm run dev:backend");
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function handleMediaDelete(path: string) {
    if (!activeRoom) return;
    setSaveState("saving");
    setMediaError("");
    try {
      const updatedRoom = await deleteRoomMedia(activeRoom, path);
      setRooms((currentRooms) => currentRooms.map((room) => (room.id === updatedRoom.id ? updatedRoom : room)));
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setMediaError("Не удалось удалить файл. Проверьте, что backend запущен: npm run dev:backend");
    }
  }

  async function downloadActiveRoomMedia(type: "photo" | "video") {
    if (!activeRoom) return;
    const paths = type === "photo" ? activeRoom.photoPaths : activeRoom.videoPaths;
    if (!paths.length) return;

    setMediaError("");
    try {
      const roomCode = createObjectCode(`${activeRoom.number || activeRoom.title || activeRoom.id}`);
      const files = await Promise.all(paths.map(async (path, index) => {
        const response = await fetch(getMediaUrl(path));
        if (!response.ok) {
          throw new Error(`Media fetch failed: ${response.status}`);
        }
        const blob = await response.blob();
        return {
          blob,
          name: getDownloadMediaFileName(path, blob.type, `${roomCode}-${type === "photo" ? "photo" : "video"}-${index + 1}`)
        };
      }));

      if (files.length === 1) {
        downloadBlobFile(files[0].blob, files[0].name);
        return;
      }

      const zipBlob = await createZipBlob(files);
      downloadBlobFile(zipBlob, `${roomCode}-${type === "photo" ? "photos" : "videos"}.zip`);
    } catch {
      setMediaError(`Не удалось скачать ${type === "photo" ? "фото" : "видео"}. Проверьте, что backend запущен.`);
    }
  }

  function setPhotoAsMain(path: string) {
    if (!activeRoom) return;
    updateActiveRoom({ photoPaths: [path, ...activeRoom.photoPaths.filter((photoPath) => photoPath !== path)] });
  }

  async function handleCropSave(options: { aspectRatio: number; focalX: number; focalY: number; path: string }) {
    if (!activeRoom) return;
    setSaveState("saving");
    try {
      const updatedRoom = await cropRoomMedia(activeRoom, options.path, options);
      setRooms((currentRooms) => currentRooms.map((room) => (room.id === updatedRoom.id ? updatedRoom : room)));
      setCropPath(null);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="gpb-modal-backdrop">
      <div className="gpb-catalog-modal" role="dialog" aria-modal="true" aria-label="Каталог номеров">
        <header className="gpb-catalog-header">
          <div>
            <strong>Каталог номеров</strong>
            <span>
              Фото, видео, цены, спальные места и описание для ответов клиентам.
            </span>
          </div>
          <div className="gpb-catalog-header-actions">
            <button type="button" onClick={exportCatalogCsv} title="Экспорт каталога CSV">
              <Download size={17} />
              <span>CSV</span>
            </button>
            <button type="button" onClick={onClose} title="Закрыть">
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="gpb-catalog-body">
          <nav className="gpb-room-list" aria-label="Номера">
            <div className="gpb-room-list-scroll">
              {rooms.length ? (
                rooms.map((room) => (
                  <RoomListItem
                    activeRoomId={activeRoom?.id ?? ""}
                    draggedRoomId={draggedRoomId}
                    key={room.id}
                    previousGroup={getPreviousRoomGroup(rooms, room.id)}
                    room={room}
                    onDragEnd={() => setDraggedRoomId(null)}
                    onDragStart={() => setDraggedRoomId(room.id)}
                    onDrop={() => moveDraggedRoom(room.id)}
                    onSelect={() => setSelectedRoomId(room.id)}
                  />
                ))
              ) : (
                <div className="gpb-empty-catalog-list">
                  <strong>Каталог пуст</strong>
                  <span>Создайте первый номер, домик или объект.</span>
                </div>
              )}
            </div>
            <button className="gpb-add-room-button" type="button" onClick={() => setIsCreateOpen(true)}>
              <Plus size={18} />
              <span>Создать</span>
            </button>
          </nav>

          {activeRoom ? (
          <main className="gpb-room-editor">
            <div className="gpb-room-editor-scroll">
              <section className="gpb-editor-section gpb-identity-section">
                <div className="gpb-editor-title gpb-identity-title">
                  <CatalogItemIcon room={activeRoom} size={20} />
                  <div>
                    <h2>{activeRoom.title}</h2>
                    <span>{activeRoom.number} · {getObjectTypeLabel(activeRoom)}</span>
                  </div>
                  <div className="gpb-order-actions">
                    <button type="button" onClick={() => setIsTechnicalOpen((value) => !value)} title="Редактировать техданные">
                      <Pencil size={16} />
                    </button>
                    <button type="button" onClick={() => moveActiveRoom(-1)} title="Поднять выше">
                      <MoveUp size={16} />
                    </button>
                    <button type="button" onClick={() => moveActiveRoom(1)} title="Опустить ниже">
                      <MoveDown size={16} />
                    </button>
                    <button type="button" onClick={() => setDeleteRoomTarget(activeRoom)} title="Удалить объект">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {isTechnicalOpen ? (
                  <div className="gpb-technical-editor">
                    <div className="gpb-form-grid gpb-technical-grid">
                      <label>
                        Тип
                        <select
                          value={activeRoom.objectType}
                          onChange={(event) => {
                            const option = getCreateTypeOption(event.target.value as Room["objectType"]);
                            updateActiveRoom({
                              category: option.category,
                              objectType: option.objectType,
                              bookable: option.category !== "staff-room",
                              bathroomType: getDefaultBathroomType(option.objectType)
                            });
                          }}
                        >
                          {CREATE_TYPE_OPTIONS.map((option) => (
                            <option key={option.objectType} value={option.objectType}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Номер / код
                        <input value={activeRoom.number} onChange={(event) => updateActiveRoom({ number: event.target.value })} />
                      </label>
                      {activeRoom.category === "guest-room" ? (
                        <label>
                          Класс
                          <select value={activeRoom.occupancyLabel} onChange={(event) => updateActiveRoomClass(event.target.value)}>
                            <option value="">Не указан</option>
                            {ROOM_CLASS_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label>
                        Статус
                        <select value={activeRoom.status} onChange={(event) => updateActiveRoom({ status: event.target.value as RoomStatus })}>
                          {ROOM_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Группа
                        <input
                          list="gpb-room-groups"
                          value={activeRoom.group}
                          onChange={(event) => updateActiveRoom({ group: event.target.value })}
                        />
                      </label>
                      <datalist id="gpb-room-groups">
                        {getGroupSuggestions(rooms).map((group) => (
                          <option key={group} value={group} />
                        ))}
                      </datalist>
                      <label>
                        Этаж
                        <select value={activeRoom.floor} onChange={(event) => updateActiveRoom({ floor: event.target.value })}>
                          <option value="">Не указан</option>
                          {FLOOR_OPTIONS.map((floor) => (
                            <option key={floor} value={floor}>{floor}</option>
                          ))}
                        </select>
                      </label>
                      {shouldShowBathroomType(activeRoom.objectType) ? (
                        <label>
                          Душ и санузел
                          <select value={activeRoom.bathroomType} onChange={(event) => updateActiveRoom({ bathroomType: event.target.value as Room["bathroomType"] })}>
                            {BATHROOM_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                    <div className="gpb-technical-options">
                      <label className="gpb-checkbox-row">
                        <input
                          type="checkbox"
                          checked={activeRoom.excludeFromBookingSummary}
                          onChange={(event) => updateActiveRoom({ excludeFromBookingSummary: event.target.checked })}
                        />
                        <span>Исключить из расчета</span>
                      </label>
                      <label className="gpb-checkbox-row">
                        <input
                          type="checkbox"
                          checked={activeRoom.hideInBookingPanel}
                          onChange={(event) => updateActiveRoom({ hideInBookingPanel: event.target.checked })}
                        />
                        <span>Скрыть в панели бронирования</span>
                      </label>
                    </div>
                  </div>
                ) : null}
              </section>

              {activeRoom.category === "amenity" ? (
                <section className="gpb-editor-section gpb-included-section">
                  <div className="gpb-editor-title">
                    <CatalogItemIcon room={activeRoom} size={20} />
                    <h2>Комплектация бронирования</h2>
                  </div>
                  <div className="gpb-form-grid">
                    <label>
                      Входит в проживание
                      <select
                        value={activeRoom.includedInStay ? "yes" : "no"}
                        onChange={(event) => updateActiveRoom({ includedInStay: event.target.value === "yes" })}
                      >
                        <option value="yes">Да, входит</option>
                        <option value="no">Нет, отдельно</option>
                      </select>
                    </label>
                    <label>
                      Вместимость / количество
                      <input
                        min="1"
                        type="number"
                        value={activeRoom.capacityAdults}
                        onChange={(event) => updateActiveRoom({ capacityAdults: toNumber(event.target.value, 1) })}
                      />
                    </label>
                  </div>
                </section>
              ) : null}

              <section className="gpb-editor-section gpb-price-section">
                <div className="gpb-editor-title">
                  <Banknote size={20} />
                  <h2>Цена</h2>
                  <div className="gpb-price-copy-actions">
                    <button type="button" onClick={copyActiveRoomPrices} title="Копировать цены">
                      <Copy size={16} />
                    </button>
                    <button type="button" onClick={pasteActiveRoomPrices} disabled={!copiedPriceSettings} title="Вставить цены">
                      <ClipboardPaste size={16} />
                    </button>
                  </div>
                </div>
                <div className="gpb-form-grid">
                  <label className="gpb-price-input">
                    Будни
                    <input
                      inputMode="numeric"
                      placeholder="Бесплатно"
                      type="text"
                      value={getPriceInputValue(activeRoom.weekdayPrice, focusedPriceRoomId === `${activeRoom.id}:weekday`)}
                      onBlur={() => setFocusedPriceRoomId(null)}
                      onChange={(event) => {
                        const price = parsePriceInput(event.target.value);
                        updateActiveRoom({ basePrice: price, weekdayPrice: price });
                      }}
                      onFocus={() => setFocusedPriceRoomId(`${activeRoom.id}:weekday`)}
                    />
                  </label>
                  <label className="gpb-price-input">
                    Выходные
                    <input
                      inputMode="numeric"
                      placeholder="Бесплатно"
                      type="text"
                      value={getPriceInputValue(activeRoom.weekendPrice, focusedPriceRoomId === `${activeRoom.id}:weekend`)}
                      onBlur={() => setFocusedPriceRoomId(null)}
                      onChange={(event) => updateActiveRoom({ weekendPrice: parsePriceInput(event.target.value) })}
                      onFocus={() => setFocusedPriceRoomId(`${activeRoom.id}:weekend`)}
                    />
                  </label>
                  <label className="gpb-price-input">
                    Праздники
                    <input
                      inputMode="numeric"
                      placeholder="Бесплатно"
                      type="text"
                      value={getPriceInputValue(activeRoom.holidayPrice, focusedPriceRoomId === `${activeRoom.id}:holiday`)}
                      onBlur={() => setFocusedPriceRoomId(null)}
                      onChange={(event) => updateActiveRoom({ holidayPrice: parsePriceInput(event.target.value) })}
                      onFocus={() => setFocusedPriceRoomId(`${activeRoom.id}:holiday`)}
                    />
                  </label>
                  {isStayBookingObject(activeRoom) ? (
                    <label className="gpb-price-input">
                      Цена доп. места
                      <input
                        inputMode="numeric"
                        placeholder="Бесплатно"
                        type="text"
                        value={getPriceInputValue(activeRoom.extraBedPrice, focusedPriceRoomId === `${activeRoom.id}:extra`)}
                        onBlur={() => setFocusedPriceRoomId(null)}
                        onChange={(event) => updateActiveRoom({ extraBedPrice: parsePriceInput(event.target.value) })}
                        onFocus={() => setFocusedPriceRoomId(`${activeRoom.id}:extra`)}
                      />
                    </label>
                  ) : null}
                </div>
                <div className="gpb-dynamic-pricing-settings">
                  <label className="gpb-checkbox-row gpb-dynamic-pricing-toggle">
                    <input
                      type="checkbox"
                      checked={dynamicPricingEnabled}
                      onChange={(event) => onDynamicPricingChange({ dynamicPricingEnabled: event.target.checked })}
                    />
                    <span>Автоматический расчет по заполняемости</span>
                  </label>
                  <label>
                    Маржа сверху, %
                    <input
                      inputMode="numeric"
                      placeholder="Авто"
                      type="text"
                      value={dynamicPricingMarginPercent ? String(dynamicPricingMarginPercent) : ""}
                      onChange={(event) => onDynamicPricingChange({ dynamicPricingMarginPercent: clampNumber(toNumber(event.target.value.replace(/\D/g, ""), 0), 0, 100) })}
                    />
                  </label>
                  <label>
                    До конца сезона
                    <input
                      type="date"
                      value={dynamicPricingSeasonEnd}
                      onChange={(event) => onDynamicPricingChange({ dynamicPricingSeasonEnd: event.target.value })}
                    />
                  </label>
                  <small>
                    При включении карточки берут цену от расходов, свободных номеро-ночей и заполняемости. Цены в базе каталога не перезаписываются.
                  </small>
                </div>
                <div className="gpb-holiday-settings">
                  <button type="button" onClick={() => setIsHolidayCalendarOpen((current) => !current)}>
                    Настроить праздники
                  </button>
                  {isHolidayCalendarOpen ? (
                    <HolidayDatePicker
                      dates={customHolidayDates}
                      month={holidayCalendarMonth}
                      onMonthChange={setHolidayCalendarMonth}
                      onToggleDate={(date) => onCustomHolidayDatesChange(customHolidayDates.includes(date)
                        ? customHolidayDates.filter((item) => item !== date)
                        : customHolidayDates.concat(date))}
                    />
                  ) : null}
                  {customHolidayDates.length ? (
                    <div className="gpb-holiday-chips">
                      {customHolidayDates.map((date) => (
                        <span key={date}>
                          {formatShortDateText(date)}
                          <button type="button" onClick={() => onCustomHolidayDatesChange(customHolidayDates.filter((item) => item !== date))} title="Удалить дату">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="gpb-editor-section">
                <div className="gpb-editor-title">
                  <BedDouble size={20} />
                  <h2>Спальные места</h2>
                </div>
                <SleepingPlacesEditor
                  customOptions={customSleepingPlaceOptions}
                  places={activeRoom.sleepingPlaces}
                  onCustomOptionsChange={onCustomSleepingPlaceOptionsChange}
                  onChange={(sleepingPlaces) => updateActiveRoom({ sleepingPlaces })}
                />
              </section>

              <section className="gpb-editor-section">
                <div className="gpb-editor-title">
                  <Utensils size={20} />
                  <h2>Питание</h2>
                </div>
                <label className="gpb-wide-label">
                  Что входит
                  <div className="gpb-amenity-grid">
                    {getFoodOptions(customFoodOptions).map((item) => {
                      const isActive = parseAmenities(activeRoom.amenities).includes(item);
                      return (
                        <span
                          className={isActive ? "is-active" : ""}
                          key={item}
                        >
                          <button type="button" onClick={() => toggleAmenity(item)}>
                            {item}
                          </button>
                          {isActive ? (
                            <button type="button" onClick={() => removeAmenity(item)} title="Удалить">
                              <X size={13} />
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                    <button className="gpb-chip-add-button" type="button" onClick={() => setIsFoodCreateOpen(true)} title="Добавить питание">
                      <Plus size={16} />
                    </button>
                  </div>
                </label>
              </section>

              <section className="gpb-editor-section">
                <div className="gpb-editor-title">
                  <Image size={20} />
                  <h2>Медиа</h2>
                </div>
                <div className="gpb-media-grid">
                  <button type="button" onClick={() => photoInputRef.current?.click()}>
                    <Image size={22} />
                    <span>Добавить фото</span>
                  </button>
                  <button type="button" onClick={() => videoInputRef.current?.click()}>
                    <Video size={22} />
                    <span>Добавить видео</span>
                  </button>
                  <button type="button" onClick={() => void downloadActiveRoomMedia("photo")} disabled={!activeRoom.photoPaths.length}>
                    <Download size={22} />
                    <span>Скачать фото</span>
                  </button>
                  <button type="button" onClick={() => void downloadActiveRoomMedia("video")} disabled={!activeRoom.videoPaths.length}>
                    <Download size={22} />
                    <span>Скачать видео</span>
                  </button>
                </div>
                {mediaError ? <div className="gpb-media-error">{mediaError}</div> : null}
                <input
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.hec"
                  hidden
                  ref={photoInputRef}
                  type="file"
                  onChange={(event) => handleMediaUpload(event.target.files)}
                />
                <input
                  accept="video/mp4,video/quicktime,video/x-m4v,.mov"
                  hidden
                  ref={videoInputRef}
                  type="file"
                  onChange={(event) => handleMediaUpload(event.target.files)}
                />
                {activeRoom.photoPaths.length || activeRoom.videoPaths.length ? (
                  <div className="gpb-gallery">
                    {activeRoom.photoPaths.map((path, index) => (
                      <div className="gpb-gallery-item" key={path}>
                        <MediaImage alt={`${activeRoom.title} фото ${index + 1}`} path={path} />
                        {index === 0 ? <span>Главное</span> : null}
                        {index > 0 ? (
                          <button className="gpb-gallery-main" type="button" onClick={() => setPhotoAsMain(path)} title="Сделать главным">
                            <MoveUp size={16} />
                          </button>
                        ) : null}
                        <button className="gpb-gallery-crop" type="button" onClick={() => setCropPath(path)} title="Обрезать фото">
                          <Crop size={16} />
                        </button>
                        <button type="button" onClick={() => handleMediaDelete(path)} title="Удалить фото">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {activeRoom.videoPaths.map((path) => (
                      <div className="gpb-gallery-item" key={path}>
                        <MediaVideo path={path} />
                        <span>Видео</span>
                        <button type="button" onClick={() => handleMediaDelete(path)} title="Удалить видео">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="gpb-editor-section">
                <div className="gpb-editor-title">
                  <Banknote size={20} />
                  <h2>Удобства</h2>
                </div>
                <label className="gpb-wide-label">
                  Удобства
                  <div className="gpb-amenity-grid">
                    {getAmenityOptionsForRoom(activeRoom.amenities, customAmenityOptions).map((amenity) => {
                      const isActive = parseAmenities(activeRoom.amenities).includes(amenity);
                      return (
                        <span
                          className={isActive ? "is-active" : ""}
                          key={amenity}
                        >
                          <button type="button" onClick={() => toggleAmenity(amenity)}>
                            {amenity}
                          </button>
                          {isActive ? (
                            <button type="button" onClick={() => removeAmenity(amenity)} title="Удалить">
                              <X size={13} />
                            </button>
                          ) : null}
                        </span>
                      );
                    })}
                    <button className="gpb-chip-add-button" type="button" onClick={() => setIsAmenityCreateOpen(true)} title="Добавить удобство">
                      <Plus size={16} />
                    </button>
                  </div>
                </label>
                <label className="gpb-wide-label">
                  Дополнительно
                  <input
                    placeholder="Например: теплый пол, отдельный вход"
                    value={getCustomAmenities(activeRoom.amenities)}
                    onChange={(event) => updateCustomAmenities(activeRoom.amenities, event.target.value, updateActiveRoom)}
                  />
                </label>
                <label className="gpb-wide-label">
                  Заметки для администратора
                  <textarea
                    placeholder="Не отправляется клиенту. Например: солнечная сторона, лучше предлагать семьям."
                    value={activeRoom.adminNotes}
                    onChange={(event) => updateActiveRoom({ adminNotes: event.target.value })}
                  />
                </label>
              </section>
            </div>

            <footer className="gpb-catalog-footer">
              <span className={`gpb-save-state is-${saveState}`}>
                {saveState === "saving"
                  ? "Сохраняю..."
                  : saveState === "saved"
                    ? "Сохранено"
                    : saveState === "error"
                      ? "Ошибка сохранения"
                      : loadState === "loading"
                        ? "Загрузка каталога..."
                        : ""}
              </span>
              <button className="gpb-secondary" type="button" onClick={onClose}>Закрыть</button>
              <button className="gpb-primary" type="button" onClick={handleSave} disabled={saveState === "saving"}>
                Сохранить сейчас
              </button>
            </footer>
          </main>
          ) : (
            <main className="gpb-room-editor">
              <div className="gpb-empty-editor-state">
                <Hotel size={32} />
                <strong>Создайте объект</strong>
                <span>Здесь появятся настройки номера, группы, этажа, цены, фото и описания.</span>
              </div>
              <footer className="gpb-catalog-footer">
                <span className={`gpb-save-state is-${saveState}`}>
                  {loadState === "loading" ? "Загрузка каталога..." : ""}
                </span>
                <button className="gpb-secondary" type="button" onClick={onClose}>Закрыть</button>
                <button className="gpb-primary" type="button" onClick={() => setIsCreateOpen(true)}>
                  Создать
                </button>
              </footer>
            </main>
          )}

          {activeRoom ? (
          <aside className="gpb-preview-panel">
            <section className="gpb-price-summary-card">
              <div>
                <strong>Сводка цен</strong>
                <span>{catalogPriceSummary.count} объектов в продаже</span>
              </div>
              <dl>
                <div>
                  <dt>Будни</dt>
                  <dd>{formatPrice(catalogPriceSummary.weekdayTotal)}</dd>
                </div>
                <div>
                  <dt>Выходные</dt>
                  <dd>{formatPrice(catalogPriceSummary.weekendTotal)}</dd>
                </div>
                <div>
                  <dt>Праздники РК</dt>
                  <dd>{formatPrice(catalogPriceSummary.holidayTotal)}</dd>
                </div>
              </dl>
            </section>
            <div className="gpb-preview-card">
              <PreviewCarousel room={activeRoom} />
              <div className="gpb-preview-content">
                <div className="gpb-whatsapp-bubble">
                  {buildWhatsAppPreview(activeRoom, defaultCheckInTime, defaultCheckOutTime)}
                </div>
                <div className="gpb-whatsapp-media-note">
                  {getWhatsAppMediaItems(activeRoom).length
                    ? `К отправке: ${getWhatsAppMediaItems(activeRoom).length} медиа. Первое фото будет главным.`
                    : "Медиа для отправки пока нет."}
                </div>
              </div>
            </div>
          </aside>
          ) : (
            <aside className="gpb-preview-panel">
              <div className="gpb-preview-empty">
                <Image size={28} />
                <span>Предпросмотр появится после создания объекта.</span>
              </div>
            </aside>
          )}
        </div>
        {cropPath && activeRoom ? (
          <CropModal
            path={cropPath}
            title={activeRoom.title}
            onClose={() => setCropPath(null)}
            onSave={handleCropSave}
          />
        ) : null}
        {isCreateOpen ? (
          <CreateObjectModal
            defaultGroup={activeGroup}
            groupSuggestions={getGroupSuggestions(rooms)}
            nextNumber={getNextRoomNumber(rooms)}
            onClose={() => setIsCreateOpen(false)}
            onCreate={createCatalogObject}
          />
        ) : null}
        {isAmenityCreateOpen ? (
          <CreateNameModal
            title="Добавить удобство"
            label="Название удобства"
            placeholder="Например: Теплый пол"
            onClose={() => setIsAmenityCreateOpen(false)}
            onSave={(title) => void createCustomAmenity(title)}
          />
        ) : null}
        {isFoodCreateOpen ? (
          <CreateNameModal
            title="Добавить питание"
            label="Название"
            placeholder="Например: Завтрак шведский стол"
            onClose={() => setIsFoodCreateOpen(false)}
            onSave={(title) => void (async () => {
              const name = title.trim();
              if (!name) return;
              if (!customFoodOptions.some((item) => item.toLowerCase() === name.toLowerCase())) {
                await onCustomFoodOptionsChange(customFoodOptions.concat(name));
              }
              addAmenityToActiveRoom(name);
              setIsFoodCreateOpen(false);
            })()}
          />
        ) : null}
        {deleteRoomTarget ? (
          <ConfirmActionModal
            title="Удалить объект?"
            description={`${deleteRoomTarget.title} · действие нельзя отменить`}
            confirmLabel="Удалить"
            tone="danger"
            onClose={() => setDeleteRoomTarget(null)}
            onConfirm={() => void handleDeleteRoom(deleteRoomTarget)}
          />
        ) : null}
      </div>
    </div>
  );
}

function PreviewCarousel({ room }: { room: Room }) {
  const mediaItems = getWhatsAppMediaItems(room);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = mediaItems[Math.min(activeIndex, Math.max(mediaItems.length - 1, 0))];

  useEffect(() => {
    setActiveIndex(0);
  }, [room.id, room.photoPaths.length, room.videoPaths.length]);

  function move(direction: -1 | 1) {
    setActiveIndex((index) => {
      if (!mediaItems.length) return 0;
      return (index + direction + mediaItems.length) % mediaItems.length;
    });
  }

  return (
    <div className="gpb-preview-carousel">
      <div className="gpb-preview-media">
        {activeItem ? (
          activeItem.type === "photo" ? (
            <MediaImage alt={room.title} path={activeItem.path} />
          ) : (
            <MediaVideo path={activeItem.path} />
          )
        ) : (
          <Image size={28} />
        )}
        {mediaItems.length > 1 ? (
          <>
            <button className="gpb-carousel-prev" type="button" onClick={() => move(-1)} title="Назад">
              <ChevronLeft size={18} />
            </button>
            <button className="gpb-carousel-next" type="button" onClick={() => move(1)} title="Вперед">
              <ChevronRight size={18} />
            </button>
            <span className="gpb-carousel-count">{activeIndex + 1}/{mediaItems.length}</span>
          </>
        ) : null}
      </div>
      {mediaItems.length ? (
        <div className="gpb-carousel-thumbs">
          {mediaItems.map((item, index) => (
            <button
              className={index === activeIndex ? "is-active" : ""}
              key={item.path}
              type="button"
              onClick={() => setActiveIndex(index)}
              title={item.type === "photo" ? "Фото" : "Видео"}
            >
              {item.type === "photo" ? <MediaImage alt={`${room.title} ${index + 1}`} path={item.path} /> : <MediaVideo path={item.path} />}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RoomCatalogThumb({ room }: { room: Room }) {
  const firstPhoto = getMainPhotoPath(room);

  if (firstPhoto) {
    return (
      <span className="gpb-panel-object-thumb">
        <MediaImage alt={room.title || room.number} path={firstPhoto} />
      </span>
    );
  }

  return (
    <span className="gpb-panel-object-thumb is-empty">
      <CatalogItemIcon room={room} size={18} />
    </span>
  );
}

function PanelObjectPriceGrid({ room, date }: { room: Room; date: string }) {
  const activeType = getPriceTypeForDate(date);
  const weekdayPrice = room.weekdayPrice || room.basePrice || 0;
  const weekendPrice = room.weekendPrice || weekdayPrice;
  const holidayPrice = room.holidayPrice || weekendPrice;
  const prices = [
    { label: "Будни.", type: "weekday", value: weekdayPrice },
    { label: "Вых.", type: "weekend", value: weekendPrice },
    { label: "Празд", type: "holiday", value: holidayPrice }
  ];

  return (
    <span className="gpb-panel-object-prices">
      {prices.map((price) => (
        <span className={activeType === price.type ? "is-active" : ""} key={price.type}>
          <small>{price.label}</small>
          <b>{formatCardPrice(price.value)}</b>
        </span>
      ))}
    </span>
  );
}

function RoomCatalogPreviewMedia({ room }: { room: Room }) {
  const firstPhoto = getMainPhotoPath(room);

  if (!firstPhoto) {
    return (
      <div className="gpb-panel-object-preview-media is-empty">
        <CatalogItemIcon room={room} size={24} />
      </div>
    );
  }

  return (
    <div className="gpb-panel-object-preview-media">
      <MediaImage alt={room.title || room.number} path={firstPhoto} />
    </div>
  );
}

function HolidayDatePicker({
  dates,
  month,
  onMonthChange,
  onToggleDate
}: {
  dates: string[];
  month: string;
  onMonthChange: (month: string) => void;
  onToggleDate: (date: string) => void;
}) {
  const selectedDates = new Set(dates);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthDate = new Date(year, monthNumber - 1, 1);
  const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(monthDate);

  function moveMonth(offset: number) {
    onMonthChange(getMonthInputValue(new Date(year, monthNumber - 1 + offset, 1)));
  }

  return (
    <div className="gpb-holiday-calendar">
      <header>
        <button type="button" onClick={() => moveMonth(-1)} title="Предыдущий месяц">
          <ChevronLeft size={16} />
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" onClick={() => moveMonth(1)} title="Следующий месяц">
          <ChevronRight size={16} />
        </button>
      </header>
      <div className="gpb-holiday-weekdays">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="gpb-holiday-days">
        {getCalendarDays(month).map((day) => (
          <button
            className={[
              day.isCurrentMonth ? "" : "is-muted",
              selectedDates.has(day.date) ? "is-selected" : ""
            ].filter(Boolean).join(" ")}
            key={day.date}
            type="button"
            onClick={() => onToggleDate(day.date)}
          >
            {parseDateInput(day.date).getDate()}
          </button>
        ))}
      </div>
    </div>
  );
}

function RoomListItem({
  activeRoomId,
  draggedRoomId,
  onDragEnd,
  onDragStart,
  onDrop,
  onSelect,
  previousGroup,
  room
}: {
  activeRoomId: string;
  draggedRoomId: string | null;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onSelect: () => void;
  previousGroup?: string;
  room: Room;
}) {
  const isNewGroup = room.group !== previousGroup;

  return (
    <>
      {isNewGroup ? <div className="gpb-room-group-title">{room.group || "Без группы"}</div> : null}
      <button
        className={[
          room.id === activeRoomId ? "is-active" : "",
          room.id === draggedRoomId ? "is-dragging" : ""
        ].filter(Boolean).join(" ")}
        draggable
        type="button"
        onClick={onSelect}
        onDragEnd={onDragEnd}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={onDragStart}
        onDrop={(event) => {
          event.preventDefault();
          onDrop();
        }}
      >
        <CatalogItemIcon room={room} />
        <span>
          <strong>{shouldShowObjectNumber(room) ? room.number || "Без номера" : room.title || getObjectTypeLabel(room)}</strong>
          <small>{shouldShowObjectNumber(room) ? room.title || getObjectTypeLabel(room) : getObjectTypeLabel(room)}</small>
        </span>
      </button>
    </>
  );
}

function SleepingPlacesEditor({
  customOptions,
  onCustomOptionsChange,
  places,
  onChange
}: {
  customOptions: string[];
  onCustomOptionsChange: (options: string[]) => Promise<void>;
  places: SleepingPlace[];
  onChange: (places: SleepingPlace[]) => void;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  async function addPlace(input: { count: number; placesCount: number; title?: string; type: SleepingPlaceType }) {
    const place = createSleepingPlace(input.type);
    if (input.type === "custom" && input.title && !customOptions.some((item) => item.toLowerCase() === input.title?.toLowerCase())) {
      await onCustomOptionsChange(customOptions.concat(input.title));
    }
    onChange(places.concat({
      ...place,
      title: input.title || place.title,
      count: Math.max(1, input.count),
      placesCount: Math.max(0, input.placesCount)
    }));
    setIsCreateOpen(false);
  }

  function removePlace(id: string) {
    onChange(places.filter((place) => place.id !== id));
  }

  return (
    <div className="gpb-sleeping-editor">
      <div className="gpb-sleeping-chip-grid">
        {places.map((place) => (
          <span key={place.id}>
            <button type="button">
              {place.title}: {place.count} / мест {getSleepingPlacePlacesCount(place)}
            </button>
            <button type="button" onClick={() => removePlace(place.id)} title="Удалить">
              <X size={13} />
            </button>
          </span>
        ))}
        <button className="gpb-chip-add-button" type="button" onClick={() => setIsCreateOpen(true)} title="Добавить спальное место">
          <Plus size={16} />
        </button>
      </div>
      {!places.length ? <div className="gpb-empty-state">Добавьте двуспальные, односпальные кровати или диваны.</div> : null}
      {isCreateOpen ? (
        <CreateSleepingPlaceModal
          customOptions={customOptions}
          onClose={() => setIsCreateOpen(false)}
          onSave={(input) => void addPlace(input)}
        />
      ) : null}
    </div>
  );
}

function CreateNameModal({
  label,
  onClose,
  onSave,
  placeholder,
  title
}: {
  label: string;
  onClose: () => void;
  onSave: (value: string) => void;
  placeholder: string;
  title: string;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = value.trim();
    if (!title) return;
    onSave(title);
  }

  return (
    <div className="gpb-create-backdrop gpb-settings-field-backdrop">
      <form className="gpb-create-modal gpb-small-create-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label={title}>
        <header className="gpb-create-header">
          <div>
            <strong>{title}</strong>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-create-form gpb-single-field-form">
          <label>
            {label}
            <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} />
          </label>
        </div>
        <footer className="gpb-create-footer">
          <button type="button" className="gpb-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="gpb-primary">Сохранить</button>
        </footer>
      </form>
    </div>
  );
}

function CreateSleepingPlaceModal({
  customOptions,
  onClose,
  onSave
}: {
  customOptions: string[];
  onClose: () => void;
  onSave: (input: { count: number; placesCount: number; title?: string; type: SleepingPlaceType }) => void;
}) {
  const [type, setType] = useState<SleepingPlaceType>("double-bed");
  const [selectedCustomTitle, setSelectedCustomTitle] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [count, setCount] = useState(1);
  const [placesCount, setPlacesCount] = useState(2);

  function handleTypeChange(nextType: SleepingPlaceType) {
    const option = SLEEPING_PLACE_OPTIONS.find((item) => item.value === nextType) ?? SLEEPING_PLACE_OPTIONS[0];
    setType(nextType);
    setSelectedCustomTitle("");
    setCustomTitle("");
    setCount(1);
    setPlacesCount(option.capacity);
  }

  function handleSelectChange(value: string) {
    if (value.startsWith("custom:")) {
      const title = value.replace(/^custom:/, "");
      setType("custom");
      setSelectedCustomTitle(title);
      setCustomTitle("");
      setCount(1);
      setPlacesCount(1);
      return;
    }
    handleTypeChange(value as SleepingPlaceType);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = selectedCustomTitle || customTitle.trim();
    if (type === "custom" && !title) return;
    onSave({ count, placesCount, title, type });
  }

  return (
    <div className="gpb-create-backdrop gpb-settings-field-backdrop">
      <form className="gpb-create-modal gpb-small-create-modal" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-label="Добавить спальное место">
        <header className="gpb-create-header">
          <div>
            <strong>Добавить спальное место</strong>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </header>
        <div className="gpb-create-form gpb-sleeping-create-form">
          <label>
            Тип
            <select value={selectedCustomTitle ? `custom:${selectedCustomTitle}` : type} onChange={(event) => handleSelectChange(event.target.value)}>
              {SLEEPING_PLACE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              {customOptions.map((option) => <option key={option} value={`custom:${option}`}>{option}</option>)}
            </select>
          </label>
          {type === "custom" ? (
            <label>
              Название
              <input
                autoFocus
                value={selectedCustomTitle || customTitle}
                onChange={(event) => {
                  setSelectedCustomTitle("");
                  setCustomTitle(event.target.value);
                }}
                placeholder="Например: Топчан"
              />
            </label>
          ) : null}
          <label>
            Кол-во
            <input min="1" type="number" value={count} onChange={(event) => setCount(toNumber(event.target.value, 1))} />
          </label>
          <label>
            Мест
            <input min="0" type="number" value={placesCount} onChange={(event) => setPlacesCount(toNumber(event.target.value, 0))} />
          </label>
        </div>
        <footer className="gpb-create-footer">
          <button type="button" className="gpb-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="gpb-primary">Сохранить</button>
        </footer>
      </form>
    </div>
  );
}

type CreateCatalogObjectInput = {
  category: Room["category"];
  floor: string;
  group: string;
  number: string;
  objectType: Room["objectType"];
  roomClass: string;
};

function CreateObjectModal({
  defaultGroup,
  groupSuggestions,
  nextNumber,
  onClose,
  onCreate
}: {
  defaultGroup: string;
  groupSuggestions: string[];
  nextNumber: string;
  onClose: () => void;
  onCreate: (input: CreateCatalogObjectInput) => void;
}) {
  const [selectedType, setSelectedType] = useState<Room["objectType"]>("room");
  const [number, setNumber] = useState(nextNumber);
  const [roomClass, setRoomClass] = useState("");
  const [group, setGroup] = useState(defaultGroup);
  const [floor, setFloor] = useState(FLOOR_OPTIONS[0]);
  const selectedOption = getCreateTypeOption(selectedType);

  function handleCreate() {
    onCreate({
      category: selectedOption.category,
      floor,
      group,
      number,
      objectType: selectedOption.objectType,
      roomClass: selectedOption.category === "guest-room" ? roomClass : ""
    });
  }

  return (
    <div className="gpb-create-backdrop">
      <div className="gpb-create-modal" role="dialog" aria-modal="true" aria-label="Создание объекта">
        <header className="gpb-create-header">
          <div>
            <strong>Создать объект</strong>
            <span>Номер, домик, сауна, беседка, гараж или любая своя позиция.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="gpb-create-form">
          <label>
            Тип
            <select
              value={selectedType}
              onChange={(event) => {
                const nextType = event.target.value as Room["objectType"];
                const nextOption = getCreateTypeOption(nextType);
                setSelectedType(nextType);
                if (nextOption.category !== "guest-room") {
                  setRoomClass("");
                  setNumber("");
                } else if (!number.trim()) {
                  setNumber(nextNumber);
                }
              }}
            >
              {CREATE_TYPE_OPTIONS.map((option) => (
                <option key={option.objectType} value={option.objectType}>{option.label}</option>
              ))}
            </select>
          </label>
          {selectedOption.category === "guest-room" ? (
            <label>
              Номер
              <input value={number} onChange={(event) => setNumber(event.target.value)} />
            </label>
          ) : null}
          {selectedOption.category === "guest-room" ? (
            <label>
              Класс
              <select value={roomClass} onChange={(event) => setRoomClass(event.target.value)}>
                <option value="">Не указан</option>
                {ROOM_CLASS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Группа
            <input
              list="gpb-create-room-groups"
              placeholder="Например: Блок А"
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            />
          </label>
          <datalist id="gpb-create-room-groups">
            {groupSuggestions.map((groupName) => (
              <option key={groupName} value={groupName} />
            ))}
          </datalist>
          <label>
            Этаж
            <select value={floor} onChange={(event) => setFloor(event.target.value)}>
              {FLOOR_OPTIONS.map((floorOption) => (
                <option key={floorOption} value={floorOption}>{floorOption}</option>
              ))}
            </select>
          </label>
        </div>

        <footer className="gpb-create-footer">
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button className="gpb-primary" type="button" onClick={handleCreate}>Создать</button>
        </footer>
      </div>
    </div>
  );
}

const CROP_PRESETS = [
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "1:1", ratio: 1 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 }
];

function CropModal({
  onClose,
  onSave,
  path,
  title
}: {
  onClose: () => void;
  onSave: (options: { aspectRatio: number; focalX: number; focalY: number; path: string }) => Promise<void>;
  path: string;
  title: string;
}) {
  const [aspectRatio, setAspectRatio] = useState(4 / 3);
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [isSaving, setIsSaving] = useState(false);
  const objectUrl = useMediaObjectUrl(path);

  async function handleSave() {
    setIsSaving(true);
    await onSave({ aspectRatio, focalX, focalY, path });
    setIsSaving(false);
  }

  return (
    <div className="gpb-crop-backdrop">
      <div className="gpb-crop-modal" role="dialog" aria-modal="true" aria-label="Обрезка фото">
        <header className="gpb-crop-header">
          <div>
            <strong>Обрезка фото</strong>
            <span>{title}</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={20} />
          </button>
        </header>
        <div className="gpb-crop-body">
          <div className="gpb-crop-stage" style={{ aspectRatio }}>
            {objectUrl ? (
              <img
                alt={title}
                src={objectUrl}
                style={{ objectPosition: `${focalX}% ${focalY}%` }}
              />
            ) : (
              <div className="gpb-media-placeholder">
                <Image size={24} />
                <span>Загрузка</span>
              </div>
            )}
          </div>
          <aside className="gpb-crop-controls">
            <label>
              Формат
              <div className="gpb-crop-presets">
                {CROP_PRESETS.map((preset) => (
                  <button
                    className={aspectRatio === preset.ratio ? "is-active" : ""}
                    key={preset.label}
                    type="button"
                    onClick={() => setAspectRatio(preset.ratio)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Сдвиг по горизонтали
              <input max="100" min="0" type="range" value={focalX} onChange={(event) => setFocalX(Number(event.target.value))} />
            </label>
            <label>
              Сдвиг по вертикали
              <input max="100" min="0" type="range" value={focalY} onChange={(event) => setFocalY(Number(event.target.value))} />
            </label>
          </aside>
        </div>
        <footer className="gpb-crop-footer">
          <button className="gpb-secondary" type="button" onClick={onClose}>Отмена</button>
          <button className="gpb-primary" type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Сохраняю..." : "Сохранить обрезку"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function createCustomObject({
  category,
  floor,
  group,
  nextNumber,
  number,
  objectType,
  roomClass,
  sortOrder
}: {
  category: Room["category"];
  floor: string;
  group: string;
  nextNumber: string;
  number: string;
  objectType: Room["objectType"];
  roomClass: string;
  sortOrder: number;
}): Room {
  const fallbackTitle = getCreateFallbackTitle({ category, objectType }, nextNumber);
  const title = roomClass || fallbackTitle;
  const objectNumber = number.trim() || (category === "guest-room" ? nextNumber : createObjectCode(title));

  return {
    id: `object-custom-${Date.now()}`,
    number: objectNumber,
    title,
    sortOrder,
    group,
    category,
    objectType,
    bookable: category !== "staff-room",
    includedInStay: false,
    status: "active",
    excludeFromBookingSummary: false,
    hideInBookingPanel: false,
    basePrice: 0,
    weekdayPrice: 0,
    weekendPrice: 0,
    holidayPrice: 0,
    floor,
    occupancyLabel: roomClass,
    bathroomType: getDefaultBathroomType(objectType),
    capacityAdults: category === "amenity" ? 1 : 2,
    capacityChildren: 0,
    extraBeds: 0,
    extraBedEnabled: false,
    extraBedPrice: 5000,
    extraBedDescription: "Надувная кровать высотой 60 см, полноценное спальное место для ребенка",
    beds: "",
    sleepingPlaces: [],
    description: "",
    amenities: "",
    adminNotes: "",
    photoPaths: [],
    videoPaths: []
  };
}

function MediaImage({ alt, path }: { alt: string; path: string }) {
  const objectUrl = useMediaObjectUrl(path);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [path]);

  if (!objectUrl || hasError) {
    return (
      <div className="gpb-media-placeholder">
        <Image size={22} />
        <span>{isHeicPath(path) ? "HEIC без превью" : "Нет превью"}</span>
      </div>
    );
  }

  return <img alt={alt} src={objectUrl} onError={() => setHasError(true)} />;
}

function MediaVideo({ path }: { path: string }) {
  const objectUrl = useMediaObjectUrl(path);

  if (!objectUrl) {
    return (
      <div className="gpb-media-placeholder">
        <Video size={22} />
        <span>Нет превью</span>
      </div>
    );
  }

  return <video muted src={objectUrl} />;
}

function useMediaObjectUrl(path: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let nextObjectUrl: string | null = null;

    async function loadMedia() {
      try {
        const response = await fetch(getMediaUrl(path));
        if (!response.ok) {
          throw new Error(`Media fetch failed: ${response.status}`);
        }

        const blob = await response.blob();
        nextObjectUrl = URL.createObjectURL(blob);
        if (isMounted) {
          setObjectUrl(nextObjectUrl);
        }
      } catch {
        if (isMounted) {
          setObjectUrl(null);
        }
      }
    }

    setObjectUrl(null);
    loadMedia();

    return () => {
      isMounted = false;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [path]);

  return objectUrl;
}

function mergeRooms(loadedRooms: Room[]) {
  const normalizedRooms = loadedRooms.map((room, index) => ({
    ...room,
    id: room.id || createRoomId(room.number),
    sortOrder: Number.isFinite(room.sortOrder) ? room.sortOrder : index,
    group: room.group || getDefaultGroup(room.category ?? getDefaultCategory(room.number)),
    category: room.category ?? getDefaultCategory(room.number),
    objectType: room.objectType ?? getDefaultObjectType(room.category ?? getDefaultCategory(room.number)),
    bookable: typeof room.bookable === "boolean" ? room.bookable : getDefaultBookable(room.number),
    includedInStay: typeof room.includedInStay === "boolean" ? room.includedInStay : getDefaultIncludedInStay(room.id),
    status: room.status ?? "active",
    excludeFromBookingSummary: Boolean(room.excludeFromBookingSummary),
    hideInBookingPanel: Boolean(room.hideInBookingPanel),
    basePrice: room.basePrice ?? room.weekdayPrice ?? 0,
    weekdayPrice: room.weekdayPrice ?? room.basePrice ?? 0,
    weekendPrice: room.weekendPrice ?? room.basePrice ?? room.weekdayPrice ?? 0,
    holidayPrice: room.holidayPrice ?? room.weekendPrice ?? room.basePrice ?? room.weekdayPrice ?? 0,
    occupancyLabel: room.occupancyLabel ?? "",
    bathroomType: room.bathroomType ?? getDefaultBathroomType(room.objectType ?? getDefaultObjectType(room.category ?? getDefaultCategory(room.number))),
    sleepingPlaces: Array.isArray(room.sleepingPlaces) ? room.sleepingPlaces : [],
    extraBedEnabled: room.extraBedEnabled ?? false,
    extraBedPrice: room.extraBedPrice ?? 5000,
    extraBedDescription: room.extraBedDescription ?? "Надувная кровать высотой 60 см, полноценное спальное место для ребенка"
  }));
  return withSortOrder(normalizedRooms.sort((left, right) => left.sortOrder - right.sortOrder));
}

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createRoomId(number: string) {
  return `room-${number}`;
}

function withSortOrder(rooms: Room[]) {
  return rooms.map((room, index) => ({
    ...room,
    sortOrder: index
  }));
}

function getNextRoomNumber(rooms: Room[]) {
  const maxNumber = rooms.reduce((max, room) => {
    const value = Number(room.number);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  return String(maxNumber + 1 || 1);
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addHoursToTimeInput(time: string, hours: number) {
  const [rawHours, rawMinutes] = time.split(":").map(Number);
  const startHours = Number.isFinite(rawHours) ? rawHours : 0;
  const startMinutes = Number.isFinite(rawMinutes) ? rawMinutes : 0;
  const totalMinutes = (startHours * 60 + startMinutes + Math.max(0, hours) * 60) % (24 * 60);
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function getMonthInputValue(date: Date) {
  return formatDateInput(date).slice(0, 7);
}

function getCalendarDays(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const gridStart = new Date(firstDay);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  gridStart.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date: formatDateInput(date),
      isCurrentMonth: date.getMonth() === firstDay.getMonth()
    };
  });
}

function getMonthTimelineDays(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0);
  const weekdayFormatter = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });

  return Array.from({ length: lastDay.getDate() }, (_, index) => {
    const date = new Date(year, month - 1, index + 1);
    const weekday = date.getDay();
    return {
      date: formatDateInput(date),
      dayNumber: index + 1,
      weekday: weekdayFormatter.format(date).replace(".", ""),
      isWeekend: weekday === 0 || weekday === 6
    };
  });
}

async function getWeatherForecastForDate(date: string, latitude: number, longitude: number): Promise<WeatherForecast | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    hourly: "temperature_2m,precipitation_probability",
    timezone: "Asia/Almaty",
    forecast_days: "16"
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Weather request failed: ${response.status}`);
  }

  const data = await response.json() as {
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
    };
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation_probability?: number[];
    };
  };
  const index = data.daily?.time?.indexOf(date) ?? -1;
  if (index < 0) return null;

  return {
    dayParts: buildWeatherDayParts(date, data.hourly),
    date,
    maxTemperature: data.daily?.temperature_2m_max?.[index] ?? Number.NaN,
    minTemperature: data.daily?.temperature_2m_min?.[index] ?? Number.NaN,
    precipitationProbability: data.daily?.precipitation_probability_max?.[index] ?? Number.NaN,
    weatherCode: data.daily?.weather_code?.[index] ?? 0
  };
}

function buildWeatherDayParts(date: string, hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: number[] }): WeatherDayPart[] {
  const parts = [
    { label: "Ночь", hours: [0, 1, 2, 3, 4, 5] },
    { label: "Утро", hours: [6, 7, 8, 9, 10, 11] },
    { label: "День", hours: [12, 13, 14, 15, 16, 17] },
    { label: "Вечер", hours: [18, 19, 20, 21, 22, 23] }
  ];

  return parts.map((part) => {
    const values = part.hours
      .map((hour) => {
        const hourText = String(hour).padStart(2, "0");
        const index = hourly?.time?.indexOf(`${date}T${hourText}:00`) ?? -1;
        return {
          precipitation: index >= 0 ? hourly?.precipitation_probability?.[index] : undefined,
          temperature: index >= 0 ? hourly?.temperature_2m?.[index] : undefined
        };
      })
      .filter((value) => Number.isFinite(value.temperature));

    const temperature = values.length
      ? values.reduce((sum, value) => sum + Number(value.temperature), 0) / values.length
      : Number.NaN;
    const precipitationProbability = values.length
      ? Math.max(...values.map((value) => Number(value.precipitation ?? 0)))
      : Number.NaN;

    return {
      label: part.label,
      precipitationProbability,
      temperature
    };
  });
}

function getWeatherDescription(code: number) {
  if (code === 0) return "Ясно";
  if ([1, 2, 3].includes(code)) return "Переменная облачность";
  if ([45, 48].includes(code)) return "Туман";
  if ([51, 53, 55, 56, 57].includes(code)) return "Морось";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Дождь";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Снег";
  if ([95, 96, 99].includes(code)) return "Гроза";
  return "Погода";
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getNightsCount(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return 1;
  const difference = parseDateInput(checkOut).getTime() - parseDateInput(checkIn).getTime();
  return Math.max(1, Math.ceil(difference / 86_400_000));
}

function isRoomReserved(room: Room, checkIn: string, checkOut: string, checkInTime: string, checkOutTime: string, reservations: Reservation[]) {
  if (isHourlyBookingObject(room)) {
    return getHourlyRoomTimeConflicts(room, reservations, checkIn, checkInTime, checkOutTime).length > 0;
  }

  return reservations.some((reservation) =>
    reservation.status === "booked" &&
    getReservationItems(reservation).some((item) =>
      item.roomId === room.id &&
      dateRangesOverlap(checkIn, checkOut, item.checkIn, item.checkOut)
    )
  );
}

function isRoomAvailableInBookingPanel(room: Room) {
  return room.bookable && room.status === "active" && !room.hideInBookingPanel;
}

function isRoomIncludedInBookingSummary(room: Room) {
  return !room.excludeFromBookingSummary && room.status === "active";
}

function getCatalogPanelCounter(rooms: Room[]) {
  return rooms.filter((room) => isStayBookingObject(room) && isRoomIncludedInBookingSummary(room)).length;
}

function buildRoomAvailabilityConflicts(rooms: Room[], reservations: Reservation[], checkIn: string, checkOut: string): AvailabilityConflict[] {
  return rooms
    .filter((room) => room.bookable && (isStayBookingObject(room) || isHourlyBookingObject(room)))
    .flatMap((room) =>
      reservations
        .filter((reservation) => {
          if (reservation.status !== "booked") return false;
          if (isHourlyBookingObject(room)) {
            return reservation.roomIds.includes(room.id) && reservation.checkIn === checkIn;
          }
          return getReservationItems(reservation).some((item) =>
            item.roomId === room.id && dateRangesOverlap(checkIn, checkOut, item.checkIn, item.checkOut)
          );
        })
        .map((reservation) => ({
          busyFrom: isHourlyBookingObject(room) ? reservation.checkInTime : undefined,
          busyTo: isHourlyBookingObject(room) ? getReservationHourlyEndTime(reservation) : undefined,
          releaseDate: reservation.checkOut,
          reservation,
          room
        }))
    )
    .sort((left, right) =>
      left.releaseDate.localeCompare(right.releaseDate) ||
      formatBookingPickerObjectLabel(left.room).localeCompare(formatBookingPickerObjectLabel(right.room), "ru")
    );
}

function buildHourlyBusySlotsByRoomId(rooms: Room[], reservations: Reservation[], date: string) {
  return rooms
    .filter(isHourlyBookingObject)
    .reduce<Record<string, Array<{ from: string; to: string; reservation: Reservation }>>>((slotsByRoomId, room) => {
      const slots = reservations
        .filter((reservation) => reservation.status === "booked" && reservation.roomIds.includes(room.id) && reservation.checkIn === date)
        .map((reservation) => ({
          from: reservation.checkInTime,
          reservation,
          to: getReservationHourlyEndTime(reservation)
        }))
        .sort((left, right) => left.from.localeCompare(right.from));
      if (slots.length) slotsByRoomId[room.id] = slots;
      return slotsByRoomId;
    }, {});
}

function getHourlyRoomTimeConflicts(room: Room, reservations: Reservation[], date: string, startTime: string, endTime: string): AvailabilityConflict[] {
  return reservations
    .filter((reservation) =>
      reservation.status === "booked" &&
      reservation.roomIds.includes(room.id) &&
      reservation.checkIn === date &&
      timeRangesOverlap(startTime, endTime, reservation.checkInTime, getReservationHourlyEndTime(reservation))
    )
    .map((reservation) => ({
      busyFrom: reservation.checkInTime,
      busyTo: getReservationHourlyEndTime(reservation),
      releaseDate: reservation.checkOut,
      reservation,
      room
    }));
}

function getCatalogPanelObjectStatus(
  room: Room,
  selectedRoomIds: string[],
  reservations: Reservation[],
  checkIn: string,
  checkOut: string,
  currentReservation: Reservation | null
) {
  if (selectedRoomIds.includes(room.id)) return "Выбран";
  if (currentReservation?.status === "booked" && currentReservation.roomIds.includes(room.id)) return "Забронирован";
  if (room.status === "repair") return "На ремонте";
  if (isRoomCleaningNow(room, reservations)) return "Уборка до 15:00";

  const conflict = reservations.find((reservation) =>
    reservation.status === "booked" &&
    reservation.roomIds.includes(room.id) &&
    (isHourlyBookingObject(room)
      ? reservation.checkIn === checkIn
      : dateRangesOverlap(checkIn, checkOut, reservation.checkIn, reservation.checkOut))
  );

  if (!conflict) return "Свободен";
  if (isHourlyBookingObject(room)) return `Занята ${conflict.checkInTime}-${getReservationHourlyEndTime(conflict)}`;
  return `Занят до ${formatKazakhDate(conflict.checkOut)}`;
}

function isRoomCleaningNow(room: Room, reservations: Reservation[]) {
  if (!isStayBookingObject(room)) return false;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 12 * 60 || minutes >= 15 * 60) return false;
  const today = formatDateInput(now);

  return reservations.some((reservation) =>
    reservation.status === "booked" &&
    reservation.roomIds.includes(room.id) &&
    reservation.checkOut === today
  );
}

function dateRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return parseDateInput(leftStart) < parseDateInput(rightEnd) && parseDateInput(leftEnd) > parseDateInput(rightStart);
}

function isReservationRelevantForCalendarDate(reservation: Pick<Reservation, "checkIn" | "checkOut">, date: string) {
  if (!date) return false;
  const nextDate = formatDateInput(addDays(parseDateInput(date), 1));
  return dateRangesOverlap(date, nextDate, reservation.checkIn, reservation.checkOut) || reservation.checkOut === date;
}

function isBreakfastServedOnDate(reservation: Pick<Reservation, "checkIn" | "checkOut">, date: string) {
  if (!date || !reservation.checkIn || !reservation.checkOut) return false;
  const breakfastDate = parseDateInput(date);
  return parseDateInput(reservation.checkIn) < breakfastDate && parseDateInput(reservation.checkOut) >= breakfastDate;
}

function getReservationHourlyEndTime(reservation: Pick<Reservation, "checkInTime" | "checkOutTime" | "hourlyHours">) {
  return reservation.checkOutTime || addHoursToTimeInput(reservation.checkInTime, Math.max(2, reservation.hourlyHours || 2));
}

function timeRangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string) {
  return timeInputToMinutes(leftStart) < timeInputToMinutes(rightEnd) && timeInputToMinutes(leftEnd) > timeInputToMinutes(rightStart);
}

function timeInputToMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function detectActiveWhatsAppChat(): ActiveChat | null {
  const selectedTitle = getSelectedChatDisplayName();
  const headerTitle = getActiveChatDisplayName();
  const title = selectedTitle || headerTitle;
  const phone = extractPhoneFromSelectedChat() || (!selectedTitle ? extractPhoneFromActiveChat() : "");
  if (!title && !phone) {
    return null;
  }

  return {
    id: createChatId(phone ? `phone:${phone}` : `title:${title}`),
    phone,
    title: title || getGuestNameFallbackFromPhone(phone) || phone
  };
}

function isSameDetectedChat(left: ActiveChat | null, right: ActiveChat | null) {
  if (!left || !right) return left === right;
  if (left.id === right.id) return true;
  const leftPhone = normalizePhoneSearch(left.phone || "");
  const rightPhone = normalizePhoneSearch(right.phone || "");
  if (leftPhone || rightPhone) return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
  return Boolean(left.title && right.title && left.title === right.title);
}

function mergeDetectedChat(currentChat: ActiveChat | null, nextChat: ActiveChat) {
  if (!currentChat) return nextChat;
  const phone = nextChat.phone || currentChat.phone || "";
  const title = nextChat.title || currentChat.title;
  return {
    id: createChatId(phone ? `phone:${phone}` : `title:${title}`),
    phone,
    title
  };
}

function createActiveChatFromProfile(profile: { name: string; phone: string }): ActiveChat | null {
  const title = profile.name || profile.phone;
  if (!title) return null;

  return {
    id: createChatId(profile.phone ? `phone:${profile.phone}` : `title:${title}`),
    phone: profile.phone,
    title
  };
}

async function detectActiveWhatsAppChatAsync(): Promise<ActiveChat | null> {
  const selectedTitle = getSelectedChatDisplayName();
  const headerTitle = getActiveChatDisplayName();
  const title = selectedTitle || headerTitle;
  const selectedPhone = extractPhoneFromSelectedChat();
  const phone = selectedPhone || (!selectedTitle ? await extractPhoneFromWhatsAppStore() || extractPhoneFromActiveChat() : "");
  if (!title && !phone) {
    return null;
  }

  return {
    id: createChatId(phone ? `phone:${phone}` : `title:${title}`),
    phone,
    title: title || getGuestNameFallbackFromPhone(phone) || phone
  };
}

function getActiveChatDisplayName() {
  const header = document.querySelector<HTMLElement>("#main header");
  const headerCandidates = getContactNameCandidates(header);
  return headerCandidates[0] ?? "";
}

function getSelectedChatDisplayName() {
  const selectedChat = document.querySelector<HTMLElement>('[aria-selected="true"], [data-testid="cell-frame-container"][aria-selected="true"]');
  const candidates = getContactNameCandidates(selectedChat);
  return candidates[0] ?? "";
}

function extractPhoneFromSelectedChat() {
  const selectedChat = document.querySelector<HTMLElement>('[aria-selected="true"], [data-testid="cell-frame-container"][aria-selected="true"]');
  if (!selectedChat) return "";
  const text = [
    selectedChat.innerText ?? "",
    ...Array.from(selectedChat.querySelectorAll<HTMLElement>("[title], [aria-label], [data-id]")).map((element) =>
      [
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.getAttribute("data-id")
      ].filter(Boolean).join(" ")
    )
  ].join(" ");
  return extractPhoneFromText(text);
}

function getContactNameCandidates(root?: HTMLElement | null) {
  if (!root) return [];

  return Array.from(root.querySelectorAll<HTMLElement>("[title], span[dir='auto'], h1, h2"))
    .map((element) => element.getAttribute("title") || element.textContent || "")
    .map(normalizeExtractedText)
    .filter(isLikelyContactName);
}

function isLikelyContactName(value: string) {
  if (!value) return false;
  if (getGuestNameFallbackFromPhone(value) === value) return true;
  if (/ic-|data-icon|wds-|status-|refreshed/i.test(value)) return false;
  if (value.length > 80) return false;
  if (extractPhoneFromText(value)) return false;
  if (isInvalidGuestNameText(value)) return false;
  if (/[.!?]$/.test(value) && value.split(/\s+/).length > 3) return false;
  if (/номер\s+\d+/i.test(value)) return false;
  if (/^\d{1,2}:\d{2}$/.test(value)) return false;
  if (/chat-filled|status-refreshed|wa-wordmark|new-chat|непрочитанное|избранное|группы/i.test(value)) return false;
  return !/^(сведения профиля|данные контакта|информация и номер телефона|сведения о компании|данные компании|contact info|profile details|business info|бизнес[\s\u2010-\u2015-]?аккаунт|business[\s\u2010-\u2015-]?account|online|онлайн|печатает|typing|last seen|был\(-а\).*|был\(а\).*|был.*|сегодня|вчера.*)$/i.test(value);
}

function getSafeGuestName(name: string, phone: string) {
  const normalizedName = normalizeExtractedText(name);
  if (isLikelyContactName(normalizedName) && !isTechnicalGuestName(normalizedName)) return normalizedName;
  return getGuestNameFallbackFromPhone(phone);
}

function isInvalidGuestNameText(value: string) {
  const normalizedValue = normalizeExtractedText(value);
  if (!normalizedValue) return true;
  if (/\.{2,}|…/.test(normalizedValue)) return true;
  if (!/\p{L}/u.test(normalizedValue)) return true;
  if (!/^[\p{L}\s'-]+$/u.test(normalizedValue)) return true;
  return false;
}

function isTechnicalGuestName(value: string) {
  return /ic-close|data-icon|chat-filled|status-refreshed|wds-|wa-wordmark|new-chat|сведения профиля|данные контакта|бизнес[\s\u2010-\u2015-]?аккаунт|business[\s\u2010-\u2015-]?account/i.test(value);
}

function getGuestNameFallbackFromPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "";
  return `Гость ${digits.slice(-4)}`;
}

function normalizeExtractedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

async function extractActiveChatProfile(activeChat: ActiveChat | null) {
  const phoneFromStore = await extractPhoneFromWhatsAppStore();
  const phoneFromDom = extractPhoneFromActiveChat();
  const nameFromChat = extractNameFromActiveChat(activeChat);

  openActiveChatProfile();
  await waitForElement(findVisibleProfilePanel, 2500);

  let profileText = getVisibleProfileText();
  let phone = phoneFromStore || extractPhoneFromText(profileText) || extractPhoneFromText(getBroadPhoneSearchText()) || phoneFromDom;

  if (!phone) {
    clickProfileContactDetails();
    await waitForProfileTextChange(profileText, 3500);
    profileText = getVisibleProfileText();
    phone = phoneFromStore || extractPhoneFromText(profileText) || extractPhoneFromText(getBroadPhoneSearchText()) || phoneFromDom;
  }

  const profileName = extractNameFromProfilePanel() || extractNameFromProfileText(profileText);
  return {
    name: profileName || nameFromChat,
    phone
  };
}

async function extractActiveChatPhoneOnly(activeChat: ActiveChat | null) {
  const phone = await extractPhoneFromCurrentChatProfile(activeChat) || activeChat?.phone || "";
  debugContactFlow("extract-phone-only-result", {
    activeChatId: activeChat?.id ?? "",
    activeChatTitle: activeChat?.title ?? "",
    activeChatPhone: activeChat?.phone ?? "",
    phone
  });
  return {
    name: phone ? getGuestNameFallbackFromPhone(phone) : "",
    phone
  };
}

async function extractPhoneFromCurrentChatProfile(activeChat: ActiveChat | null = null) {
  const phoneFromStore = await extractPhoneFromWhatsAppStore();
  const phoneFromDom = extractPhoneFromActiveChat();
  if (phoneFromStore || phoneFromDom || activeChat?.phone) {
    debugContactFlow("extract-phone-fast-source", {
      activeChatPhone: activeChat?.phone ?? "",
      phoneFromStore,
      phoneFromDom
    });
  }

  closeWhatsAppProfilePanels();
  await waitForDelay(450);
  openActiveChatProfile();

  const profilePanel = await waitForElement(findVisibleProfilePanel, 3200);
  if (!profilePanel) return phoneFromStore || phoneFromDom || activeChat?.phone || "";

  let profileText = getVisibleProfileText();
  let phone = extractPhoneFromText(profileText) || phoneFromStore || phoneFromDom || activeChat?.phone || "";

  if (!phone) {
    clickProfileContactDetails();
    await waitForProfileTextChange(profileText, 2500);
    profileText = getVisibleProfileText();
    phone = extractPhoneFromText(profileText) || extractPhoneFromText(getBroadPhoneSearchText()) || phoneFromStore || phoneFromDom || activeChat?.phone || "";
  }

  closeWhatsAppProfilePanels();
  debugContactFlow("extract-phone-profile-result", {
    foundPanel: Boolean(profilePanel),
    phone,
    profileText: normalizeExtractedText(profileText).slice(0, 220)
  });
  return phone;
}

function extractNameFromActiveChat(activeChat: ActiveChat | null) {
  const title = getActiveChatDisplayName() || activeChat?.title.trim() || "";
  return isLikelyContactName(title) ? title : "";
}

function extractPhoneFromActiveChat() {
  const header = document.querySelector<HTMLElement>("#main header");
  const selectedChat = document.querySelector<HTMLElement>('[aria-selected="true"], [data-testid="cell-frame-container"][aria-selected="true"]');
  const text = [
    header?.innerText ?? "",
    selectedChat?.innerText ?? "",
    ...Array.from(document.querySelectorAll<HTMLElement>("#main header [title]")).map((element) => element.getAttribute("title") ?? ""),
    ...Array.from(document.querySelectorAll<HTMLElement>("[data-id], [data-testid], [aria-label]")).map((element) =>
      [
        element.getAttribute("data-id"),
        element.getAttribute("aria-label")
      ].filter(Boolean).join(" ")
    )
  ].join(" ");

  return extractPhoneFromText(text);
}

function extractPhoneFromText(text: string) {
  const match = text.match(/(?:\+?\d[\s().-]*){10,16}/);
  if (!match) {
    return "";
  }

  const digits = match[0].replace(/[^\d+]/g, "");
  if (/^8\d{10}$/.test(digits)) return digits.replace(/^8/, "+7");
  if (/^7\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+7${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function extractPhoneFromWhatsAppStore() {
  await ensureWhatsAppStoreBridge();

  return new Promise<string>((resolve) => {
    const requestId = `gpb-phone-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("gpb-active-chat-phone", onResult as EventListener);
      resolve("");
    }, 1800);

    function onResult(event: Event) {
      const detail = (event as CustomEvent<{ requestId: string; phone: string }>).detail;
      if (detail?.requestId !== requestId) return;

      window.clearTimeout(timeoutId);
      window.removeEventListener("gpb-active-chat-phone", onResult as EventListener);
      resolve(formatPhoneDigits(detail.phone));
    }

    window.addEventListener("gpb-active-chat-phone", onResult as EventListener);
    window.dispatchEvent(new CustomEvent("gpb-request-active-chat-phone", { detail: { requestId } }));
  });
}

function ensureWhatsAppStoreBridge() {
  const existingScript = document.getElementById("gpb-whatsapp-store-bridge") as HTMLScriptElement | null;
  if (existingScript?.dataset.ready === "true") return Promise.resolve();

  return new Promise<void>((resolve) => {
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(resolve, 500);
      return;
    }

    const script = document.createElement("script");
    script.id = "gpb-whatsapp-store-bridge";
    script.src = chrome.runtime.getURL("whatsapp-store-bridge.js");
    script.onload = () => {
      script.dataset.ready = "true";
      resolve();
    };
    script.onerror = () => resolve();
    document.documentElement.appendChild(script);
  });
}


function formatPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (/^8\d{10}$/.test(digits)) return digits.replace(/^8/, "+7");
  if (/^7\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+7${digits}`;
  return `+${digits}`;
}

function buildPhoneWithPrefix(value: string, prefix: string) {
  const trimmedValue = value.trim();
  if (trimmedValue.startsWith("+")) return formatPhoneDigits(trimmedValue);

  const prefixDigits = prefix.replace(/\D/g, "");
  const valueDigits = trimmedValue.replace(/\D/g, "");
  if (!valueDigits) return "";
  if (valueDigits.length >= 11) return formatPhoneDigits(valueDigits);
  return `+${prefixDigits}${valueDigits}`;
}

function splitPhoneForInput(phone: string) {
  const normalizedPhone = formatPhoneDigits(phone);
  const digits = normalizedPhone.replace(/\D/g, "");
  if (!digits) return { prefix: "+7", local: "" };

  const matchedPrefix = [...PHONE_COUNTRY_OPTIONS]
    .sort((left, right) => right.code.replace(/\D/g, "").length - left.code.replace(/\D/g, "").length)
    .find((option) => digits.startsWith(option.code.replace(/\D/g, "")));

  if (!matchedPrefix) return { prefix: "+7", local: digits };

  const prefixDigits = matchedPrefix.code.replace(/\D/g, "");
  return {
    prefix: matchedPrefix.code,
    local: digits.slice(prefixDigits.length)
  };
}

function formatLocalPhoneInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const parts = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 8),
    digits.slice(8, 10)
  ].filter(Boolean);
  return parts.join(" ");
}

function getPhoneForContactForm(phone: string) {
  const normalizedPhone = formatPhoneDigits(phone);
  const digits = normalizedPhone.replace(/\D/g, "");
  if (/^7\d{10}$/.test(digits)) return digits.slice(1);
  return normalizedPhone;
}

function openActiveChatProfile() {
  const header = document.querySelector<HTMLElement>("#main header");
  const titleElement = header?.querySelector<HTMLElement>("span[title], [title]");
  const target = titleElement?.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? titleElement ?? header;
  target?.click();
}

function findVisibleProfilePanel() {
  const likelyPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-testid*="drawer"], [data-testid*="panel"], [role="dialog"], aside'))
    .filter((element) => !isGpbElement(element));
  const matchedPanel = likelyPanels.find((element) => {
    if (!isVisibleElement(element)) return false;
    return /сведения профиля|сведения о компании|данные компании|бизнес аккаунт|contact info|profile|business info|business account/i.test(element.innerText || element.getAttribute("aria-label") || "");
  });

  if (matchedPanel) return matchedPanel;

  return likelyPanels.reverse().find((element) => isVisibleElement(element) && element.innerText.length > 20) ?? null;
}

function getVisibleProfileText() {
  const profilePanel = findVisibleProfilePanel();
  const root = profilePanel;
  if (!root) return "";

  return [
    root.innerText,
    ...Array.from(root?.querySelectorAll<HTMLElement>("[title], [aria-label], [data-id], a[href], span, div, h1, h2") ?? [])
    .filter(isVisibleElement)
    .map((element) =>
      [
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.getAttribute("data-id"),
        element.getAttribute("href"),
        element.textContent
      ].filter(Boolean).join(" ")
    )
  ]
    .map(normalizeExtractedText)
    .filter(Boolean)
    .join("\n");
}

function extractNameFromProfileText(text: string) {
  return text
    .split(/\n+/)
    .map(normalizeExtractedText)
    .find(isLikelyContactName) ?? "";
}

function extractNameFromProfilePanel() {
  const profilePanel = findVisibleProfilePanel();
  if (!profilePanel) return "";

  const titleCandidates = Array.from(profilePanel.querySelectorAll<HTMLElement>("h1, h2, span[title], [data-testid*='contact-info'] span[dir='auto'], span[dir='auto']"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element))
    .map((element) => element.getAttribute("title") || element.textContent || "")
    .map(normalizeExtractedText)
    .filter(isLikelyContactName);

  return titleCandidates.find((value) => value !== "WhatsApp") ?? "";
}

function getBroadPhoneSearchText() {
  const profilePanel = findVisibleProfilePanel();
  const roots = [profilePanel, document.querySelector<HTMLElement>("#main header")]
    .filter((root): root is HTMLElement => Boolean(root));

  return [
    ...roots.flatMap((root) =>
    [
      root.innerText,
      ...Array.from(root.querySelectorAll<HTMLElement>("[title], [data-id], [aria-label], a[href]")).map((element) =>
        [
          element.getAttribute("title"),
          element.getAttribute("data-id"),
          element.getAttribute("aria-label"),
          element.getAttribute("href"),
          element.textContent
        ].filter(Boolean).join(" ")
      )
    ]
    ),
    ...Array.from(document.querySelectorAll<HTMLElement>('[data-id*="@c.us"], [data-id*="@s.whatsapp.net"], a[href^="tel:"]'))
    .filter((element) => !isGpbElement(element))
    .map((element) =>
      [
        element.getAttribute("data-id"),
        element.getAttribute("href"),
        element.getAttribute("aria-label"),
        element.textContent
      ].filter(Boolean).join(" ")
    )
  ].join(" ");
}

function clickProfileContactDetails() {
  const profilePanel = findVisibleProfilePanel();
  if (!profilePanel) return;

  const exactTextNode = Array.from(profilePanel.querySelectorAll<HTMLElement>("span, div, button, [role='button'], [tabindex]"))
    .filter(isVisibleElement)
    .sort((left, right) => (left.innerText || left.textContent || "").length - (right.innerText || right.textContent || "").length)
    .find((element) => /информация\s+и\s+номер\s+телефона/i.test(element.innerText || element.textContent || ""));

  if (exactTextNode) {
    clickNearestProfileButton(exactTextNode);
    return;
  }

  const clickable = Array.from(profilePanel.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex]")).find((element) => {
    if (!isVisibleElement(element)) return false;
    return /информация\s+и\s+номер\s+телефона|телефон|номер|контакт|contact|phone|сведения|информация|about|о себе|компани/i.test(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "");
  });

  if (clickable) {
    clickable.click();
    return;
  }

  const textNode = Array.from(profilePanel.querySelectorAll<HTMLElement>("span, div")).find((element) =>
    isVisibleElement(element) && /информация\s+и\s+номер\s+телефона/i.test(element.innerText || element.textContent || "")
  );
  if (textNode) {
    clickNearestProfileButton(textNode);
  }
}

async function saveActiveWhatsAppContact(contactName = "", contactPhone = "", options: { allowSidebar?: boolean } = {}) {
  debugContactFlow("whatsapp-save-start", { contactName, contactPhone });
  const savedFromProfile = await saveActiveWhatsAppContactFromProfile(contactName, contactPhone);
  debugContactFlow("whatsapp-save-profile-result", { contactName, contactPhone, savedFromProfile });
  if (savedFromProfile) return true;
  if (findEditableContactFormPanel()) {
    debugContactFlow("whatsapp-save-stop-after-profile-form", { reason: "contact form is already open" });
    return false;
  }

  closeWhatsAppProfilePanels();
  if (!options.allowSidebar) {
    debugContactFlow("whatsapp-save-skip-sidebar", { reason: "active chat booking flow" });
    return false;
  }

  await waitForDelay(300);
  const savedFromSidebar = await createWhatsAppContactFromSidebar(contactName, contactPhone);
  debugContactFlow("whatsapp-save-sidebar-result", { contactName, contactPhone, savedFromSidebar });
  return savedFromSidebar;
}

async function saveActiveWhatsAppContactFromProfile(contactName = "", contactPhone = "") {
  try {
    debugContactFlow("profile-save-start", { contactName, contactPhone });
    closeWhatsAppProfilePanels();
    await waitForDelay(250);
    openActiveChatProfile();
    const profilePanel = await waitForElement(findVisibleProfilePanel, 2500);
    debugContactFlow("profile-save-panel", { found: Boolean(profilePanel), text: getDebugText(profilePanel) });
    if (!profilePanel) return false;

    let addButton = findProfileAddContactButton(profilePanel);
    debugContactFlow("profile-save-add-button", { found: Boolean(addButton), text: getDebugText(addButton) });
    if (!addButton) {
      const alreadySaved = profilePanelHasPhone(profilePanel, contactPhone);
      const alreadyNamed = profilePanelMatchesContactName(profilePanel, contactName);
      debugContactFlow("profile-save-already-saved-check", { alreadySaved, alreadyNamed, contactPhone, contactName });
      if (alreadySaved && alreadyNamed) {
        closeWhatsAppProfilePanels();
        return true;
      }

      clickProfileContactDetails();
      await waitForDelay(700);
      const detailsPanel = findVisibleProfilePanel();
      addButton = detailsPanel ? findProfileAddContactButton(detailsPanel) : null;
      const savedAfterDetails = detailsPanel ? profilePanelHasPhone(detailsPanel, contactPhone) : false;
      const namedAfterDetails = detailsPanel ? profilePanelMatchesContactName(detailsPanel, contactName) : false;
      debugContactFlow("profile-save-details-check", {
        found: Boolean(detailsPanel),
        addFound: Boolean(addButton),
        addText: getDebugText(addButton),
        alreadySaved: savedAfterDetails,
        alreadyNamed: namedAfterDetails,
        text: getDebugText(detailsPanel)
      });
      if (!addButton) {
        if (savedAfterDetails && namedAfterDetails) {
          closeWhatsAppProfilePanels();
          return true;
        }
        const edited = await editOpenWhatsAppContactFromProfilePanel(contactName, contactPhone, detailsPanel ?? profilePanel, "profile-save-edit-fallback");
        if (!edited) closeWhatsAppProfilePanels();
        return edited;
      }
    }
    clickWhatsAppElement(addButton);

    return saveOpenWhatsAppContactForm(contactName, contactPhone, "profile-save");
  } catch (error) {
    debugContactFlow("profile-save-error", { message: error instanceof Error ? error.message : String(error) });
    closeWhatsAppProfilePanels();
    return false;
  }
}

async function overwriteActiveWhatsAppContact(contactName = "", contactPhone = "") {
  try {
    debugContactFlow("overwrite-whatsapp-start", { contactName, contactPhone });
    closeWhatsAppProfilePanels();
    await waitForDelay(350);
    openActiveChatProfile();

    const profilePanel = await waitForElement(findVisibleProfilePanel, 3200);
    debugContactFlow("overwrite-profile-panel", { found: Boolean(profilePanel), text: getDebugText(profilePanel) });
    if (!profilePanel) return false;

    const addButton = findProfileAddContactButton(profilePanel);
    debugContactFlow("overwrite-add-button", { found: Boolean(addButton), text: getDebugText(addButton) });
    if (addButton) {
      debugContactFlow("overwrite-blocked-unsaved-contact", { reason: "profile has add contact button" });
      return false;
    }

    return editOpenWhatsAppContactFromProfilePanel(contactName, contactPhone, profilePanel, "overwrite");
  } catch (error) {
    debugContactFlow("overwrite-error", { message: error instanceof Error ? error.message : String(error) });
    closeWhatsAppProfilePanels();
    return false;
  }
}

async function editOpenWhatsAppContactFromProfilePanel(contactName: string, contactPhone: string, profilePanel: HTMLElement, debugPrefix: string) {
  const editButton = findProfileEditIcon(profilePanel) ??
    findProfileActionButton(profilePanel, /редактировать\s+контакт|изменить\s+контакт|edit\s+contact/i) ??
    findProfileEditIcon(document.body) ??
    findProfileActionButton(document.body, /редактировать\s+контакт|изменить\s+контакт|edit\s+contact/i);
  debugContactFlow(`${debugPrefix}-edit-button`, { found: Boolean(editButton), text: getDebugText(editButton) });
  if (!editButton) return false;
  clickWhatsAppElement(editButton);

  return saveOpenWhatsAppContactForm(contactName, contactPhone, debugPrefix);
}

async function saveOpenWhatsAppContactForm(contactName: string, contactPhone: string, debugPrefix: string) {
  const contactForm = await waitForElement(findEditableContactFormPanel, 5000);
  debugContactFlow(`${debugPrefix}-contact-form`, { found: Boolean(contactForm), text: getDebugText(contactForm) });
  if (!contactForm) return false;

  const filled = await fillWhatsAppContactForm(contactName, contactPhone, contactForm, { fillPhone: false });
  debugContactFlow(`${debugPrefix}-fill-result`, { filled });
  if (!filled) return false;

  const saveButton = await waitForElement(() => findContactSaveButtonForForm(contactForm), 5000);
  debugContactFlow(`${debugPrefix}-save-button`, { found: Boolean(saveButton), text: getDebugText(saveButton) });
  if (!saveButton) return false;
  clickWhatsAppElement(saveButton);

  await waitForDelay(1200);
  closeWhatsAppProfilePanels();
  await waitForDelay(250);
  debugContactFlow(`${debugPrefix}-finished`, { contactName, contactPhone });
  return true;
}

function findContactSaveButtonForForm(contactForm: HTMLElement) {
  const scopedButton = findContactSaveButton(contactForm);
  if (scopedButton) return scopedButton;

  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span, div, svg, [aria-label], [title]"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element) && isElementInContactFormColumn(element, contactForm));
  return findBottomContactSaveButton(candidates, document) ?? findFloatingContactSaveButton(candidates, contactForm);
}

function isElementInContactFormColumn(element: HTMLElement, contactForm: HTMLElement) {
  const formRect = contactForm.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return rect.left >= formRect.left - 40 &&
    rect.right <= formRect.right + 180 &&
    rect.top >= formRect.top - 20 &&
    rect.top <= window.innerHeight - 8;
}

function scrollContactFormToSaveArea(contactForm: HTMLElement) {
  contactForm.scrollTo?.({ top: contactForm.scrollHeight, behavior: "instant" as ScrollBehavior });
  const scrollableParent = findScrollableParent(contactForm);
  scrollableParent?.scrollTo?.({ top: scrollableParent.scrollHeight, behavior: "instant" as ScrollBehavior });
}

function findScrollableParent(element: HTMLElement) {
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/i.test(`${style.overflowY} ${style.overflow}`) && current.scrollHeight > current.clientHeight + 8) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function findFloatingContactSaveButton(candidates: HTMLElement[], contactForm: HTMLElement) {
  const formRect = contactForm.getBoundingClientRect();
  const formCenter = (formRect.left + formRect.right) / 2;
  const button = candidates
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const text = getElementActionText(element);
      const isLowerFormArea = rect.top > formRect.top + 260 || rect.top > window.innerHeight * 0.58;
      const isCompact = rect.width >= 28 && rect.width <= 96 && rect.height >= 28 && rect.height <= 96;
      const isCentered = Math.abs((rect.left + rect.right) / 2 - formCenter) < 180;
      const hasSaveIcon = /check|done|tick|галоч|сохранить|save|create|создать/i.test(text);
      const hasDarkCircle = /rgb\(0,\s*0,\s*0\)|rgb\(17,\s*27,\s*33\)|rgb\(32,\s*44,\s*51\)|rgb\(37,\s*45,\s*49\)/i.test(style.backgroundColor) &&
        parseFloat(style.borderRadius || "0") >= 12;
      return isLowerFormArea && isCompact && isCentered && (hasSaveIcon || hasDarkCircle);
    })
    .sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom)[0] ?? null;

  return button?.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? button;
}

async function createWhatsAppContactFromSidebar(contactName = "", contactPhone = "") {
  try {
    debugContactFlow("sidebar-create-start", { contactName, contactPhone });
    closeWhatsAppProfilePanels();
    await waitForDelay(300);
    let contactForm = findEditableContactFormPanel();

    if (!contactForm) {
      const createButton = findWhatsAppSidebarCreateButton();
      debugContactFlow("sidebar-create-button", { found: Boolean(createButton), text: getDebugText(createButton) });
      if (!createButton) return false;
      clickWhatsAppElement(createButton);

      await waitForDelay(900);
      const createContactButton = await waitForElement(
        findWhatsAppNewContactButton,
        6000
      );
      debugContactFlow("sidebar-new-contact-button", { found: Boolean(createContactButton), text: getDebugText(createContactButton) });
      if (createContactButton) {
        clickWhatsAppRow(createContactButton);
        await waitForDelay(900);
        if (!findEditableContactFormPanel()) {
          clickWhatsAppElementAndAncestors(createContactButton);
          await waitForDelay(900);
        }
        if (!findEditableContactFormPanel()) {
          const activatedWithKeyboard = await activateWhatsAppNewContactWithKeyboard();
          debugContactFlow("sidebar-new-contact-after-click-keyboard-fallback", { activatedWithKeyboard });
          if (!activatedWithKeyboard) return false;
        }
      } else {
        const activatedWithKeyboard = await activateWhatsAppNewContactWithKeyboard();
        debugContactFlow("sidebar-new-contact-keyboard-fallback", { activatedWithKeyboard });
        if (!activatedWithKeyboard) return false;
      }
    }

    contactForm = await waitForElement(findEditableContactFormPanel, 5000);
    debugContactFlow("sidebar-contact-form", { found: Boolean(contactForm), text: getDebugText(contactForm) });
    if (!contactForm) return false;

    const filled = await fillWhatsAppContactForm(contactName, contactPhone, contactForm);
    debugContactFlow("sidebar-fill-result", { filled });
    if (!filled) return false;

    await waitForDelay(250);
    const refilled = await fillWhatsAppContactForm(contactName, contactPhone, contactForm);
    debugContactFlow("sidebar-refill-result", { refilled });
    if (!refilled) return false;
    if (contactFormHasExistingContactMessage(contactForm)) {
      debugContactFlow("sidebar-existing-contact-message", { text: getDebugText(contactForm) });
      closeWhatsAppProfilePanels();
      await waitForDelay(500);
      return openWhatsAppChatByPhone(contactPhone, contactName);
    }

    scrollContactFormToSaveArea(contactForm);
    await waitForDelay(600);
    const saveButton = await waitForElement(() => findContactSaveButtonForForm(contactForm), 5000);
    debugContactFlow("sidebar-save-button", { found: Boolean(saveButton), text: getDebugText(saveButton) });
    if (!saveButton && contactFormHasExistingContactMessage(contactForm)) {
      debugContactFlow("sidebar-existing-contact-message-before-save", { text: getDebugText(contactForm) });
      closeWhatsAppProfilePanels();
      await waitForDelay(500);
      return openWhatsAppChatByPhone(contactPhone, contactName);
    }
    if (!saveButton) return false;
    clickWhatsAppElement(saveButton);

    await waitForDelay(1600);
    closeWhatsAppProfilePanels();
    await waitForDelay(500);
    const openedAfterSave = await openWhatsAppChatByPhone(contactPhone, contactName);
    debugContactFlow("sidebar-post-save-open-chat", { openedAfterSave });
    if (!openedAfterSave) {
      closeWhatsAppSidebarSearchOverlay();
    }
    debugContactFlow("sidebar-create-finished", { contactName, contactPhone });
    return true;
  } catch (error) {
    debugContactFlow("sidebar-create-error", { message: error instanceof Error ? error.message : String(error) });
    closeWhatsAppProfilePanels();
    return false;
  }
}

async function openExistingWhatsAppContactForManualSale(contactName: string, contactPhone: string) {
  const digits = normalizePhoneSearch(contactPhone);
  const query = digits.slice(-10) || digits;
  const opened = query ? await searchAndOpenWhatsAppChat(query, digits, contactName) : false;
  debugContactFlow("manual-sale-existing-contact-open", { opened, contactName, contactPhone });
  if (!opened) {
    closeWhatsAppSidebarSearchOverlay();
  }
  return opened;
}

function contactFormHasExistingContactMessage(contactForm: HTMLElement) {
  const text = normalizeExtractedText([
    contactForm.innerText,
    ...Array.from(document.querySelectorAll<HTMLElement>("span, div"))
      .filter((element) => isVisibleElement(element) && !isGpbElement(element) && isElementInContactFormColumn(element, contactForm))
      .map((element) => element.innerText || element.textContent || "")
  ].join(" "));
  return /уже\s+есть.*(контакт|списке\s+контактов)|номер\s+телефона\s+уже|already.*contact|already.*contacts/i.test(text);
}

async function openWhatsAppNewChatPanel() {
  try {
    const createButton = findWhatsAppSidebarCreateButton();
    if (!createButton) return false;
    createButton.click();
    await waitForDelay(900);
    const createContactButton = await waitForElement(findWhatsAppNewContactButton, 6000);
    if (!createContactButton) return false;
    clickWhatsAppElementAndAncestors(createContactButton);
    await waitForDelay(900);
    if (findEditableContactFormPanel()) return true;

    await activateWhatsAppNewContactWithKeyboard();
    return Boolean(await waitForElement(findEditableContactFormPanel, 3500));
  } catch {
    return false;
  }
}

function findWhatsAppNewContactButton() {
  const sidebar = document.querySelector<HTMLElement>("#side");
  const searchRoot = document.body;
  const rootRect = searchRoot.getBoundingClientRect();
  const textMatch = Array.from(searchRoot.querySelectorAll<HTMLElement>("span, div, [aria-label], [title]"))
    .filter((element) => {
      if (!isVisibleElement(element) || isGpbElement(element)) return false;
      const rect = element.getBoundingClientRect();
      const sidebarRect = sidebar?.getBoundingClientRect();
      const isLeftPanel = sidebarRect
        ? rect.left >= sidebarRect.left - 12 && rect.right <= sidebarRect.right + 24
        : rect.left < window.innerWidth * 0.42;
      return isLeftPanel && rect.top > 60;
    })
    .find((element) => /^(новый\s+контакт|new\s+contact)$/i.test(getElementActionText(element).trim()));
  if (textMatch) return findWideActionRow(textMatch, sidebar ?? document.body) ?? findClickableAncestor(textMatch, sidebar ?? document.body) ?? textMatch;

  const candidates = Array.from(searchRoot.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span, div, [aria-label], [title]"))
    .filter((element) => {
      if (!isVisibleElement(element) || isGpbElement(element)) return false;
      const rect = element.getBoundingClientRect();
      const sidebarRect = sidebar?.getBoundingClientRect();
      const isLeftPanel = sidebarRect
        ? rect.left >= sidebarRect.left - 12 && rect.right <= sidebarRect.right + 24
        : rect.left < window.innerWidth * 0.42;
      return isLeftPanel && rect.top > 60;
    })
    .sort((left, right) => getElementActionText(left).length - getElementActionText(right).length);

  const matched = candidates.find((element) =>
    /новый\s+контакт|создать\s+новый\s+контакт|new\s+contact|create\s+new\s+contact/i.test(getElementActionText(element))
  );
  return matched ? findWideActionRow(matched, sidebar ?? document.body) ?? findClickableAncestor(matched, sidebar ?? document.body) ?? matched : null;
}

function findWideActionRow(element: HTMLElement, root: ParentNode) {
  const rootRect = root instanceof HTMLElement
    ? root.getBoundingClientRect()
    : { left: 0, right: window.innerWidth, width: window.innerWidth };
  let current: HTMLElement | null = element;
  let best: HTMLElement | null = null;

  for (let depth = 0; current && depth < 8; depth += 1) {
    const rect = current.getBoundingClientRect();
    const text = getElementActionText(current);
    const isInRoot = rect.left >= rootRect.left - 2 && rect.right <= rootRect.right + 16;
    const isActionRow = rect.width >= rootRect.width * 0.55 && rect.height >= 42 && rect.height <= 96;
    if (isInRoot && isActionRow && /новый\s+контакт|new\s+contact/i.test(text)) {
      best = current;
    }

    if (current.parentElement === root) break;
    current = current.parentElement;
  }

  return best;
}

function findClickableAncestor(element: HTMLElement, root: ParentNode) {
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 7; depth += 1) {
    if (current.matches("[role='button'], button, [tabindex], a")) return current;
    const style = window.getComputedStyle(current);
    if (style.cursor === "pointer") return current;
    if (current.parentElement === root) return current;
    current = current.parentElement;
  }

  return element.closest<HTMLElement>("[role='button'], button, [tabindex], a");
}

function clickWhatsAppElement(element: HTMLElement) {
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const eventInit = { bubbles: true, cancelable: true, clientX, clientY, view: window };

  element.dispatchEvent(new PointerEvent("pointerdown", eventInit));
  element.dispatchEvent(new MouseEvent("mousedown", eventInit));
  element.dispatchEvent(new PointerEvent("pointerup", eventInit));
  element.dispatchEvent(new MouseEvent("mouseup", eventInit));
  element.dispatchEvent(new MouseEvent("click", eventInit));
  element.click();
}

function clickWhatsAppRow(element: HTMLElement) {
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const points = [
    { x: rect.left + Math.min(64, rect.width * 0.18), y: rect.top + rect.height / 2 },
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    { x: rect.left + Math.min(120, rect.width * 0.35), y: rect.top + rect.height / 2 }
  ];

  for (const point of points) {
    const target = document.elementFromPoint(point.x, point.y);
    const targetElement = target instanceof HTMLElement ? target : element;
    clickWhatsAppElement(targetElement);
  }
  clickWhatsAppElement(element);
}

function clickWhatsAppElementAndAncestors(element: HTMLElement) {
  const searchRoot = document.querySelector<HTMLElement>("#side") ?? document.body;
  const chain: HTMLElement[] = [];
  let current: HTMLElement | null = element;

  for (let depth = 0; current && depth < 10; depth += 1) {
    chain.push(current);
    if (current.parentElement === searchRoot) break;
    current = current.parentElement;
  }

  for (const target of chain) {
    clickWhatsAppRow(target);
  }
}

async function activateWhatsAppNewContactWithKeyboard() {
  const sidebar = document.querySelector<HTMLElement>("#side") ?? document.body;
  const searchInput = Array.from(sidebar.querySelectorAll<HTMLElement>('input, [contenteditable="true"], [role="textbox"]'))
    .find((element) => isVisibleElement(element) && !isGpbElement(element));
  searchInput?.focus();

  const sequences = [
    ["Tab", "Tab", "Enter"],
    ["ArrowDown", "ArrowDown", "Enter"],
    ["Tab", "Enter"],
    ["ArrowDown", "Enter"]
  ];

  for (const sequence of sequences) {
    for (const key of sequence) {
      pressWhatsAppKey(key);
      await waitForDelay(180);
    }
    await waitForDelay(500);
    if (findEditableContactFormPanel()) return true;
    searchInput?.focus();
  }

  return false;
}

function pressWhatsAppKey(key: string) {
  const code = key === " " ? "Space" : key;
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  const eventInit = { bubbles: true, cancelable: true, key, code };
  activeElement.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  activeElement.dispatchEvent(new KeyboardEvent("keyup", eventInit));
  document.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  document.dispatchEvent(new KeyboardEvent("keyup", eventInit));
}

function findWhatsAppSidebarCreateButton() {
  const exactIcon = document.querySelector<HTMLElement>(
    '#side span[data-icon="new-chat-outline"], #side span[data-icon="new-chat"], #side span[data-icon="chat-plus"], span[data-icon="new-chat-outline"], span[data-icon="new-chat"], span[data-icon="chat-plus"]'
  );
  const exactButton = exactIcon?.closest<HTMLElement>("[role='button'], button, [tabindex]");
  if (exactButton && isVisibleElement(exactButton) && !isGpbElement(exactButton)) return exactButton;

  const sidebar = document.querySelector<HTMLElement>("#side");
  const searchRoot = sidebar ?? document.body;
  const rootRect = searchRoot.getBoundingClientRect();
  const candidates = Array.from(searchRoot.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span[data-icon], [aria-label], [title], svg"))
    .filter((element) => {
      if (!isVisibleElement(element) || isGpbElement(element)) return false;
      const rect = element.getBoundingClientRect();
      const isLeftPanel = sidebar ? rect.left >= rootRect.left && rect.right <= rootRect.right : rect.left < window.innerWidth * 0.42;
      return isLeftPanel && rect.top <= rootRect.top + 95;
    });

  const createElement = candidates.find((element) =>
    /новый\s+чат|new\s+chat/i.test([
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" "))
  ) ?? candidates.find((element) =>
    /new-chat|new-chat-outline|chat-plus|compose/i.test([
      element.getAttribute("data-icon"),
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ].filter(Boolean).join(" "))
  );

  return createElement?.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? createElement ?? null;
}

async function openWhatsAppChatByPhone(phone: string, contactName = "") {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;

  debugContactFlow("open-chat-search-start", { phone, contactName });
  const searchQueries = [
    normalizeExtractedText(contactName),
    phone,
    digits,
    digits.slice(-10),
    digits.slice(-4)
  ].filter(Boolean);

  for (const query of searchQueries) {
    const opened = await searchAndOpenWhatsAppChat(query, digits, contactName);
    debugContactFlow("open-chat-search-attempt", { query, opened });
    if (opened) return true;
  }

  clearWhatsAppSidebarSearchField();
  return false;
}

function waitForContactChatHeader(contactName: string, contactPhone: string, timeoutMs: number) {
  const phoneDigits = normalizePhoneSearch(contactPhone);
  const expectedName = normalizeExtractedText(contactName).toLowerCase();

  return waitForElement(() => {
    const header = document.querySelector<HTMLElement>("#main header");
    if (!header || !isVisibleElement(header)) return null;
    const headerText = normalizeExtractedText(header.innerText || "");
    const headerPhone = normalizePhoneSearch(headerText);
    const headerName = normalizeExtractedText(getActiveChatDisplayName()).toLowerCase();
    const matchesPhone = Boolean(phoneDigits.slice(-4) && headerPhone.endsWith(phoneDigits.slice(-4)));
    const matchesName = Boolean(expectedName && (headerName.includes(expectedName) || headerText.toLowerCase().includes(expectedName)));
    return matchesPhone || matchesName ? header : null;
  }, timeoutMs).then(Boolean);
}

function isCurrentWhatsAppPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;
  const currentDigits = new URLSearchParams(window.location.search).get("phone")?.replace(/\D/g, "");
  return currentDigits === digits;
}

async function searchAndOpenWhatsAppChat(query: string, phoneDigits: string, contactName: string) {
  const searchField = await waitForElement(findWhatsAppSidebarSearchField, 2500);
  debugContactFlow("open-chat-search-field", { query, found: Boolean(searchField), text: getDebugText(searchField) });
  if (!searchField) return false;

  setContactFieldValue(searchField, query);
  await waitForDelay(900);

  const result = await waitForElement(() => findWhatsAppChatSearchResult(phoneDigits, contactName, query), 4500);
  debugContactFlow("open-chat-search-result", { query, found: Boolean(result), text: getDebugText(result) });
  if (!result) return false;

  const previousHeaderText = normalizeExtractedText(document.querySelector<HTMLElement>("#main header")?.innerText ?? "");
  clickWhatsAppResultRow(result);
  const openedHeader = await waitForElement(() => {
    const header = document.querySelector<HTMLElement>("#main header");
    if (!header || !isVisibleElement(header)) return null;
    const headerText = normalizeExtractedText(header.innerText || "");
    const headerPhone = normalizePhoneSearch(headerText);
    const headerName = getActiveChatDisplayName();
    const matchesPhone = Boolean(phoneDigits.slice(-4) && headerPhone.endsWith(phoneDigits.slice(-4)));
    const matchesName = Boolean(contactName && normalizeExtractedText(headerName).toLowerCase().includes(normalizeExtractedText(contactName).toLowerCase()));
    const changed = Boolean(headerText && headerText !== previousHeaderText);
    return matchesPhone || matchesName || changed ? header : null;
  }, 6500);
  debugContactFlow("open-chat-header-check", {
    query,
    opened: Boolean(openedHeader),
    headerText: normalizeExtractedText(openedHeader?.innerText ?? ""),
    activeName: getActiveChatDisplayName()
  });
  if (openedHeader) clearWhatsAppSidebarSearchField({ pressEscapeAfterClear: false });
  return Boolean(openedHeader);
}

function clearWhatsAppSidebarSearchField(options: { pressEscapeAfterClear?: boolean } = {}) {
  const searchField = findWhatsAppSidebarSearchField();
  if (!searchField) return;
  setContactFieldValue(searchField, "");
  searchField.blur();
  if (options.pressEscapeAfterClear ?? true) {
    pressEscape();
  }
}

function closeWhatsAppSidebarSearchOverlay() {
  const searchField = findWhatsAppSidebarSearchField();
  searchField?.blur();
  pressEscape();
  window.setTimeout(pressEscape, 80);
}

function findWhatsAppSidebarSearchField() {
  const sidebar = document.querySelector<HTMLElement>("#side") ?? document.body;
  const fields = Array.from(sidebar.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>(
    'input, textarea, [contenteditable="true"], [role="textbox"]'
  ))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element))
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

  return fields.find((field) =>
    /поиск|search|имени|номеру|name|number/i.test([
      field.getAttribute("aria-label"),
      field.getAttribute("placeholder"),
      field.getAttribute("data-lexical-placeholder"),
      field.getAttribute("title"),
      field.closest("label")?.textContent
    ].filter(Boolean).join(" "))
  ) ?? fields[0] ?? null;
}

function findWhatsAppChatSearchResult(phoneDigits: string, contactName: string, query = "") {
  const sidebar = document.querySelector<HTMLElement>("#side") ?? document.body;
  const expectedPhone = normalizePhoneSearch(phoneDigits);
  const expectedLast4 = expectedPhone.slice(-4);
  const expectedName = normalizeExtractedText(contactName).toLowerCase();
  const queryDigits = normalizePhoneSearch(query);
  const isPhoneLookup = queryDigits.length >= 7;
  const rows = Array.from(sidebar.querySelectorAll<HTMLElement>("[role='listitem'], [role='button'], [tabindex], div"))
    .filter((element) => {
      if (!isVisibleElement(element) || isGpbElement(element)) return false;
      const rect = element.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      if (rect.left < sidebarRect.left - 2 || rect.right > sidebarRect.right + 16) return false;
      if (rect.height < 36 || rect.height > 140) return false;

      const text = normalizeExtractedText(getElementActionText(element));
      if (!text || /^(все|непрочитанное|избранное|группы)$/i.test(text)) return false;
      if (/новая\s+группа|новый\s+контакт|new\s+group|new\s+contact|поиск|search/i.test(text)) return false;
      const normalizedTextPhone = normalizePhoneSearch(text);
      const hasPhone = Boolean(expectedLast4 && normalizedTextPhone.endsWith(expectedLast4));
      const hasName = Boolean(expectedName && text.toLowerCase().includes(expectedName));
      const isLikelyContactResult = isPhoneLookup &&
        rect.width >= sidebarRect.width * 0.68 &&
        rect.height >= 48 &&
        !/чаты,\s*контакты\s*и\s*сообщения\s*не\s*найдены|не\s*найден|not\s*found|no\s*results|пригласить|invite/i.test(text);
      return hasPhone || hasName || isLikelyContactResult;
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

  const matched = rows[0] ?? null;
  return matched ? findChatResultRow(matched, sidebar) ?? findWideActionRow(matched, sidebar) ?? findClickableAncestor(matched, sidebar) ?? matched : null;
}

function findChatResultRow(element: HTMLElement, sidebar: HTMLElement) {
  let current: HTMLElement | null = element;
  let best: HTMLElement | null = null;

  for (let depth = 0; current && depth < 10; depth += 1) {
    const rect = current.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const text = normalizeExtractedText(getElementActionText(current));
    const isInSidebar = rect.left >= sidebarRect.left - 2 && rect.right <= sidebarRect.right + 18;
    const isChatRow = isInSidebar && rect.width >= sidebarRect.width * 0.68 && rect.height >= 44 && rect.height <= 118;
    if (isChatRow && !/поиск|search|новый\s+контакт|new\s+contact/i.test(text)) {
      best = current;
    }
    if (current.parentElement === sidebar) break;
    current = current.parentElement;
  }

  return best;
}

function clickWhatsAppResultRow(element: HTMLElement) {
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const points = [
    { x: rect.left + Math.min(88, rect.width * 0.22), y: rect.top + rect.height / 2 },
    { x: rect.left + rect.width * 0.5, y: rect.top + rect.height / 2 },
    { x: rect.left + rect.width * 0.82, y: rect.top + rect.height / 2 }
  ];

  for (const point of points) {
    const target = document.elementFromPoint(point.x, point.y);
    const targetElement = target instanceof HTMLElement ? target : element;
    clickWhatsAppElement(targetElement);
  }
  clickWhatsAppElement(element);
}

function writePendingContactSave(contact: { name: string; phone: string }) {
  window.localStorage.setItem(PENDING_CONTACT_SAVE_KEY, JSON.stringify(contact));
}

function readPendingContactSave() {
  try {
    const rawValue = window.localStorage.getItem(PENDING_CONTACT_SAVE_KEY);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as Partial<{ name: string; phone: string }>;
    const phone = formatPhoneDigits(parsed.phone ?? "");
    const name = getSafeGuestName(parsed.name ?? "", phone);
    return phone && name ? { name, phone } : null;
  } catch {
    return null;
  }
}

function clearPendingContactSave() {
  window.localStorage.removeItem(PENDING_CONTACT_SAVE_KEY);
}

function findProfileActionButton(root: HTMLElement, pattern: RegExp) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span, div"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element))
    .sort((left, right) => getElementActionText(left).length - getElementActionText(right).length);

  const matched = candidates.find((element) => pattern.test(getElementActionText(element)));
  if (!matched) return null;
  return matched.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? matched;
}

function findProfileAddContactButton(root: HTMLElement) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span, div"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element))
    .sort((left, right) => getElementActionText(left).length - getElementActionText(right).length);

  const exactTextMatch = candidates.find((element) => {
    const text = getElementActionText(element).trim();
    if (!/^(добавить|add)$/i.test(text)) return false;
    const rect = element.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    return rect.left >= rootRect.left && rect.right <= rootRect.right && rect.top > rootRect.top + 80;
  });
  if (exactTextMatch) return exactTextMatch;

  const iconMatch = candidates.find((element) => {
    const text = [
      element.getAttribute("data-icon"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" ");
    if (!/person-add|add-user|contact-add|добавить/i.test(text)) return false;
    const actionText = getElementActionText(element);
    return !/поиск|search|избран|favorite/i.test(actionText) && actionText.length <= 80;
  });
  if (iconMatch) return iconMatch.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? iconMatch;

  const matched = candidates.find((element) => {
    const text = getElementActionText(element);
    if (/избран|favorite|star/i.test(text)) return false;
    if (text.length > 50) return false;
    return /^(добавить|add)$/i.test(text.trim()) ||
      /\bдобавить\b/i.test(text) ||
      /добавить\s+контакт|add\s+contact|создать\s+контакт|new\s+contact/i.test(text);
  });

  if (!matched) return null;
  const clickable = matched.closest<HTMLElement>("[role='button'], button, [tabindex]");
  if (!clickable) return matched;
  const clickableText = getElementActionText(clickable);
  if (/\bдобавить\b/i.test(clickableText) && /\bпоиск\b/i.test(clickableText)) return matched;
  return clickableText.length <= 80 ? clickable : matched;
}

function profilePanelHasPhone(profilePanel: HTMLElement, phone: string) {
  const expected = normalizePhoneSearch(phone);
  if (!expected) return false;
  const visibleText = getDebugText(profilePanel);
  const actual = normalizePhoneSearch(extractPhoneFromText(visibleText) || visibleText);
  return Boolean(actual && (actual === expected || actual.endsWith(expected.slice(-10))));
}

function profilePanelMatchesContactName(profilePanel: HTMLElement, contactName: string) {
  const expectedName = normalizeExtractedText(contactName).toLowerCase();
  if (!expectedName) return false;
  const visibleText = normalizeExtractedText(getDebugText(profilePanel)).toLowerCase();
  const activeName = normalizeExtractedText(getActiveChatDisplayName()).toLowerCase();
  return Boolean(
    (activeName && activeName === expectedName) ||
    (visibleText && visibleText.includes(expectedName))
  );
}

function findProfileEditIcon(root: HTMLElement) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span[data-icon], [aria-label], [title], svg"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element));

  const byIcon = candidates.find((element) =>
    isProfileHeaderAction(element, root) && /edit|pencil|compose|карандаш|редакт/i.test([
      element.getAttribute("data-icon"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" "))
  );
  if (byIcon) return byIcon.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? byIcon;

  return candidates
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      return isProfileHeaderAction(element, root) && rect.left > rootRect.right - 130 && rect.width <= 70 && rect.height <= 70;
    })
    .sort((left, right) => right.getBoundingClientRect().right - left.getBoundingClientRect().right)[0] ?? null;
}

function isProfileHeaderAction(element: HTMLElement, root: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const text = getElementActionText(element);
  if (/примечан|note|поиск|search|поделиться|share|добавить|add|избран|favorite/i.test(text)) return false;
  return rect.top >= rootRect.top - 12 &&
    rect.top <= rootRect.top + 96 &&
    rect.left >= rootRect.left &&
    rect.right <= rootRect.right + 24;
}

function findContactSaveButton(root: ParentNode = document) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span[data-icon], [aria-label], [title]"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element));

  const bottomAction = findBottomContactSaveButton(candidates, root);
  if (bottomAction) return bottomAction;

  const byText = candidates.find((element) =>
    /сохранить|готово|создать|save|done|create/i.test(getElementActionText(element))
  );
  if (byText) return byText.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? byText;

  const byIcon = candidates.find((element) =>
    /check|done|tick|галоч|подтверд/i.test([
      element.getAttribute("data-icon"),
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ].filter(Boolean).join(" "))
  );
  if (byIcon) return byIcon.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? byIcon;

  const rightSideAction = candidates
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const rootRect = root instanceof HTMLElement ? root.getBoundingClientRect() : { right: window.innerWidth };
      return rect.left > rootRect.right - 120 && rect.width <= 80 && rect.height <= 80;
    })
    .sort((left, right) => right.getBoundingClientRect().right - left.getBoundingClientRect().right)[0];
  return rightSideAction?.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? rightSideAction ?? null;
}

function findBottomContactSaveButton(candidates: HTMLElement[], root: ParentNode) {
  const rootRect = root instanceof HTMLElement
    ? root.getBoundingClientRect()
    : { bottom: window.innerHeight, left: 0, right: window.innerWidth };
  const rootCenter = (rootRect.left + rootRect.right) / 2;
  const formPanel = findContactFormPanel();
  const formRect = formPanel?.getBoundingClientRect();

  const bottomCandidate = candidates
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const text = [
        element.getAttribute("data-icon"),
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.textContent
      ].filter(Boolean).join(" ");
      const isBottom = root instanceof HTMLElement
        ? rect.top > rootRect.bottom - 130
        : rect.top > window.innerHeight - 150;
      const isButtonSize = rect.width >= 32 && rect.width <= 96 && rect.height >= 32 && rect.height <= 96;
      const panelCenter = formRect ? (formRect.left + formRect.right) / 2 : rootCenter;
      const isCentered = Math.abs((rect.left + rect.right) / 2 - panelCenter) < 140;
      const isInPanelColumn = formRect ? rect.left >= formRect.left - 80 && rect.right <= formRect.right + 80 : true;
      const looksLikeSave = /check|done|tick|галоч|сохранить|save|create|создать/i.test(text) ||
        /rgb\(0,\s*0,\s*0\)|rgb\(17,\s*27,\s*33\)|rgb\(32,\s*44,\s*51\)/i.test(style.backgroundColor);
      return isBottom && isButtonSize && isCentered && isInPanelColumn && looksLikeSave;
    })
    .sort((left, right) => right.getBoundingClientRect().bottom - left.getBoundingClientRect().bottom)[0];

  return bottomCandidate?.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? bottomCandidate ?? null;
}

function findContactFormPanel() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-testid*="drawer"], [data-testid*="panel"], [role="dialog"], aside, section, div'))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element));

  const explicitContactForm = candidates
    .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)
    .reverse()
    .find((element) =>
      /новый\s+контакт|редактировать\s+контакт|изменить\s+контакт|new\s+contact|edit\s+contact/i.test(element.innerText || element.getAttribute("aria-label") || "")
    );
  if (explicitContactForm) return explicitContactForm;

  return candidates
    .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)
    .reverse()
    .find((element) => {
      const text = element.innerText || element.getAttribute("aria-label") || "";
      if (!/данные\s+контакта|contact\s+details/i.test(text)) return false;
      return Array.from(element.querySelectorAll<HTMLElement>("input, textarea, [contenteditable='true'], [role='textbox']"))
        .some((field) => isVisibleElement(field) && !isGpbElement(field));
    }) ?? null;
}

function findEditableContactFormPanel() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-testid*="drawer"], [data-testid*="panel"], [role="dialog"], aside, section, div'))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element));

  return candidates
    .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)
    .reverse()
    .find((element) =>
      /новый\s+контакт|редактировать\s+контакт|изменить\s+контакт|new\s+contact|edit\s+contact/i.test(element.innerText || element.getAttribute("aria-label") || "")
    ) ?? null;
}

function findGlobalWhatsAppActionButton(pattern: RegExp, root: ParentNode = document) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span, div, [aria-label], [title]"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element))
    .sort((left, right) => getElementActionText(left).length - getElementActionText(right).length);
  const matched = candidates.find((element) => pattern.test(getElementActionText(element)));
  return matched?.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? matched ?? null;
}

async function fillWhatsAppContactForm(contactName: string, contactPhone: string, root: HTMLElement, options: { fillPhone?: boolean } = {}) {
  const name = normalizeExtractedText(contactName);
  const phone = formatPhoneDigits(contactPhone);
  const formPhone = getPhoneForContactForm(phone);
  const shouldFillPhone = options.fillPhone ?? true;
  debugContactFlow("contact-form-fill-start", {
    name,
    phone,
    formPhone,
    shouldFillPhone,
    rootText: getDebugText(root)
  });
  const pageFilled = await fillWhatsAppContactFormInPage(name, formPhone, shouldFillPhone);
  debugContactFlow("contact-form-bridge-final", { pageFilled });
  if (pageFilled) return true;
  if (!shouldFillPhone) {
    debugContactFlow("contact-form-skip-fallback", { reason: "profile form name-only mode" });
    return false;
  }

  const fields = getContactFormFieldsForPanel(root);
  let filledName = false;
  let filledPhone = false;

  if (name) {
    const nameField = findContactNameField(root, fields);
    if (nameField) {
      highlightContactField(nameField);
      if (getContactFieldValue(nameField).trim() !== name) {
        await forceContactFieldValue(nameField, name, (value) => value.trim() === name);
      }
      const clearedLastNames = await clearContactLastNameFields(root, fields, nameField);
      debugContactFlow("contact-form-last-name-cleared", { count: clearedLastNames.length, values: clearedLastNames });
      filledName = getContactFieldValue(nameField).trim() === name;
      debugContactFlow("contact-form-name-field", {
        found: true,
        value: getContactFieldValue(nameField),
        filledName,
        text: getDebugText(nameField)
      });
    } else {
      debugContactFlow("contact-form-name-field", { found: false });
      filledName = false;
    }
  }

  if (shouldFillPhone && phone) {
    const phoneField = findContactInputField(fields, /телефон|phone|mobile|номер/i) ?? findLikelyContactPhoneField(fields) ?? fields.find((field) => extractPhoneFromText(getContactFieldValue(field)));
    if (phoneField) {
      await forceContactFieldValue(phoneField, formPhone, (value) =>
        Boolean(extractPhoneFromText(value) || value.replace(/\D/g, "").length >= 7)
      );
      filledPhone = Boolean(extractPhoneFromText(getContactFieldValue(phoneField)) || getContactFieldValue(phoneField).replace(/\D/g, "").length >= 7);
      debugContactFlow("contact-form-phone-field", {
        found: true,
        value: getContactFieldValue(phoneField),
        filledPhone,
        text: getDebugText(phoneField)
      });
    } else {
      debugContactFlow("contact-form-phone-field", { found: false });
      filledPhone = false;
    }
  }

  debugContactFlow("contact-form-fallback-result", { filledName, filledPhone, shouldFillPhone, hasPhone: Boolean(phone) });
  return filledName && (filledPhone || !shouldFillPhone || !phone);
}

function getContactFormFieldsForPanel(root: HTMLElement) {
  const scopedFields = Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>("input, textarea, [contenteditable='true'], [role='textbox']"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element));
  if (scopedFields.length) return scopedFields;

  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>("input, textarea, [contenteditable='true'], [role='textbox']"))
    .filter((element) => {
      if (!isVisibleElement(element) || isGpbElement(element)) return false;
      if (element.closest("footer, #main footer")) return false;
      return isElementInContactFormColumn(element, root);
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
    });
}

async function fillWhatsAppContactFormInPage(name: string, phone: string, fillPhone: boolean) {
  await ensureWhatsAppContactFormBridge();

  return new Promise<boolean>((resolve) => {
    const requestId = `gpb-contact-form-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("gpb-contact-form-filled", onResult as EventListener);
      debugContactFlow("contact-form-bridge-timeout", { name, phone, fillPhone });
      resolve(false);
    }, 4500);

    function onResult(event: Event) {
      const detail = (event as CustomEvent<{ requestId: string; ok: boolean; reason?: string; nameValue?: string; phoneValue?: string; lastNameValues?: string[] }>).detail;
      if (detail?.requestId !== requestId) return;

      window.clearTimeout(timeoutId);
      window.removeEventListener("gpb-contact-form-filled", onResult as EventListener);
      const expectedPhoneDigits = normalizePhoneSearch(phone);
      const actualPhoneDigits = normalizePhoneSearch(detail.phoneValue ?? "");
      const phoneReallyFilled = !fillPhone || !expectedPhoneDigits ||
        actualPhoneDigits === expectedPhoneDigits ||
        actualPhoneDigits.endsWith(expectedPhoneDigits.slice(-10));
      debugContactFlow("contact-form-bridge-result", {
        ok: Boolean(detail.ok),
        reason: detail.reason ?? "",
        nameValue: detail.nameValue ?? "",
        phoneValue: detail.phoneValue ?? "",
        lastNameValues: detail.lastNameValues ?? [],
        phoneReallyFilled
      });
      resolve(Boolean(detail.ok && phoneReallyFilled));
    }

    window.addEventListener("gpb-contact-form-filled", onResult as EventListener);
    window.dispatchEvent(new CustomEvent("gpb-fill-contact-form", {
      detail: {
        fillPhone,
        name,
        phone,
        requestId
      }
    }));
  });
}

function ensureWhatsAppContactFormBridge() {
  const existingScript = document.getElementById("gpb-whatsapp-contact-form-bridge") as HTMLScriptElement | null;
  if (existingScript?.dataset.ready === "true") return Promise.resolve();

  return new Promise<void>((resolve) => {
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(resolve, 500);
      return;
    }

    const script = document.createElement("script");
    script.id = "gpb-whatsapp-contact-form-bridge";
    script.src = chrome.runtime.getURL("whatsapp-contact-form-bridge.js");
    script.onload = () => {
      script.dataset.ready = "true";
      resolve();
    };
    script.onerror = () => resolve();
    document.documentElement.appendChild(script);
  });
}

function findContactNameField(root: HTMLElement, fields: Array<HTMLInputElement | HTMLTextAreaElement | HTMLElement>) {
  const activeField = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
    ? fields.find((field) => field === document.activeElement)
    : null;
  if (activeField && isLikelyWhatsAppNameField(activeField)) return activeField;

  const labelField = findFieldByExactLabel(root, fields, /^(имя|name|first name)$/i);
  if (labelField) return labelField;

  const rootRect = root.getBoundingClientRect();
  const textFields = fields
    .filter((field) => {
      const rect = field.getBoundingClientRect();
      const value = getContactFieldValue(field);
      const text = [
        field.getAttribute("aria-label"),
        field.getAttribute("placeholder"),
        field.getAttribute("data-lexical-placeholder"),
        field.getAttribute("name"),
        field.id,
        value
      ].filter(Boolean).join(" ");
      return rect.top > rootRect.top + 45 &&
        rect.top < rootRect.top + 250 &&
        !extractPhoneFromText(value) &&
        !/фамилия|last|страна|country|код|code|телефон|phone|mobile|номер/i.test(text);
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

  return textFields[0] ?? findContactInputField(fields, /имя|name|first/i) ?? findLikelyContactNameField(fields);
}

function isContactPhoneLikeField(field: HTMLInputElement | HTMLTextAreaElement | HTMLElement) {
  const text = [
    field.getAttribute("aria-label"),
    field.getAttribute("placeholder"),
    field.getAttribute("data-lexical-placeholder"),
    field.getAttribute("name"),
    field.id,
    field.closest("label")?.textContent,
    field.parentElement?.textContent,
    getContactFieldValue(field)
  ].filter(Boolean).join(" ");

  return Boolean(extractPhoneFromText(getContactFieldValue(field)) || /страна|country|код|code|телефон|phone|mobile|номер/i.test(text));
}

function findContactLastNameFields(
  root: HTMLElement,
  fields: Array<HTMLInputElement | HTMLTextAreaElement | HTMLElement>,
  nameField: HTMLInputElement | HTMLTextAreaElement | HTMLElement
) {
  const found = new Set<HTMLInputElement | HTMLTextAreaElement | HTMLElement>();
  const labelField = findFieldByExactLabel(root, fields, /^(фамилия|last name|last|surname)$/i);
  if (labelField && labelField !== nameField && !isContactPhoneLikeField(labelField)) found.add(labelField);

  const rootRect = root.getBoundingClientRect();
  const nameRect = nameField.getBoundingClientRect();
  const phoneField = findContactInputField(fields, /телефон|phone|mobile|номер/i) ?? findLikelyContactPhoneField(fields);
  const phoneTop = phoneField?.getBoundingClientRect().top ?? rootRect.top + 420;
  fields
    .filter((field) => {
      if (field === nameField || field === phoneField) return false;
      const rect = field.getBoundingClientRect();
      return rect.top > nameRect.bottom + 18 &&
        rect.top < phoneTop - 8 &&
        rect.top < rootRect.top + 340 &&
        !isContactPhoneLikeField(field);
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)
    .forEach((field) => found.add(field));

  return Array.from(found);
}

async function clearContactLastNameFields(
  root: HTMLElement,
  fields: Array<HTMLInputElement | HTMLTextAreaElement | HTMLElement>,
  nameField: HTMLInputElement | HTMLTextAreaElement | HTMLElement
) {
  const lastNameFields = findContactLastNameFields(root, fields, nameField);
  const values: string[] = [];
  for (const field of lastNameFields) {
    await forceContactFieldValue(field, "", (value) => value.trim() === "");
    values.push(getContactFieldValue(field));
  }
  return values;
}

function isLikelyWhatsAppNameField(field: HTMLInputElement | HTMLTextAreaElement | HTMLElement) {
  const value = getContactFieldValue(field);
  const text = [
    field.getAttribute("aria-label"),
    field.getAttribute("placeholder"),
    field.getAttribute("data-lexical-placeholder"),
    field.getAttribute("name"),
    field.id,
    value
  ].filter(Boolean).join(" ");

  return !extractPhoneFromText(value) &&
    !/фамилия|last|страна|country|код|code|телефон|phone|mobile|номер/i.test(text);
}

function findFieldByExactLabel(
  root: HTMLElement,
  fields: Array<HTMLInputElement | HTMLTextAreaElement | HTMLElement>,
  pattern: RegExp
) {
  const labels = Array.from(root.querySelectorAll<HTMLElement>("span, div, label"))
    .filter((element) => {
      if (!isVisibleElement(element) || isGpbElement(element)) return false;
      return pattern.test(normalizeExtractedText(element.textContent || ""));
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);

  for (const label of labels) {
    const labelRect = label.getBoundingClientRect();
    const nearestField = fields
      .filter((field) => {
        const rect = field.getBoundingClientRect();
        return rect.top >= labelRect.top - 8 &&
          rect.top <= labelRect.bottom + 42 &&
          rect.left >= labelRect.left - 12 &&
          rect.left <= labelRect.right + 320;
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return Math.abs(leftRect.top - labelRect.top) - Math.abs(rightRect.top - labelRect.top);
      })[0];
    if (nearestField) return nearestField;
  }

  return null;
}

function highlightContactField(field: HTMLElement) {
  const previousOutline = field.style.outline;
  const previousBoxShadow = field.style.boxShadow;
  field.style.outline = "3px solid #f59e0b";
  field.style.boxShadow = "0 0 0 4px rgba(245, 158, 11, 0.25)";
  window.setTimeout(() => {
    field.style.outline = previousOutline;
    field.style.boxShadow = previousBoxShadow;
  }, 1400);
}

async function forceContactFieldValue(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
  value: string,
  isReady: (currentValue: string) => boolean
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    setContactFieldValue(field, value);
    await waitForDelay(320);
    if (isReady(getContactFieldValue(field))) return true;
  }

  return isReady(getContactFieldValue(field));
}

function findContactInputField<T extends HTMLInputElement | HTMLTextAreaElement | HTMLElement>(fields: T[], pattern: RegExp) {
  return fields.find((field) =>
    pattern.test([
      field.getAttribute("aria-label"),
      field.getAttribute("placeholder"),
      field.getAttribute("data-lexical-placeholder"),
      field.getAttribute("name"),
      field.id,
      field.closest("label")?.textContent,
      field.parentElement?.textContent
    ].filter(Boolean).join(" "))
  ) ?? null;
}

function findLikelyContactNameField(fields: Array<HTMLInputElement | HTMLTextAreaElement | HTMLElement>) {
  return fields
    .filter((field) => {
      const text = [
        field.getAttribute("aria-label"),
        field.getAttribute("placeholder"),
        field.getAttribute("data-lexical-placeholder"),
        field.getAttribute("name"),
        field.id,
        field.closest("label")?.textContent,
        field.parentElement?.textContent,
        getContactFieldValue(field)
      ].filter(Boolean).join(" ");
      return !extractPhoneFromText(getContactFieldValue(field)) && !/фамилия|last|страна|country|телефон|phone|mobile|номер/i.test(text);
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0] ?? null;
}

function findLikelyContactPhoneField(fields: Array<HTMLInputElement | HTMLTextAreaElement | HTMLElement>) {
  return fields
    .filter((field) => {
      const text = [
        field.getAttribute("aria-label"),
        field.getAttribute("placeholder"),
        field.getAttribute("data-lexical-placeholder"),
        field.getAttribute("name"),
        field.id,
        field.closest("label")?.textContent,
        field.parentElement?.textContent
      ].filter(Boolean).join(" ");
      return !/страна|country|код|code/i.test(text);
    })
    .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)
    .at(-1) ?? null;
}

function getContactFieldValue(field: HTMLInputElement | HTMLTextAreaElement | HTMLElement) {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) return field.value;
  return field.textContent ?? "";
}

function setContactFieldValue(field: HTMLInputElement | HTMLTextAreaElement | HTMLElement, value: string) {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    setNativeInputValue(field, value);
    return;
  }

  field.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(field);
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.execCommand("delete", false);
  document.execCommand("insertText", false, value);
  field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
}

function setNativeInputValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value") ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") ??
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");

  field.focus();
  field.select();
  field.setSelectionRange?.(0, field.value.length);
  descriptor?.set?.call(field, "");
  field.value = "";
  field.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "deleteContentBackward", data: null }));
  field.dispatchEvent(new Event("change", { bubbles: true }));

  descriptor?.set?.call(field, value);
  field.value = value;
  field.setSelectionRange?.(field.value.length, field.value.length);
  field.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertReplacementText", data: value }));
  field.dispatchEvent(new Event("change", { bubbles: true }));

  if (field.value !== value) {
    descriptor?.set?.call(field, value);
    field.value = value;
    field.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertReplacementText", data: value }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  field.blur();
}

async function closeActiveWhatsAppChat() {
  const menuButton = findActiveChatMenuButton();
  if (!menuButton) return false;

  menuButton.click();
  const closeChatButton = await waitForElement(findCloseChatMenuItem, 1800);
  if (!closeChatButton) {
    pressEscape();
    return false;
  }

  closeChatButton.click();
  await waitForDelay(350);
  return true;
}

function findActiveChatMenuButton() {
  const header = document.querySelector<HTMLElement>("#main header");
  if (!header) return null;

  const candidates = Array.from(header.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span[data-icon], [aria-label], [title]"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element));
  const menuElement = candidates.reverse().find((element) =>
    /menu|more|ещ[её]|дополнительно|три точки|more-vert|ic-more/i.test([
      element.getAttribute("data-icon"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" "))
  );

  return menuElement?.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? menuElement ?? null;
}

function findCloseChatMenuItem() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[role='menuitem'], [role='button'], button, [tabindex], span, div"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element))
    .sort((left, right) => getElementActionText(left).length - getElementActionText(right).length);
  const matched = candidates.find((element) =>
    /закрыть\s+(окно\s+)?чата?|close\s+chat/i.test(getElementActionText(element))
  );
  return matched?.closest<HTMLElement>("[role='menuitem'], [role='button'], button, [tabindex]") ?? matched ?? null;
}

function closeWhatsAppProfilePanels() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const closeButton = findWhatsAppProfileCloseButton() ?? findWhatsAppCloseButton();
    if (closeButton) {
      clickWhatsAppElement(closeButton);
    } else {
      pressEscape();
    }
  }
}

function pressEscape() {
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape", code: "Escape" }));
  document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Escape", code: "Escape" }));
}

function findWhatsAppCloseButton() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span[data-icon], [aria-label], [title]"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element));

  const closeElement = candidates.find((element) =>
    /x|close|назад|закрыть|отмена|back|ic-close/i.test([
      element.getAttribute("data-icon"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" "))
  );

  return closeElement?.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? closeElement ?? null;
}

function findWhatsAppProfileCloseButton() {
  const profilePanel = findVisibleProfilePanel();
  if (!profilePanel) return null;

  const panelRect = profilePanel.getBoundingClientRect();
  const candidates = Array.from(profilePanel.querySelectorAll<HTMLElement>("[role='button'], button, [tabindex], span[data-icon], [aria-label], [title], svg"))
    .filter((element) => isVisibleElement(element) && !isGpbElement(element));

  const closeByText = candidates.find((element) => {
    const rect = element.getBoundingClientRect();
    const text = [
      element.getAttribute("data-icon"),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" ");
    const isTopLeft = rect.left <= panelRect.left + 86 && rect.top <= panelRect.top + 92;
    return isTopLeft && /x|close|закрыть|ic-close/i.test(text);
  });
  if (closeByText) return closeByText.closest<HTMLElement>("[role='button'], button, [tabindex]") ?? closeByText;

  return candidates
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const isTopLeft = rect.left <= panelRect.left + 86 && rect.top <= panelRect.top + 92;
      const isRoundButtonSize = rect.width >= 28 && rect.width <= 72 && rect.height >= 28 && rect.height <= 72;
      return isTopLeft && isRoundButtonSize;
    })
    .sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left)[0] ?? null;
}

function getElementActionText(element: HTMLElement) {
  return [
    element.innerText,
    element.textContent,
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-icon")
  ].filter(Boolean).join(" ");
}

function clickNearestProfileButton(element: HTMLElement) {
  const clickable = element.closest<HTMLElement>("[role='button'], button, [tabindex]");
  if (clickable) {
    clickable.click();
    return;
  }

  let parent = element.parentElement;
  for (let depth = 0; parent && depth < 4; depth += 1) {
    parent.click();
    parent = parent.parentElement;
  }
}

function waitForProfileTextChange(previousText: string, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const nextText = getVisibleProfileText();
      if (nextText && nextText !== previousText) {
        window.clearInterval(intervalId);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(intervalId);
        resolve();
      }
    }, 120);
  });
}

function createChatId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 160);
}

function calculateBookingTotals(
  rooms: Room[],
  checkIn: string,
  checkOut: string,
  needsExtraBed: boolean,
  extraInventoryCount: number,
  hourlyHours: number,
  discountPercent: number,
  breakfastIncluded = true,
  breakfastPricePerPerson = 0
) {
  const nights = getNightsCount(checkIn, checkOut);
  const roomTotal = rooms.reduce((sum, room) => sum + calculateRoomStayPrice(room, checkIn, checkOut, hourlyHours), 0);
  const extraBedTotal = needsExtraBed && extraInventoryCount <= 0
    ? rooms.reduce((sum, room) => sum + (room.extraBedEnabled ? room.extraBedPrice * nights : 0), 0)
    : 0;
  const extraInventoryTotal = Math.max(0, extraInventoryCount) * getExtraPlaceUnitPrice(rooms) * nights;
  const breakfastDiscountAmount = breakfastIncluded
    ? 0
    : calculateBreakfastDiscountAmount(rooms, nights, extraInventoryCount, breakfastPricePerPerson);
  const subtotal = Math.max(0, roomTotal + extraBedTotal + extraInventoryTotal - breakfastDiscountAmount);
  const discountAmount = Math.round(subtotal * clampNumber(discountPercent, 0, 100) / 100);
  const total = Math.max(0, subtotal - discountAmount);
  return {
    breakfastDiscountAmount,
    discountAmount,
    discountPercent: clampNumber(discountPercent, 0, 100),
    prepayment: Math.round(total * 0.5),
    subtotal,
    total
  };
}

function getRoomDateRange(roomId: string, checkIn: string, checkOut: string, overrides: Record<string, { checkIn: string; checkOut: string }>) {
  const override = overrides[roomId];
  return {
    checkIn: override?.checkIn || checkIn,
    checkOut: override?.checkOut || checkOut
  };
}

function buildReservationItemsFromRooms(
  rooms: Room[],
  checkIn: string,
  checkOut: string,
  checkInTime: string,
  checkOutTime: string,
  roomDateOverrides: Record<string, { checkIn: string; checkOut: string }>,
  extraInventoryByRoomId: Record<string, { airBeds: number; rollaways: number }>,
  hourlyHours: number,
  reservationSubtotal: number,
  reservationDiscountAmount: number,
  reservationTotal: number,
  existingItems: ReservationItem[] = []
) {
  const existingByRoomId = new Map(existingItems.map((item) => [item.roomId, item]));
  const rawItems = rooms.map((room) => {
    const dateRange = getRoomDateRange(room.id, checkIn, checkOut, roomDateOverrides);
    const nights = getNightsCount(dateRange.checkIn, dateRange.checkOut);
    const roomInventory = extraInventoryByRoomId[room.id];
    const extraInventoryCount = (roomInventory?.airBeds ?? 0) + (roomInventory?.rollaways ?? 0);
    const extraInventoryTotal = extraInventoryCount * getExtraPlaceUnitPrice([room]) * nights;
    const subtotal = calculateRoomStayPrice(room, dateRange.checkIn, dateRange.checkOut, hourlyHours) + extraInventoryTotal;
    const existing = existingByRoomId.get(room.id);
    return {
      id: existing?.id ?? `item-${room.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      roomId: room.id,
      checkIn: dateRange.checkIn,
      checkOut: dateRange.checkOut,
      checkInTime,
      checkOutTime,
      subtotal,
      discountAmount: 0,
      total: subtotal,
      prepayment: Math.round(subtotal * 0.5),
      paidAmount: existing?.paidAmount ?? 0,
      balancePaidAt: existing?.balancePaidAt,
      checkedInAt: existing?.checkedInAt,
      checkedOutAt: existing?.checkedOutAt
    } satisfies ReservationItem;
  });
  const rawSubtotal = rawItems.reduce((sum, item) => sum + item.subtotal, 0) || reservationSubtotal || 0;
  let distributedTotal = 0;
  return rawItems.map((item, index) => {
    const isLast = index === rawItems.length - 1;
    const discountAmount = rawSubtotal > 0 ? Math.round(item.subtotal * reservationDiscountAmount / rawSubtotal) : 0;
    const total = isLast
      ? Math.max(0, reservationTotal - distributedTotal)
      : Math.max(0, item.subtotal - discountAmount);
    distributedTotal += total;
    return {
      ...item,
      discountAmount,
      total,
      prepayment: Math.round(total * 0.5)
    };
  });
}

function getReservationItems(reservation: Reservation, rooms: Room[] = []) {
  if (reservation.items?.length) return reservation.items;
  return reservation.roomIds.map((roomId) => {
    const room = rooms.find((item) => item.id === roomId);
    const subtotal = room ? calculateRoomStayPrice(room, reservation.checkIn, reservation.checkOut, reservation.hourlyHours) : 0;
    return {
      id: `legacy-${reservation.id}-${roomId}`,
      roomId,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      checkInTime: reservation.checkInTime,
      checkOutTime: reservation.checkOutTime,
      subtotal,
      discountAmount: 0,
      total: subtotal,
      prepayment: Math.round(subtotal * 0.5),
      paidAmount: 0,
      balancePaidAt: reservation.balancePaidAt,
      checkedInAt: reservation.checkedInAt,
      checkedOutAt: reservation.checkedOutAt
    } satisfies ReservationItem;
  });
}

function buildRoomDateOverridesFromReservation(reservation?: Reservation | null) {
  if (!reservation?.items?.length) return {};
  return Object.fromEntries(
    reservation.items
      .filter((item) => item.checkIn !== reservation.checkIn || item.checkOut !== reservation.checkOut)
      .map((item) => [item.roomId, { checkIn: item.checkIn, checkOut: item.checkOut }])
  );
}

function calculateBookingTotalsWithRoomDates(
  rooms: Room[],
  checkIn: string,
  checkOut: string,
  roomDateOverrides: Record<string, { checkIn: string; checkOut: string }>,
  needsExtraBed: boolean,
  extraInventoryByRoomId: Record<string, { airBeds: number; rollaways: number }>,
  extraInventoryCount: number,
  hourlyHours: number,
  discountPercent: number,
  breakfastIncluded = true,
  breakfastPricePerPerson = 0
) {
  const hasOverrides = Object.keys(roomDateOverrides).length > 0;
  if (!hasOverrides) {
    return calculateBookingTotals(rooms, checkIn, checkOut, needsExtraBed, extraInventoryCount, hourlyHours, discountPercent, breakfastIncluded, breakfastPricePerPerson);
  }

  const roomTotal = rooms.reduce((sum, room) => {
    const range = getRoomDateRange(room.id, checkIn, checkOut, roomDateOverrides);
    return sum + calculateRoomStayPrice(room, range.checkIn, range.checkOut, hourlyHours);
  }, 0);
  const extraBedTotal = needsExtraBed && extraInventoryCount <= 0
    ? rooms.reduce((sum, room) => {
      const range = getRoomDateRange(room.id, checkIn, checkOut, roomDateOverrides);
      return sum + (room.extraBedEnabled ? room.extraBedPrice * getNightsCount(range.checkIn, range.checkOut) : 0);
    }, 0)
    : 0;
  const extraInventoryTotal = rooms.reduce((sum, room) => {
    const range = getRoomDateRange(room.id, checkIn, checkOut, roomDateOverrides);
    const inventory = extraInventoryByRoomId[room.id];
    const count = (inventory?.airBeds ?? 0) + (inventory?.rollaways ?? 0);
    return sum + count * getExtraPlaceUnitPrice([room]) * getNightsCount(range.checkIn, range.checkOut);
  }, 0);
  const fallbackNights = getNightsCount(checkIn, checkOut);
  const breakfastDiscountAmount = breakfastIncluded
    ? 0
    : calculateBreakfastDiscountAmount(rooms, fallbackNights, extraInventoryCount, breakfastPricePerPerson);
  const subtotal = Math.max(0, roomTotal + extraBedTotal + extraInventoryTotal - breakfastDiscountAmount);
  const discountAmount = Math.round(subtotal * clampNumber(discountPercent, 0, 100) / 100);
  const total = Math.max(0, subtotal - discountAmount);
  return {
    breakfastDiscountAmount,
    discountAmount,
    discountPercent: clampNumber(discountPercent, 0, 100),
    prepayment: Math.round(total * 0.5),
    subtotal,
    total
  };
}

function applyDynamicPricingToRooms({
  checkIn,
  dynamicPricingEnabled,
  dynamicPricingMarginPercent,
  dynamicPricingSeasonEnd,
  expenseEntries,
  reservations,
  rooms
}: {
  checkIn: string;
  dynamicPricingEnabled: boolean;
  dynamicPricingMarginPercent: number;
  dynamicPricingSeasonEnd: string;
  expenseEntries: ExpenseEntry[];
  reservations: Reservation[];
  rooms: Room[];
}) {
  if (!dynamicPricingEnabled) return rooms;

  const from = checkIn || formatDateInput(new Date());
  const fallbackSeasonEnd = formatDateInput(new Date(parseDateInput(from).getFullYear(), 11, 31));
  const seasonEnd = dynamicPricingSeasonEnd && dynamicPricingSeasonEnd >= from ? dynamicPricingSeasonEnd : fallbackSeasonEnd;
  const periodDates = getDateRangeNights(from, seasonEnd);
  if (!periodDates.length) return rooms;

  const stayRooms = rooms.filter((room) =>
    isStayBookingObject(room) &&
    room.bookable &&
    room.status === "active" &&
    !room.excludeFromBookingSummary
  );
  if (!stayRooms.length) return rooms;

  const periodExpenses = expenseEntries
    .filter((entry) => entry.paymentDate >= from && entry.paymentDate <= seasonEnd)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const periodReservations = reservations.filter((reservation) =>
    reservation.status === "booked" &&
    dateRangesOverlap(from, addDaysInput(seasonEnd, 1), reservation.checkIn, reservation.checkOut)
  );
  const periodRevenue = periodReservations.reduce((sum, reservation) => sum + getReservationFinance(reservation).revenue, 0);
  const remainingExpenseGap = Math.max(0, periodExpenses - periodRevenue);

  const bookedRoomNights = periodDates.reduce((sum, date) => {
    const nextDate = addDaysInput(date, 1);
    return sum + stayRooms.filter((room) =>
      reservations.some((reservation) =>
        reservation.status === "booked" &&
        reservation.roomIds.includes(room.id) &&
        dateRangesOverlap(date, nextDate, reservation.checkIn, reservation.checkOut)
      )
    ).length;
  }, 0);
  const totalRoomNights = stayRooms.length * periodDates.length;
  const freeRoomNights = Math.max(0, totalRoomNights - bookedRoomNights);
  if (!freeRoomNights || !remainingExpenseGap) return rooms;

  const occupancyRate = totalRoomNights > 0 ? bookedRoomNights / totalRoomNights : 0;
  const freeRate = freeRoomNights / Math.max(1, totalRoomNights);
  const autoMarginPercent = Math.round(clampNumber(8 + occupancyRate * 22 + (1 - freeRate) * 8, 8, 38));
  const marginPercent = dynamicPricingMarginPercent > 0 ? dynamicPricingMarginPercent : autoMarginPercent;
  const baseRequiredPrice = remainingExpenseGap / freeRoomNights;
  const requiredPriceWithMargin = baseRequiredPrice * (1 + marginPercent / 100);
  const averageBasePrice = Math.max(1, Math.round(
    periodDates.reduce((sum, date) => sum + stayRooms.reduce((roomSum, room) => roomSum + getBaseRoomPriceForDate(room, date), 0), 0) /
    Math.max(1, totalRoomNights)
  ));

  return rooms.map((room) => {
    if (!stayRooms.some((stayRoom) => stayRoom.id === room.id)) return room;
    const dynamicPricesByDate = periodDates.reduce<Record<string, number>>((prices, date) => {
      const nextDate = addDaysInput(date, 1);
      const isBooked = reservations.some((reservation) =>
        reservation.status === "booked" &&
        reservation.roomIds.includes(room.id) &&
        dateRangesOverlap(date, nextDate, reservation.checkIn, reservation.checkOut)
      );
      const basePrice = getBaseRoomPriceForDate(room, date);
      if (isBooked || basePrice <= 0) {
        prices[date] = basePrice;
        return prices;
      }
      const roomWeight = basePrice / averageBasePrice;
      prices[date] = roundPriceToStep(Math.max(basePrice, requiredPriceWithMargin * roomWeight), 100);
      return prices;
    }, {});
    const weekdayPrice = getDynamicTypePrice(room, dynamicPricesByDate, "weekday");
    const weekendPrice = getDynamicTypePrice(room, dynamicPricesByDate, "weekend");
    const holidayPrice = getDynamicTypePrice(room, dynamicPricesByDate, "holiday");
    return {
      ...room,
      basePrice: weekdayPrice,
      dynamicPricingApplied: true,
      dynamicPricingBasePrice: getBaseRoomPriceForDate(room, from),
      dynamicPricesByDate,
      holidayPrice,
      weekdayPrice,
      weekendPrice
    };
  });
}

function getDateRangeNights(from: string, to: string) {
  const days: string[] = [];
  const start = parseDateInput(from);
  const end = parseDateInput(to);
  for (let day = new Date(start); day < end; day = addDays(day, 1)) {
    days.push(formatDateInput(day));
  }
  return days.length ? days : [from];
}

function addDaysInput(date: string, days: number) {
  return formatDateInput(addDays(parseDateInput(date), days));
}

function roundPriceToStep(price: number, step: number) {
  return Math.ceil(Math.max(0, price) / step) * step;
}

function getBaseRoomPriceForDate(room: Room, date: string) {
  if (room.dynamicPricesByDate) {
    room = { ...room, dynamicPricesByDate: undefined, dynamicPricingApplied: false };
  }
  if (!date) return room.weekdayPrice || room.basePrice || 0;
  if (isKazakhstanHoliday(date)) {
    return room.holidayPrice || room.weekendPrice || room.weekdayPrice || room.basePrice || 0;
  }

  return isWeekendDate(date)
    ? room.weekendPrice || room.weekdayPrice || room.basePrice || 0
    : room.weekdayPrice || room.basePrice || 0;
}

function getDynamicTypePrice(room: Room, pricesByDate: Record<string, number>, type: "weekday" | "weekend" | "holiday") {
  const prices = Object.entries(pricesByDate)
    .filter(([date]) => getPriceTypeForDate(date) === type)
    .map(([, price]) => price)
    .filter((price) => price > 0);
  if (prices.length) return Math.max(...prices);
  if (type === "holiday") return room.holidayPrice || room.weekendPrice || room.weekdayPrice || room.basePrice || 0;
  if (type === "weekend") return room.weekendPrice || room.weekdayPrice || room.basePrice || 0;
  return room.weekdayPrice || room.basePrice || 0;
}

function calculateBreakfastDiscountAmount(rooms: Room[], nights: number, extraInventoryCount: number, breakfastPricePerPerson: number) {
  const price = Math.max(0, breakfastPricePerPerson || 0);
  if (!price || !nights) return 0;
  const stayRooms = rooms.filter(isStayBookingObject);
  const sleepingPlaces = stayRooms.reduce((sum, room) => sum + calculateRoomSleepingPlacesTotal(room), 0) + Math.max(0, extraInventoryCount);
  return sleepingPlaces * nights * price;
}

function getExtraPlaceUnitPrice(rooms: Room[]) {
  const pricedRoom = rooms.find((room) => isStayBookingObject(room) && Number.isFinite(room.extraBedPrice));
  return pricedRoom ? Math.max(0, pricedRoom.extraBedPrice) : AIR_MATTRESS_PRICE;
}

function getEffectiveBookingTotals(totals: ReturnType<typeof calculateBookingTotals>, manualTotalAmount: number, discountPercent: number) {
  if (!manualTotalAmount) return totals;
  const subtotal = totals.subtotal || manualTotalAmount;
  const total = manualTotalAmount;
  const discountAmount = Math.max(0, subtotal - total);
  const effectiveDiscountPercent = subtotal > 0 ? Math.round(discountAmount * 100 / subtotal) : clampNumber(discountPercent, 0, 100);
  return {
    breakfastDiscountAmount: totals.breakfastDiscountAmount,
    discountAmount,
    discountPercent: effectiveDiscountPercent,
    prepayment: Math.round(total * 0.5),
    subtotal,
    total
  };
}

function calculateRoomStayPrice(room: Room, checkIn: string, checkOut: string, hourlyHours = 2) {
  if (isHourlyBookingObject(room)) {
    return getRoomPriceForDate(room, checkIn) * Math.max(2, hourlyHours);
  }

  if (!checkIn || !checkOut) return getRoomPriceForDate(room, checkIn);

  const nights = getNightsCount(checkIn, checkOut);
  let total = 0;
  for (let day = 0; day < nights; day += 1) {
    total += getRoomPriceForDate(room, formatDateInput(addDays(parseDateInput(checkIn), day)));
  }
  return total;
}

function getBookingDurationLabel(rooms: Room[], checkIn: string, checkOut: string, hourlyHours: number) {
  const hasNightlyRooms = rooms.some((room) => !isHourlyBookingObject(room));
  const hasHourlyRooms = rooms.some(isHourlyBookingObject);
  const parts = [];
  if (hasNightlyRooms) parts.push(`${getNightsCount(checkIn, checkOut)} ноч.`);
  if (hasHourlyRooms) parts.push(`${Math.max(2, hourlyHours)} ч.`);
  return parts.length ? parts.join(" · ") : `${getNightsCount(checkIn, checkOut)} ноч.`;
}

function getRoomPriceForDate(room: Room, date: string) {
  if (date && room.dynamicPricingApplied && room.dynamicPricesByDate?.[date]) {
    return room.dynamicPricesByDate[date];
  }
  if (!date) return room.weekdayPrice || room.basePrice || 0;
  if (isKazakhstanHoliday(date)) {
    return room.holidayPrice || room.weekendPrice || room.weekdayPrice || room.basePrice || 0;
  }

  return isWeekendDate(date)
    ? room.weekendPrice || room.weekdayPrice || room.basePrice || 0
    : room.weekdayPrice || room.basePrice || 0;
}

function isWeekendDate(date: string) {
  const day = parseDateInput(date).getDay();
  return day === 0 || day === 6;
}

function isKazakhstanHoliday(date: string) {
  return getKazakhstanHolidayDates(parseDateInput(date).getFullYear()).has(date) || getCustomHolidayDatesFromLocal().has(date);
}

function normalizeCustomHolidayDates(dates: string[]) {
  return Array.from(new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
}

function saveCustomHolidayDatesToLocal(dates: string[]) {
  window.localStorage.setItem(CUSTOM_HOLIDAY_DATES_STORAGE_KEY, JSON.stringify(normalizeCustomHolidayDates(dates)));
}

function saveCustomCatalogOptionsToLocal(amenities: string[], food: string[]) {
  window.localStorage.setItem(CUSTOM_AMENITY_OPTIONS_STORAGE_KEY, JSON.stringify(normalizeStringOptions(amenities)));
  window.localStorage.setItem(CUSTOM_FOOD_OPTIONS_STORAGE_KEY, JSON.stringify(normalizeStringOptions(food)));
}

function getCustomAmenityOptionsFromLocal() {
  return readStringOptionsFromLocal(CUSTOM_AMENITY_OPTIONS_STORAGE_KEY);
}

function getCustomFoodOptionsFromLocal() {
  return readStringOptionsFromLocal(CUSTOM_FOOD_OPTIONS_STORAGE_KEY);
}

function readStringOptionsFromLocal(key: string) {
  try {
    const options = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(options) ? normalizeStringOptions(options.filter((item): item is string => typeof item === "string")) : [];
  } catch {
    return [];
  }
}

function normalizeStringOptions(options: string[]) {
  return Array.from(new Set(options.map((item) => item.trim()).filter(Boolean)));
}

function getCustomHolidayDatesFromLocal() {
  try {
    const dates = JSON.parse(window.localStorage.getItem(CUSTOM_HOLIDAY_DATES_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(dates) ? normalizeCustomHolidayDates(dates) : []);
  } catch {
    return new Set<string>();
  }
}

function getKazakhstanHolidayDates(year: number) {
  const holidays = new Set<string>();
  const fixedHolidays = [
    [1, 1],
    [1, 2],
    [1, 7],
    [3, 8],
    [3, 21],
    [3, 22],
    [3, 23],
    [5, 1],
    [5, 7],
    [5, 9],
    [7, 6],
    [8, 30],
    [10, 25],
    [12, 16]
  ];
  const noTransfer = new Set([`${year}-01-07`]);

  fixedHolidays.forEach(([month, day]) => {
    holidays.add(formatDateInput(new Date(year, month - 1, day)));
  });

  const qurbanAitByYear: Record<number, string> = {
    2025: "2025-06-06",
    2026: "2026-05-27"
  };
  if (qurbanAitByYear[year]) {
    holidays.add(qurbanAitByYear[year]);
    noTransfer.add(qurbanAitByYear[year]);
  }

  const officialDates = [...holidays].sort();
  officialDates.forEach((holiday) => {
    if (noTransfer.has(holiday) || !isWeekendDate(holiday)) return;

    let transferDate = addDays(parseDateInput(holiday), 1);
    while (transferDate.getDay() === 0 || transferDate.getDay() === 6 || holidays.has(formatDateInput(transferDate))) {
      transferDate = addDays(transferDate, 1);
    }
    holidays.add(formatDateInput(transferDate));
  });

  KAZAKHSTAN_EXTRA_HOLIDAYS[year]?.forEach((holiday) => holidays.add(holiday));

  return holidays;
}

const KAZAKHSTAN_EXTRA_HOLIDAYS: Record<number, string[]> = {
  2025: ["2025-03-24", "2025-03-25", "2025-07-07", "2025-09-01", "2025-10-27"],
  2026: ["2026-03-09", "2026-03-24", "2026-03-25", "2026-05-11", "2026-08-31", "2026-10-26"]
};

function createSleepingPlace(type: SleepingPlaceType): SleepingPlace {
  const option = SLEEPING_PLACE_OPTIONS.find((item) => item.value === type) ?? SLEEPING_PLACE_OPTIONS[0];
  return {
    id: `sleep-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title: option.title,
    count: 1,
    placesCount: option.capacity,
    normalCapacity: option.capacity,
    denseCapacity: option.capacity,
    isMain: type !== "rollaway" && type !== "air-bed",
    allowSharedSameGender: type === "double-bed",
    pairOnly: false,
    childFriendly: true,
    adultFriendly: true,
    needsPreparation: type === "sofa-bed" || type === "rollaway" || type === "air-bed",
    extraPrice: 0,
    notes: ""
  };
}

function createSleepingPlacePatch(type: SleepingPlaceType): Partial<SleepingPlace> {
  const place = createSleepingPlace(type);
  return {
    type,
    title: place.title,
    placesCount: place.placesCount,
    isMain: place.isMain,
    normalCapacity: place.normalCapacity,
    denseCapacity: place.denseCapacity,
    allowSharedSameGender: place.allowSharedSameGender,
    needsPreparation: place.needsPreparation
  };
}

function getSleepingPlaceCapacity(place: Pick<SleepingPlace, "type" | "normalCapacity">) {
  if (place.type === "fixed-sofa") return 0;
  if (place.type === "double-bed") return 2;
  if (place.type === "sofa-bed") return 2;
  if (place.type === "custom") return Math.max(1, place.normalCapacity || 1);
  return 1;
}

function getSleepingPlacePlacesCount(place: Pick<SleepingPlace, "count" | "normalCapacity" | "placesCount" | "type">) {
  if (typeof place.placesCount === "number") return Math.max(0, place.placesCount);
  return Math.max(0, place.count || 0) * getSleepingPlaceCapacity(place);
}

function getAllowedExtraPlaceCount(room: Pick<Room, "objectType" | "category" | "sleepingPlaces">, type: ExtraBedType) {
  if (!isStayBookingObject(room)) return 0;
  return room.sleepingPlaces
    .filter((place) => place.type === type && place.count > 0)
    .reduce((sum, place) => sum + place.count, 0);
}

function buildAnalyticsSnapshot(
  reservations: Reservation[],
  drafts: Record<string, ChatBookingDraft>,
  rooms: Room[],
  guestContacts: GuestContact[],
  expenseEntries: ExpenseEntry[] = []
) {
  const bookedReservations = reservations.filter((reservation) => reservation.status === "booked");
  const cancelledReservations = reservations.filter((reservation) => reservation.status === "cancelled");
  const noShowReservations = reservations.filter((reservation) => reservation.noShowAt);
  const inquiryKeys = new Set<string>();
  const clientKeys = new Set<string>();
  const agreementKeys = new Set<string>();

  for (const contact of guestContacts) {
    const key = getAnalyticsPersonKey(contact.phone, contact.appeal);
    if (key) inquiryKeys.add(key);
  }

  for (const reservation of reservations) {
    const key = getAnalyticsPersonKey(reservation.phone, reservation.guestFirstName);
    if (!key) continue;
    if (reservation.status === "pending") {
      agreementKeys.add(key);
    }
    if (reservation.checkedInAt) {
      clientKeys.add(key);
      inquiryKeys.delete(key);
    }
  }

  Object.entries(drafts).forEach(([chatId, draft]) => {
    if (!draft.agreementEverSent && !draft.agreementSent) return;
    agreementKeys.add(getAnalyticsPersonKey(draft.phone, draft.guestFirstName) || chatId);
  });

  const reservationFinances = reservations.map(getReservationFinance);
  const revenue = reservationFinances.reduce((sum, finance) => sum + finance.revenue, 0);
  const bookedRevenue = bookedReservations.reduce((sum, reservation) => sum + getReservationFinance(reservation).revenue, 0);
  const prepayments = reservationFinances.reduce((sum, finance) => sum + finance.prepayment, 0);
  const balancePayments = reservationFinances.reduce((sum, finance) => sum + finance.balancePayment, 0);
  const outstandingBalance = reservationFinances.reduce((sum, finance) => sum + finance.outstandingBalance, 0);
  const expenses = expenseEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const profitAfterExpenses = revenue - expenses;
  const expenseCategoryTotals = new Map<string, number>();
  expenseEntries.forEach((entry) => {
    expenseCategoryTotals.set(entry.title, (expenseCategoryTotals.get(entry.title) ?? 0) + entry.amount);
  });
  const expenseCategories = Array.from(expenseCategoryTotals.entries())
    .map(([title, amount]) => ({ title, amount }))
    .sort((left, right) => right.amount - left.amount);
  const roomSales = rooms
    .map((room) => {
      const soldReservations = bookedReservations.filter((reservation) => reservation.roomIds.includes(room.id));
      return {
        id: room.id,
        number: room.number || "Без номера",
        title: room.title || getObjectTypeLabel(room),
        count: soldReservations.length,
        revenue: soldReservations.reduce((sum, reservation) => sum + reservation.total / Math.max(1, reservation.roomIds.length), 0)
      };
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || right.revenue - left.revenue);

  return {
    averageSale: bookedReservations.length ? Math.round(bookedRevenue / bookedReservations.length) : 0,
    balancePayments,
    booked: bookedReservations.length,
    cancelled: cancelledReservations.length,
    clients: clientKeys.size,
    expenseCategories,
    expenses,
    inquiries: inquiryKeys.size,
    noShows: noShowReservations.length,
    outstandingBalance,
    pending: agreementKeys.size,
    prepayments,
    profitAfterExpenses,
    recentReservations: [...reservations]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 50),
    revenue,
    roomSales
  };
}

function buildAnalyticsPriceRecommendation({
  analytics,
  dateFrom,
  dateTo,
  expenseEntries,
  reservations,
  rooms
}: {
  analytics: ReturnType<typeof buildAnalyticsSnapshot>;
  dateFrom: string;
  dateTo: string;
  expenseEntries: ExpenseEntry[];
  reservations: Reservation[];
  rooms: Room[];
}) {
  const period = buildAnalyticsRecommendationPeriod(dateFrom, dateTo, reservations, expenseEntries);
  const stayRooms = rooms
    .filter((room) => isStayBookingObject(room))
    .filter((room) => room.bookable && room.status === "active" && !room.excludeFromBookingSummary);
  const periodDates = getDateRangeDays(period.from, period.to);
  const availableRoomNights = periodDates.reduce((sum, date) => {
    const nextDate = formatDateInput(addDays(parseDateInput(date), 1));
    const availableRooms = stayRooms.filter((room) =>
      !reservations.some((reservation) =>
        reservation.status === "booked" &&
        reservation.roomIds.includes(room.id) &&
        dateRangesOverlap(date, nextDate, reservation.checkIn, reservation.checkOut)
      )
    );
    return sum + availableRooms.length;
  }, 0);
  const availableRoomNightPriceTotal = periodDates.reduce((sum, date) => {
    const nextDate = formatDateInput(addDays(parseDateInput(date), 1));
    return sum + stayRooms.reduce((roomSum, room) => {
      const isBooked = reservations.some((reservation) =>
        reservation.status === "booked" &&
        reservation.roomIds.includes(room.id) &&
        dateRangesOverlap(date, nextDate, reservation.checkIn, reservation.checkOut)
      );
      return isBooked ? roomSum : roomSum + getRoomPriceForDate(room, date);
    }, 0);
  }, 0);
  const availableRoomNightPrices = periodDates.flatMap((date) => {
    const nextDate = formatDateInput(addDays(parseDateInput(date), 1));
    return stayRooms
      .filter((room) =>
        !reservations.some((reservation) =>
          reservation.status === "booked" &&
          reservation.roomIds.includes(room.id) &&
          dateRangesOverlap(date, nextDate, reservation.checkIn, reservation.checkOut)
        )
      )
      .map((room) => getRoomPriceForDate(room, date))
      .filter((price) => price > 0);
  });
  const settingsMinPrice = availableRoomNightPrices.length ? Math.min(...availableRoomNightPrices) : 0;
  const currentAveragePrice = availableRoomNights
    ? Math.round(availableRoomNightPriceTotal / availableRoomNights)
    : Math.round(stayRooms.reduce((sum, room) => sum + getRoomPriceForDate(room, period.from), 0) / Math.max(1, stayRooms.length));
  const gap = Math.max(0, analytics.expenses - analytics.revenue);
  const expectedGap = Math.max(0, analytics.expenses - analytics.revenue - analytics.outstandingBalance);
  const scenarios = gap > 0 && availableRoomNights > 0
    ? [100, 70, 50, 30].map((loadPercent) => {
        const sellableRoomNights = Math.max(1, Math.ceil(availableRoomNights * loadPercent / 100));
        const price = Math.ceil(gap / sellableRoomNights / 100) * 100;
        return {
          loadPercent,
          price,
          sellableRoomNights,
          settingsRevenue: Math.round(currentAveragePrice * sellableRoomNights),
          targetRevenue: price * sellableRoomNights
        };
      })
    : [];
  const requiredAveragePrice = scenarios.find((scenario) => scenario.loadPercent === 50)?.price ?? 0;
  const fullLoadPrice = scenarios.find((scenario) => scenario.loadPercent === 100)?.price ?? 0;
  const discountReservePercent = currentAveragePrice > 0 && requiredAveragePrice > 0
    ? Math.max(0, Math.floor((1 - requiredAveragePrice / currentAveragePrice) * 100))
    : 0;
  const periodLabel = period.from === period.to
    ? formatKazakhDate(period.from)
    : `${formatKazakhDate(period.from)} - ${formatKazakhDate(period.to)}`;

  let tone: "ok" | "warning" | "danger" = "ok";
  let message = "Расходы за выбранный период уже закрыты. Снижать цену не обязательно, можно держать текущую сетку.";

  if (!analytics.expenses) {
    message = "За выбранный период расходов нет. Добавьте расходы, и система рассчитает минимальную цену для покрытия.";
  } else if (gap > 0 && !availableRoomNights) {
    tone = "danger";
    message = "Расходы не закрыты, но свободных номеро-ночей в выбранном периоде нет. Нужно смотреть допродажи или другой период.";
  } else if (gap > 0 && requiredAveragePrice > currentAveragePrice) {
    tone = "danger";
    message = `Снижать цены нельзя: при 50% загрузке нужна средняя цена от ${formatAnalyticsMoney(requiredAveragePrice)} за номеро-ночь.`;
  } else if (gap > 0 && settingsMinPrice > 0 && requiredAveragePrice <= settingsMinPrice) {
    tone = "ok";
    message = `Даже минимальная цена из настроек выше порога покрытия. Можно работать по текущей сетке и давать скидки точечно.`;
  } else if (gap > 0) {
    tone = "warning";
    message = `Цена ${formatAnalyticsMoney(fullLoadPrice)} работает только при продаже всего остатка. Реалистичнее держать ориентир 50% загрузки: ${formatAnalyticsMoney(requiredAveragePrice)}.`;
  } else if (expectedGap > 0) {
    tone = "warning";
    message = "По фактически полученным деньгам расходы закрыты, но часть суммы еще в остатках. Контролируйте доплаты.";
  }

  const roomDemand = buildAnalyticsRoomDemand(reservations, stayRooms);

  return {
    availableRoomNights,
    currentAveragePrice,
    expectedRevenue: analytics.revenue + analytics.outstandingBalance,
    expenses: analytics.expenses,
    gap,
    message,
    periodLabel,
    requiredAveragePrice,
    revenue: analytics.revenue,
    discountReservePercent,
    highDemandRooms: roomDemand.high,
    lowDemandRooms: roomDemand.low,
    outstandingBalance: analytics.outstandingBalance,
    scenarios,
    settingsMinPrice,
    tone
  };
}

function buildAnalyticsRoomDemand(reservations: Reservation[], rooms: Room[]) {
  const roomStats = rooms
    .map((room) => {
      const sold = reservations.filter((reservation) =>
        reservation.status === "booked" &&
        reservation.roomIds.includes(room.id)
      );
      return {
        label: formatAnalyticsObjectLabel(room),
        revenue: sold.reduce((sum, reservation) => sum + reservation.total / Math.max(1, reservation.roomIds.length), 0),
        sold: sold.length
      };
    })
    .filter((item) => item.label);
  const soldRooms = roomStats.filter((item) => item.sold > 0);
  const high = [...soldRooms]
    .sort((left, right) => right.sold - left.sold || right.revenue - left.revenue)
    .slice(0, 3)
    .map((item) => `${item.label} (${item.sold})`);
  const low = [...roomStats]
    .sort((left, right) => left.sold - right.sold || left.revenue - right.revenue)
    .slice(0, 3)
    .map((item) => `${item.label} (${item.sold})`);

  return { high, low };
}

function buildAnalyticsRecommendationPeriod(
  dateFrom: string,
  dateTo: string,
  reservations: Reservation[],
  expenseEntries: ExpenseEntry[]
) {
  if (dateFrom || dateTo) {
    const from = dateFrom || dateTo;
    const to = dateTo || dateFrom;
    return parseDateInput(to) < parseDateInput(from)
      ? { from: to, to: from }
      : { from, to };
  }

  const dates = [
    ...reservations.flatMap((reservation) => [reservation.checkIn, reservation.checkOut]),
    ...expenseEntries.map((entry) => entry.paymentDate)
  ].filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));

  if (!dates.length) {
    const today = formatDateInput(new Date());
    return { from: today, to: today };
  }

  return {
    from: dates.reduce((min, date) => date < min ? date : min, dates[0]),
    to: dates.reduce((max, date) => date > max ? date : max, dates[0])
  };
}

function getDateRangeDays(from: string, to: string) {
  const days: string[] = [];
  const start = parseDateInput(from);
  const end = parseDateInput(to);
  const inclusiveEnd = end < start ? start : end;
  for (let day = new Date(start); day <= inclusiveEnd; day = addDays(day, 1)) {
    days.push(formatDateInput(day));
  }
  return days.length ? days : [from];
}

function buildAnalyticsCsvExport(analytics: ReturnType<typeof buildAnalyticsSnapshot>) {
  const rows = [
    ["Раздел", "Показатель", "Значение"],
    ["Сводка", "Обращения", String(analytics.inquiries)],
    ["Сводка", "Согласования", String(analytics.pending)],
    ["Сводка", "Продано", String(analytics.booked)],
    ["Сводка", "Отменено", String(analytics.cancelled)],
    ["Сводка", "Клиенты", String(analytics.clients)],
    ["Финансы", "Выручка", formatAnalyticsMoney(analytics.revenue)],
    ["Финансы", "Предоплаты", formatAnalyticsMoney(analytics.prepayments)],
    ["Финансы", "Доплаты", formatAnalyticsMoney(analytics.balancePayments)],
    ["Финансы", "Остатки", formatAnalyticsMoney(analytics.outstandingBalance)],
    ["Расходы", "Расходы", formatAnalyticsMoney(analytics.expenses)],
    ["Расходы", "После расходов", formatAnalyticsMoney(analytics.profitAfterExpenses)],
    ["Сводка", "Незаезды", String(analytics.noShows)],
    ["Финансы", "Средний чек", formatAnalyticsMoney(analytics.averageSale)],
    [],
    ["Продажи по объектам", "Объект", "Количество", "Выручка"],
    ...analytics.roomSales.map((item) => ["Продажи по объектам", `${item.number} ${item.title}`.trim(), String(item.count), formatAnalyticsMoney(item.revenue)])
  ];

  return "\ufeff" + rows.map((row) => row.map(escapeCsvValue).join(";")).join("\n");
}

function buildCatalogCsvExport(rooms: Room[]) {
  const headers = [
    "id",
    "number",
    "title",
    "displayTitle",
    "sortOrder",
    "group",
    "category",
    "objectType",
    "objectTypeLabel",
    "bookable",
    "includedInStay",
    "status",
    "excludeFromBookingSummary",
    "hideInBookingPanel",
    "basePrice",
    "weekdayPrice",
    "weekendPrice",
    "holidayPrice",
    "floor",
    "occupancyLabel",
    "bathroomType",
    "bathroomDescription",
    "capacityAdults",
    "capacityChildren",
    "extraBeds",
    "extraBedEnabled",
    "extraBedPrice",
    "extraBedDescription",
    "beds",
    "sleepingPlaces",
    "sleepingPlacesText",
    "description",
    "amenities",
    "food",
    "visibleAmenities",
    "adminNotes",
    "photoPaths",
    "mainPhotoPath",
    "videoPaths"
  ];

  const rows = rooms.map((room) => [
    room.id,
    room.number,
    room.title,
    getCatalogCardTitle(room),
    String(room.sortOrder),
    room.group,
    room.category,
    room.objectType,
    getObjectTypeLabel(room),
    formatCsvBoolean(room.bookable),
    formatCsvBoolean(room.includedInStay),
    room.status,
    formatCsvBoolean(room.excludeFromBookingSummary),
    formatCsvBoolean(room.hideInBookingPanel),
    String(room.basePrice || 0),
    String(room.weekdayPrice || 0),
    String(room.weekendPrice || 0),
    String(room.holidayPrice || 0),
    room.floor,
    room.occupancyLabel,
    room.bathroomType,
    getObjectBathroomDescription(room),
    String(room.capacityAdults || 0),
    String(room.capacityChildren || 0),
    String(room.extraBeds || 0),
    formatCsvBoolean(room.extraBedEnabled),
    String(room.extraBedPrice || 0),
    room.extraBedDescription,
    room.beds,
    JSON.stringify(room.sleepingPlaces),
    formatSleepingPlaces(room.sleepingPlaces),
    room.description,
    getSelectedAmenities(room.amenities).join(", "),
    getSelectedFood(room.amenities).join(", "),
    getVisibleAmenities(room).join(", "),
    room.adminNotes,
    room.photoPaths.join(" | "),
    getMainPhotoPath(room),
    room.videoPaths.join(" | ")
  ]);

  return "\ufeff" + [headers, ...rows].map((row) => row.map(escapeCsvValue).join(";")).join("\n");
}

function formatCsvBoolean(value: boolean) {
  return value ? "да" : "нет";
}

function buildAdminBookingsExport(reservations: Reservation[], rooms: Room[], selectedDate = "", allReservations: Reservation[] = reservations) {
  if (!reservations.length) {
    return "Броней нет.";
  }

  const lines: string[] = [];

  reservations.forEach((reservation, index) => {
    const reservationRooms = reservation.roomIds
      .map((roomId) => rooms.find((room) => room.id === roomId))
      .filter((room): room is Room => Boolean(room));
    const stayRooms = reservationRooms.filter((room) => !isHourlyBookingObject(room));
    const hourlyRooms = reservationRooms.filter(isHourlyBookingObject);
    const objects = stayRooms.map(formatAdminBookingObject).join(", ") || "не указан";
    const saunaText = hourlyRooms.map((room) => `${room.title || "Сауна"}: ${formatAdminShortDate(reservation.checkIn)} ${reservation.checkInTime}-${getReservationHourlyEndTime(reservation)}`).join(", ");
    const roomExtraInventoryText = formatAdminRoomExtraInventory(reservation, stayRooms);
    const stayStateText = formatAdminStayState(reservation, selectedDate);
    const included = getAdminIncludedText(stayRooms, reservation);
    const comment = reservation.adminComment?.trim() || reservation.comment?.trim() || "нет";

    const reservationLines = [
      `${index + 1}. ${reservation.guestFirstName || "Гость"}`,
      stayStateText ? `Статус: ${stayStateText}` : "",
      `Заезд: ${formatAdminShortDate(reservation.checkIn)}`,
      `Выезд: ${formatAdminShortDate(reservation.checkOut)}`,
      stayRooms.length ? `Номер: ${objects}` : "",
      saunaText ? `Сауна: ${saunaText}` : "",
      roomExtraInventoryText ? `Допместа: ${roomExtraInventoryText}` : "",
      `Гости: ${formatAdminGuestCountText(reservation)}`,
      `Включено: ${included}`,
      `Комментарий: ${comment}`,
    ].filter(Boolean);

    lines.push(...reservationLines, "");
  });

  const tomorrowArrivalsText = buildAdminTomorrowArrivalsBlock(selectedDate, allReservations, rooms);
  if (tomorrowArrivalsText) {
    lines.push(tomorrowArrivalsText);
  }

  return lines.join("\n").trim();
}

function createChatDraftFromReservation(reservation: Reservation): ChatBookingDraft {
  const extraInventoryCounts = getReservationExtraInventoryCounts(reservation);
  return {
    selectedRoomId: reservation.roomIds[0] || "",
    selectedBookingRoomIds: reservation.roomIds,
    checkIn: reservation.checkIn,
    checkOut: reservation.checkOut,
    checkInTime: reservation.checkInTime || DEFAULT_CHECK_IN_TIME,
    checkOutTime: reservation.checkOutTime || DEFAULT_CHECK_OUT_TIME,
    comment: reservation.comment || "",
    adminComment: reservation.adminComment || "",
    guestFirstName: reservation.guestFirstName || "",
    phone: reservation.phone || "",
    adults: reservation.adults ?? 0,
    children: reservation.children ?? 0,
    hasPet: Boolean(reservation.hasPet),
    extraBed: reservation.extraBed,
    extraBedType: reservation.extraBedType ?? "air-bed",
    airMattressCount: extraInventoryCounts.airBeds,
    rollawayCount: extraInventoryCounts.rollaways,
    extraInventoryByRoomId: reservation.extraInventoryByRoomId ?? buildExtraInventoryMapFromReservation(reservation),
    extraInventoryManual: Boolean(extraInventoryCounts.airBeds || extraInventoryCounts.rollaways),
    hourlyHours: reservation.hourlyHours || 2,
    discountPercent: reservation.discountPercent,
    breakfastIncluded: reservation.breakfastIncluded ?? true,
    manualTotalAmount: reservation.total,
    manualSaleOpen: Boolean(reservation.isManualSale) || reservation.prepayment >= reservation.total,
    manualSaleAmount: reservation.total,
    manualSaleComment: reservation.comment || "",
    manualSalePaymentMethod: reservation.paymentMethod ?? "",
    manualSalePeriod: /полсут/i.test(reservation.comment) ? "half-day" : "day",
    prepaymentAlreadyPaid: Boolean(reservation.prepaymentReceivedAt),
    catalogStatus: undefined,
    catalogStatusAt: undefined,
    agreementSent: reservation.status !== "pending",
    agreementEverSent: true,
    lastReservation: reservation,
    updatedAt: new Date().toISOString()
  };
}

function getDraftExtraInventoryCounts(draft: Pick<ChatBookingDraft, "airMattressCount" | "extraBedType" | "rollawayCount">) {
  const legacyCount = Math.max(0, draft.airMattressCount || 0);
  const rollaways = Math.max(0, draft.rollawayCount ?? (draft.extraBedType === "rollaway" ? legacyCount : 0));
  const airBeds = draft.extraBedType === "rollaway" && draft.rollawayCount === undefined ? 0 : legacyCount;
  return { airBeds, rollaways };
}

function getReservationExtraInventoryCounts(reservation: Pick<Reservation, "airMattressCount" | "extraBedType" | "rollawayCount">) {
  const legacyCount = Math.max(0, reservation.airMattressCount || 0);
  const rollaways = Math.max(0, reservation.rollawayCount ?? (reservation.extraBedType === "rollaway" ? legacyCount : 0));
  const airBeds = reservation.extraBedType === "rollaway" && reservation.rollawayCount === undefined ? 0 : legacyCount;
  return { airBeds, rollaways };
}

function calculateReservationSleepingPlacesTotal(reservation: Reservation, rooms: Room[]) {
  const basePlaces = rooms
    .filter(isStayBookingObject)
    .reduce((sum, room) => sum + calculateRoomSleepingPlacesTotal(room), 0);
  const extraPlaces = getReservationExtraInventoryCounts(reservation);
  return basePlaces + extraPlaces.airBeds + extraPlaces.rollaways;
}

function calculateRoomSleepingPlacesTotal(room: Room) {
  return getVisibleSleepingPlaces(room.sleepingPlaces)
    .reduce((sum, place) => sum + getSleepingPlacePlacesCount(place), 0);
}

function calculateRoomReservationSleepingPlacesTotal(room: Room, extraInventory?: { airBeds?: number; rollaways?: number }) {
  return calculateRoomSleepingPlacesTotal(room) + Math.max(0, extraInventory?.airBeds || 0) + Math.max(0, extraInventory?.rollaways || 0);
}

function calculatePricePdfSleepingPlacesTotal(rooms: Room[], availabilitySummary?: CatalogAvailabilitySummary) {
  return rooms
    .filter(isStayBookingObject)
    .reduce((sum, room) => sum + getRoomBaseSleepingCapacity(room), 0);
}

function calculateAvailablePricePdfSleepingPlacesTotal(rooms: Room[], availableExtraInventory: { airBeds: number; rollaways: number }) {
  return rooms.reduce((sum, room) => sum + getRoomBaseSleepingCapacity(room), 0);
}

function buildExtraInventoryMapFromDraft(draft: Pick<ChatBookingDraft, "airMattressCount" | "extraBedType" | "rollawayCount" | "selectedRoomId">) {
  const counts = getDraftExtraInventoryCounts(draft);
  if (!draft.selectedRoomId || (!counts.airBeds && !counts.rollaways)) return {};
  return {
    [draft.selectedRoomId]: counts
  };
}

function buildExtraInventoryMapFromReservation(reservation: Pick<Reservation, "airMattressCount" | "extraBedType" | "rollawayCount" | "roomIds">) {
  const counts = getReservationExtraInventoryCounts(reservation);
  const roomId = reservation.roomIds[0] || "";
  if (!roomId || (!counts.airBeds && !counts.rollaways)) return {};
  return {
    [roomId]: counts
  };
}

function formatAdminBookingObject(room: Room) {
  if (shouldShowObjectNumber(room)) {
    return [room.number, room.title].filter(Boolean).join(" ");
  }

  return room.title || getObjectTypeLabel(room);
}

function formatReservationGuestCountText(reservation: Reservation) {
  const adults = Math.max(0, reservation.adults || 0);
  const children = Math.max(0, reservation.children || 0);
  const total = adults + children;
  if (!total) return "Гости: не указано";
  return `Гости: ${adults} взр. / ${children} дет. / всего ${total}`;
}

function formatReservationSummaryGuestLine(reservation: Reservation) {
  const adults = Math.max(0, reservation.adults || 0);
  const children = Math.max(0, reservation.children || 0);
  const total = adults + children;
  if (!total) return "";

  return `| Гости: ${adults} взр. / ${children} дет. / всего ${total}`;
}

function getReservationWeightedGuestCount(reservation: Reservation) {
  const adults = Math.max(0, reservation.adults || 0);
  const children = Math.max(0, reservation.children || 0);
  return adults + children * 0.5;
}

function formatReservationAveragePerPersonLine(reservation: Reservation, nights: number) {
  const weightedGuests = getReservationWeightedGuestCount(reservation);
  const stayNights = Math.max(0, nights);
  if (!weightedGuests || !stayNights || !reservation.total) return "";

  const average = Math.round(reservation.total / weightedGuests / stayNights);
  return `*| Средняя на человека: ${formatPrice(average)}*`;
}

function formatReservationConfirmationRooms(reservation: Reservation, rooms: Room[]) {
  const bookedRooms = reservation.roomIds
    .map((roomId) => rooms.find((room) => room.id === roomId))
    .filter((room): room is Room => Boolean(room));

  if (!bookedRooms.length) return "не указаны";

  return bookedRooms.map((room) => {
    const number = room.number ? `${getObjectTypeLabel(room)} ${room.number}` : getObjectTypeLabel(room);
    return [number, room.title].filter(Boolean).join(" | ");
  }).join(", ");
}

function formatAdminGuestCountText(reservation: Reservation) {
  const adults = Math.max(0, reservation.adults || 0);
  const children = Math.max(0, reservation.children || 0);
  const total = adults + children;
  if (!total) return "не указано";
  return `${adults} взр. / ${children} дет. / всего ${total}`;
}

function formatAdminRoomExtraInventory(reservation: Reservation, stayRooms: Room[]) {
  if (!stayRooms.length) return "";
  const inventoryByRoomId = reservation.extraInventoryByRoomId ?? buildExtraInventoryMapFromReservation(reservation);

  return stayRooms
    .map((room) => {
      const item = inventoryByRoomId[room.id];
      const details = [
        item?.airBeds ? `матрас ${item.airBeds}` : "",
        item?.rollaways ? `раскладушка ${item.rollaways}` : ""
      ].filter(Boolean).join(", ");

      return details ? `${formatAdminBookingObject(room)}: ${details}` : "";
    })
    .filter(Boolean)
    .join("; ");
}

function buildAdminTomorrowArrivalsBlock(selectedDate: string, reservations: Reservation[], rooms: Room[]) {
  const baseDate = selectedDate || formatDateInput(new Date());
  const tomorrow = formatDateInput(addDays(parseDateInput(baseDate), 1));
  const tomorrowArrivals = reservations
    .filter((reservation) => reservation.status === "booked" && reservation.checkIn === tomorrow)
    .sort((left, right) => `${left.checkInTime || DEFAULT_CHECK_IN_TIME} ${left.guestFirstName}`.localeCompare(`${right.checkInTime || DEFAULT_CHECK_IN_TIME} ${right.guestFirstName}`, "ru"));
  const breakfastReservations = reservations
    .filter((reservation) => reservation.status === "booked")
    .filter((reservation) => reservation.breakfastIncluded !== false)
    .filter((reservation) => isBreakfastServedOnDate(reservation, tomorrow))
    .sort((left, right) => `${left.checkOut} ${left.guestFirstName}`.localeCompare(`${right.checkOut} ${right.guestFirstName}`, "ru"));

  if (!tomorrowArrivals.length && !breakfastReservations.length) return "";

  const tomorrowDepartures = reservations.filter((reservation) => reservation.status === "booked" && reservation.checkOut === tomorrow);
  const priorityCleaningRooms = getAdminPriorityCleaningRooms(tomorrowArrivals, tomorrowDepartures, rooms);
  const totalGuests = tomorrowArrivals.reduce((sum, reservation) => sum + getReservationGuestTotal(reservation), 0);
  const breakfastCount = breakfastReservations.reduce((sum, reservation) => sum + getReservationGuestTotal(reservation), 0);
  const roomIds = new Set(tomorrowArrivals.flatMap((reservation) => reservation.roomIds.filter((roomId) => {
    const room = rooms.find((item) => item.id === roomId);
    return room ? isStayBookingObject(room) : false;
  })));
  const lines = [
    "Заезды на завтра",
    `Дата: ${formatAdminShortDate(tomorrow)}`,
    priorityCleaningRooms ? `Уборка в первую очередь: ${priorityCleaningRooms}` : ""
  ].filter(Boolean);
  const breakfastLines = [
    "Завтраки на завтра",
    `Дата: ${formatAdminShortDate(tomorrow)}`,
    `Всего завтраков: ${breakfastCount}`
  ];

  tomorrowArrivals.forEach((reservation) => {
    const reservationRooms = reservation.roomIds
      .map((roomId) => rooms.find((room) => room.id === roomId))
      .filter((room): room is Room => Boolean(room));
    const stayRooms = reservationRooms.filter((room) => !isHourlyBookingObject(room));
    const objects = stayRooms.map(formatAdminBookingObject).join(", ") || "не указан";
    const included = getAdminIncludedText(stayRooms, reservation);
    const comment = reservation.adminComment?.trim() || reservation.comment?.trim() || "нет";
    lines.push(
      `${reservation.guestFirstName || "Гость"} - ${objects}`,
      `Количество чел: ${formatAdminGuestCountText(reservation)}`,
      `Включено: ${included}`,
      `Комментарий: ${comment}`
    );
  });

  breakfastReservations.forEach((reservation) => {
    const reservationRooms = reservation.roomIds
      .map((roomId) => rooms.find((room) => room.id === roomId))
      .filter((room): room is Room => Boolean(room));
    const stayRooms = reservationRooms.filter((room) => !isHourlyBookingObject(room));
    const objects = stayRooms.map(formatAdminBookingObject).join(", ") || "не указан";
    breakfastLines.push(`${reservation.guestFirstName || "Гость"} - ${objects}: ${getReservationGuestTotal(reservation)}`);
  });

  lines.push(`ИТОГО: чел ${totalGuests}, номеров ${roomIds.size}, завтраков ${breakfastCount}`);
  lines.push("", breakfastLines.join("\n"));

  return lines.join("\n");
}

function buildCookBreakfastExport(selectedDate: string, reservations: Reservation[]) {
  const date = selectedDate || formatDateInput(new Date());
  const breakfastReservations = reservations
    .filter((reservation) => reservation.status === "booked")
    .filter((reservation) => reservation.breakfastIncluded !== false)
    .filter((reservation) => isBreakfastServedOnDate(reservation, date))
    .sort((left, right) => `${left.checkInTime || DEFAULT_CHECK_IN_TIME} ${left.guestFirstName}`.localeCompare(`${right.checkInTime || DEFAULT_CHECK_IN_TIME} ${right.guestFirstName}`, "ru"));

  if (!breakfastReservations.length) {
    return `Завтраки\nДата: ${formatAdminShortDate(date)}\nЗавтраков нет.`;
  }

  const totalAdults = breakfastReservations.reduce((sum, reservation) => sum + Math.max(0, reservation.adults || 0), 0);
  const totalChildren = breakfastReservations.reduce((sum, reservation) => sum + Math.max(0, reservation.children || 0), 0);
  const totalGuests = totalAdults + totalChildren;
  const lines = [
    "Завтраки",
    `Дата: ${formatAdminShortDate(date)}`,
    `ИТОГО: взрослых ${totalAdults}, детей ${totalChildren}, всего завтраков ${totalGuests}`,
    ""
  ];

  breakfastReservations.forEach((reservation, index) => {
    const comment = reservation.adminComment?.trim() || reservation.comment?.trim() || "нет";
    lines.push(
      `${index + 1}. ${reservation.guestFirstName || "Гость"}`,
      `Взрослые: ${Math.max(0, reservation.adults || 0)}`,
      `Дети: ${Math.max(0, reservation.children || 0)}`,
      `Всего: ${getReservationGuestTotal(reservation)}`,
      `Комментарий: ${comment}`,
      ""
    );
  });

  return lines.join("\n").trim();
}

function getAdminPriorityCleaningRooms(arrivals: Reservation[], departures: Reservation[], rooms: Room[]) {
  const departureRoomIds = new Set(departures.flatMap((reservation) => reservation.roomIds));
  const arrivalRooms = arrivals
    .flatMap((reservation) => reservation.roomIds.map((roomId) => ({ reservation, room: rooms.find((item) => item.id === roomId) })))
    .filter((item): item is { reservation: Reservation; room: Room } => Boolean(item.room) && isStayBookingObject(item.room) && departureRoomIds.has(item.room.id))
    .sort((left, right) => (left.reservation.checkInTime || DEFAULT_CHECK_IN_TIME).localeCompare(right.reservation.checkInTime || DEFAULT_CHECK_IN_TIME));

  return Array.from(new Map(arrivalRooms.map(({ room }) => [room.id, formatAdminBookingObject(room)])).values()).join(", ");
}

function getReservationGuestTotal(reservation: Reservation) {
  return Math.max(0, reservation.adults || 0) + Math.max(0, reservation.children || 0);
}

function formatAdminStayState(reservation: Reservation, selectedDate: string) {
  const selected = selectedDate || formatDateInput(new Date());
  const isArriving = reservation.checkIn === selected;
  const isLeaving = reservation.checkOut === selected;
  const isLiving = reservation.checkIn < selected && reservation.checkOut > selected;
  const statusParts: string[] = [];

  if (reservation.checkedInAt) {
    statusParts.push(`проживает, заехал ${formatAdminDateTime(reservation.checkedInAt)}`);
  } else if (isLiving) {
    statusParts.push(`проживает с ${formatAdminShortDate(reservation.checkIn)}`);
  } else if (isArriving) {
    statusParts.push("заезжает сегодня");
  }

  if (isLeaving) {
    statusParts.push(`выезд сегодня до ${reservation.checkOutTime || DEFAULT_CHECK_OUT_TIME}`);
  } else if (reservation.checkOut) {
    statusParts.push(`освободит ${formatAdminShortDate(reservation.checkOut)} до ${reservation.checkOutTime || DEFAULT_CHECK_OUT_TIME}`);
  }

  return statusParts.join("; ");
}

function formatAdminDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatReservationPhone(phone: string) {
  const digits = normalizePhoneSearch(phone);
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }
  return phone || "телефон не указан";
}

function formatReservationRowRooms(rooms: Room[]) {
  if (!rooms.length) return "номер не указан";
  const numbers = rooms.map((room) => formatBookingPickerObjectLabel(room));
  if (numbers.length <= 2) return numbers.join(", ");
  return `${numbers.slice(0, 2).join(", ")} +${numbers.length - 2}`;
}

function getAdminIncludedText(rooms: Room[], reservation?: Pick<Reservation, "airMattressCount" | "extraBedType" | "rollawayCount" | "breakfastIncluded">) {
  const included = Array.from(new Set(rooms.flatMap((room) => getSelectedFood(room.amenities))));
  if (reservation?.breakfastIncluded === false) {
    const breakfastIndex = included.findIndex((item) => item.toLowerCase() === "завтрак");
    if (breakfastIndex >= 0) included.splice(breakfastIndex, 1);
    included.unshift("Без завтрака");
  }
  const extraInventoryText = reservation ? formatReservationExtraInventory(reservation) : "";
  if (extraInventoryText) included.push(extraInventoryText);
  return included.length ? included.join(", ") : "нет";
}

function formatReservationExtraInventory(reservation: Pick<Reservation, "airMattressCount" | "extraBedType" | "rollawayCount">) {
  const counts = getReservationExtraInventoryCounts(reservation);
  return [
    counts.airBeds ? `Матрас: ${counts.airBeds}` : "",
    counts.rollaways ? `Раскладушка: ${counts.rollaways}` : ""
  ].filter(Boolean).join(", ");
}

function formatAdminShortDate(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long"
  }).format(parseDateInput(date));
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function buildInvoiceText({
  amount,
  buyerAddress,
  buyerBin,
  buyerName,
  buyerPhone,
  checkIn,
  checkOut,
  companyRequisites,
  invoiceComment,
  rooms
}: {
  amount: number;
  buyerAddress: string;
  buyerBin: string;
  buyerName: string;
  buyerPhone: string;
  checkIn: string;
  checkOut: string;
  companyRequisites: Record<string, string>;
  invoiceComment: string;
  rooms: Room[];
}) {
  const companyLines = buildSettingMethodList(COMPANY_REQUISITE_FIELDS, companyRequisites)
    .map((field) => [field.label, companyRequisites[field.id]?.trim() || ""])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);
  const buyerLines = [
    buyerName.trim() ? `Покупатель: ${buyerName.trim()}` : "",
    buyerBin.trim() ? `БИН / ИИН: ${buyerBin.trim()}` : "",
    buyerPhone.trim() ? `Телефон: ${buyerPhone.trim()}` : "",
    buyerAddress.trim() ? `Адрес: ${buyerAddress.trim()}` : ""
  ].filter(Boolean);
  const objectLines = rooms.length
    ? rooms.map((room) => `- ${formatBookingPickerObjectLabel(room) || formatAnalyticsObjectLabel(room)}`).join("\n")
    : "- Услуги проживания";
  const periodLine = checkIn && checkOut
    ? `Период: ${formatKazakhDate(checkIn)} - ${formatKazakhDate(checkOut)}`
    : "";
  const commentLine = invoiceComment.trim() ? `Комментарий: ${invoiceComment.trim()}` : "";

  return [
    "Счет на оплату",
    "",
    companyLines.length ? "Поставщик:" : "",
    ...companyLines,
    companyLines.length ? "" : "",
    buyerLines.length ? "Покупатель:" : "",
    ...buyerLines,
    buyerLines.length ? "" : "",
    periodLine,
    "Основание:",
    objectLines,
    "",
    `Сумма к оплате: ${formatPrice(amount)}`,
    commentLine
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n").trim();
}

function downloadTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  downloadBlobFile(blob, fileName);
}

async function copyTextToClipboard(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fallback below covers extension contexts where clipboard API is blocked.
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function downloadBlobFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getDownloadMediaFileName(path: string, mimeType: string, fallbackBase: string) {
  const rawName = decodeURIComponent(path.split("/").pop()?.split("?")[0] || "");
  const extensionMatch = rawName.match(/\.([a-z0-9]+)$/i);
  if (extensionMatch) {
    return `${fallbackBase}.${extensionMatch[1].toLowerCase()}`;
  }

  const extension = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
      ? "webp"
      : mimeType.includes("quicktime")
        ? "mov"
        : mimeType.includes("video")
          ? "mp4"
          : "jpg";
  return `${fallbackBase}.${extension}`;
}

function filterAnalyticsReservations(
  reservations: Reservation[],
  rooms: Room[],
  filters: {
    dateFrom: string;
    dateTo: string;
    search: string;
    statusFilter: "all" | "pending" | "booked" | "cancelled" | "checked-in" | "no-show" | "balance-due";
  }
) {
  const normalizedSearch = filters.search.trim().toLowerCase();
  const normalizedPhoneSearch = normalizePhoneSearch(filters.search);

  return reservations
    .filter((reservation) => {
      if (!filters.dateFrom && !filters.dateTo) return true;
      const from = filters.dateFrom || filters.dateTo;
      const to = filters.dateTo && filters.dateFrom
        ? filters.dateTo
        : formatDateInput(addDays(parseDateInput(from), 1));

      if (parseDateInput(to) <= parseDateInput(from)) {
        return dateRangesOverlap(from, formatDateInput(addDays(parseDateInput(from), 1)), reservation.checkIn, reservation.checkOut);
      }

      return dateRangesOverlap(from, to, reservation.checkIn, reservation.checkOut);
    })
    .filter((reservation) => {
      if (filters.statusFilter === "all") return true;
      if (filters.statusFilter === "checked-in") return Boolean(reservation.checkedInAt);
      if (filters.statusFilter === "no-show") return Boolean(reservation.noShowAt);
      if (filters.statusFilter === "balance-due") return getReservationFinance(reservation).outstandingBalance > 0;
      return reservation.status === filters.statusFilter;
    })
    .filter((reservation) => {
      if (!normalizedSearch) return true;
      const reservationPhone = normalizePhoneSearch(reservation.phone);
      const roomText = reservation.roomIds
        .map((roomId) => rooms.find((room) => room.id === roomId))
        .filter((room): room is Room => Boolean(room))
        .map((room) => `${room.number} ${room.title} ${getObjectTypeLabel(room)}`)
        .join(" ");
      const textMatch = `${reservation.guestFirstName} ${reservation.phone} ${roomText} ${getReservationStatusLabel(reservation)}`
        .toLowerCase()
        .includes(normalizedSearch);
      const phoneMatch = Boolean(
        normalizedPhoneSearch &&
        reservationPhone &&
        (reservationPhone.includes(normalizedPhoneSearch) || reservationPhone.endsWith(normalizedPhoneSearch))
      );

      return textMatch || phoneMatch;
    });
}

function filterAnalyticsGuestContacts(
  contacts: GuestContact[],
  filters: {
    dateFrom: string;
    dateTo: string;
    search: string;
  }
) {
  const normalizedSearch = filters.search.trim().toLowerCase();
  const normalizedPhoneSearch = normalizePhoneSearch(filters.search);

  return contacts
    .filter((contact) => {
      if (!filters.dateFrom && !filters.dateTo) return true;
      if (!contact.inquiryDate) return false;

      const contactDate = formatDateInput(parseDateInput(contact.inquiryDate.slice(0, 10)));
      if (filters.dateFrom && contactDate < filters.dateFrom) return false;
      if (filters.dateTo && contactDate > filters.dateTo) return false;
      return true;
    })
    .filter((contact) => {
      if (!normalizedSearch) return true;

      const contactPhone = normalizePhoneSearch(contact.phone);
      const textMatch = `${contact.appeal} ${contact.phone}`.toLowerCase().includes(normalizedSearch);
      const phoneMatch = Boolean(
        normalizedPhoneSearch &&
        contactPhone &&
        (contactPhone.includes(normalizedPhoneSearch) || contactPhone.endsWith(normalizedPhoneSearch))
      );

      return textMatch || phoneMatch;
    });
}

function filterAnalyticsExpenseEntries(entries: ExpenseEntry[], filters: { dateFrom: string; dateTo: string }) {
  return entries.filter((entry) => {
    if (!filters.dateFrom && !filters.dateTo) return true;
    if (!entry.paymentDate) return false;
    if (filters.dateFrom && entry.paymentDate < filters.dateFrom) return false;
    if (filters.dateTo && entry.paymentDate > filters.dateTo) return false;
    return true;
  });
}

function normalizePhoneSearch(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("8")) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function phonesMatchForContactLookup(left: string, right: string) {
  const leftDigits = normalizePhoneSearch(left);
  const rightDigits = normalizePhoneSearch(right);
  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits) return true;
  const leftTail = leftDigits.slice(-10);
  const rightTail = rightDigits.slice(-10);
  if (leftTail.length >= 10 && rightTail.length >= 10 && leftTail === rightTail) return true;
  const leftLast4 = leftDigits.slice(-4);
  const rightLast4 = rightDigits.slice(-4);
  return Boolean(leftLast4.length === 4 && leftLast4 === rightLast4);
}

function getAnalyticsPersonKey(phone: string, fallbackName: string) {
  const phoneKey = normalizePhoneSearch(phone);
  if (phoneKey) return phoneKey;
  return fallbackName.trim().toLowerCase();
}

function normalizeContactLookupText(value: string) {
  return normalizeExtractedText(value).toLowerCase();
}

function buildCatalogPriceSummary(rooms: Room[]) {
  return rooms
    .filter((room) => room.bookable)
    .reduce(
      (summary, room) => ({
        count: summary.count + 1,
        holidayTotal: summary.holidayTotal + (room.holidayPrice || room.weekendPrice || room.weekdayPrice || room.basePrice || 0),
        weekdayTotal: summary.weekdayTotal + (room.weekdayPrice || room.basePrice || 0),
        weekendTotal: summary.weekendTotal + (room.weekendPrice || room.weekdayPrice || room.basePrice || 0)
      }),
      { count: 0, holidayTotal: 0, weekdayTotal: 0, weekendTotal: 0 }
    );
}

function formatAnalyticsObjectLabel(room: Room) {
  if (room.objectType === "sauna") return "Сауна";
  return room.number || room.title || getObjectTypeLabel(room);
}

function getManualSalePaymentLabel(methodId: string, methods: SettingMethod[] = PAYMENT_METHODS) {
  if (!methodId) return "Нет";
  return methods.find((method) => method.id === methodId)?.label
    ?? PAYMENT_METHODS.find((method) => method.id === methodId)?.label
    ?? methodId;
}

function formatReservationPaymentAmount(amount: number) {
  return amount > 0 ? formatPrice(amount) : "0 тг";
}

function getPaymentLinkForMethod(methodId: string, methods: Record<string, string>, fallbackLink: string) {
  if (!methodId) return fallbackLink;
  return methods[methodId]?.trim() || "";
}

function formatAnalyticsObjectTitle(item: { id: string; title: string }) {
  if (item.id.includes("sauna") || /сауна/i.test(item.title)) return "Сауна";
  return item.title;
}

function getReservationBalance(reservation: {
  balancePaidAt?: string;
  noShowAt?: string;
  paidAmount?: number;
  payments?: ReservationPayment[];
  prepayment: number;
  prepaymentReceivedAt?: string;
  status: Reservation["status"];
  total: number;
}) {
  return Math.max(0, reservation.total - getReservationPaidAmount(reservation));
}

function getReservationPaidAmount(
  reservation: {
    balancePaidAt?: string;
    noShowAt?: string;
    paidAmount?: number;
    payments?: ReservationPayment[];
    prepayment: number;
    prepaymentReceivedAt?: string;
    status: Reservation["status"];
    total: number;
  }
) {
  if (reservation.payments?.length) {
    return getReservationPaymentsTotal(reservation.payments, reservation.total);
  }
  if (typeof reservation.paidAmount === "number") {
    return clampNumber(reservation.paidAmount, 0, reservation.total);
  }
  const acceptedPrepayment = hasReservationPrepayment(reservation) ? reservation.prepayment : 0;
  return reservation.balancePaidAt ? reservation.total : acceptedPrepayment;
}

function getReservationPaymentsTotal(payments: ReservationPayment[] = [], total: number) {
  return clampNumber(payments.reduce((sum, payment) => sum + Math.max(0, payment.amount || 0), 0), 0, total);
}

function getReservationFinance(
  reservation: Pick<Reservation, "status" | "comment" | "total" | "prepayment" | "paidAmount" | "prepaymentReceivedAt" | "balancePaidAt" | "noShowAt" | "payments">
) {
  const balance = getReservationBalance(reservation);

  if (isHotelCancelledReservation(reservation)) {
    return {
      balancePayment: 0,
      displayBalance: 0,
      displayPrepayment: 0,
      outstandingBalance: 0,
      prepayment: 0,
      revenue: 0
    };
  }

  if (reservation.noShowAt) {
    const retainedPrepayment = hasReservationPrepayment(reservation) ? reservation.prepayment : 0;
    return {
      balancePayment: 0,
      displayBalance: 0,
      displayPrepayment: retainedPrepayment,
      outstandingBalance: 0,
      prepayment: retainedPrepayment,
      revenue: retainedPrepayment
    };
  }

  if (reservation.status === "cancelled") {
    const retainedPrepayment = hasReservationPrepayment(reservation) ? reservation.prepayment : 0;
    return {
      balancePayment: 0,
      displayBalance: 0,
      displayPrepayment: retainedPrepayment,
      outstandingBalance: 0,
      prepayment: retainedPrepayment,
      revenue: retainedPrepayment
    };
  }

  const acceptedPrepayment = hasReservationPrepayment(reservation) ? reservation.prepayment : 0;
  const paidAmount = getReservationPaidAmount(reservation);
  const balancePayment = Math.max(0, paidAmount - acceptedPrepayment);
  return {
    balancePayment,
    displayBalance: balance,
    displayPrepayment: acceptedPrepayment,
    outstandingBalance: reservation.status === "booked" ? balance : 0,
    prepayment: acceptedPrepayment,
    revenue: reservation.status === "booked" ? reservation.total : acceptedPrepayment + balancePayment
  };
}

function isHotelCancelledReservation(reservation: Pick<Reservation, "status" | "comment">) {
  return reservation.status === "cancelled" && /отель\s+отменил|предоплата\s+возвращается/i.test(reservation.comment || "");
}

function formatAnalyticsReservationPayment(reservation: Reservation) {
  const finance = getReservationFinance(reservation);
  const refunded = isHotelCancelledReservation(reservation) ? " · возврат предоплаты" : "";
  return (
    <>
      Всего {formatAnalyticsMoney(reservation.total)} · пред. {formatAnalyticsMoney(finance.displayPrepayment)} ·{" "}
      <em>ост. {formatAnalyticsMoney(finance.displayBalance)}</em>
      {refunded}
    </>
  );
}

function shouldExpandReservationDatesFromDraft(reservation: Reservation, draft: ChatBookingDraft) {
  if (!draft.lastReservation || draft.lastReservation.id !== reservation.id) return false;
  if (!draft.checkIn || !draft.checkOut) return false;

  return (
    parseDateInput(draft.checkIn) < parseDateInput(reservation.checkIn) ||
    parseDateInput(draft.checkOut) > parseDateInput(reservation.checkOut)
  );
}

function expandReservationDatesFromDraft(reservation: Reservation, draft: ChatBookingDraft): Reservation {
  if (!shouldExpandReservationDatesFromDraft(reservation, draft)) return reservation;

  return {
    ...reservation,
    checkIn: parseDateInput(draft.checkIn) < parseDateInput(reservation.checkIn) ? draft.checkIn : reservation.checkIn,
    checkOut: parseDateInput(draft.checkOut) > parseDateInput(reservation.checkOut) ? draft.checkOut : reservation.checkOut
  };
}

function reconcileDraftReservationDates(draft: ChatBookingDraft): ChatBookingDraft {
  if (!draft.lastReservation) return draft;
  const repairedReservation = expandReservationDatesFromDraft(draft.lastReservation, draft);
  if (repairedReservation === draft.lastReservation) return draft;

  return {
    ...draft,
    checkIn: repairedReservation.checkIn,
    checkOut: repairedReservation.checkOut,
    lastReservation: repairedReservation
  };
}

function formatReservationDateRange(reservation: Pick<Reservation, "checkIn" | "checkOut">) {
  const checkInDate = parseDateInput(reservation.checkIn);
  const checkOutDate = parseDateInput(reservation.checkOut);
  const sameMonth = checkInDate.getMonth() === checkOutDate.getMonth() && checkInDate.getFullYear() === checkOutDate.getFullYear();

  if (sameMonth) {
    const monthYear = new Intl.DateTimeFormat("ru-RU", {
      month: "long"
    }).format(checkInDate);
    return `${checkInDate.getDate()}-${checkOutDate.getDate()} ${monthYear}`;
  }

  return `${formatShortDayMonth(reservation.checkIn)} - ${formatShortDayMonth(reservation.checkOut)}`;
}

function buildReservationTimelineSegments(
  room: Room,
  reservations: Reservation[],
  timelineDays: Array<{ date: string }>
) {
  const firstDate = timelineDays[0]?.date ?? "";
  const lastDate = timelineDays[timelineDays.length - 1]?.date ?? "";
  if (!firstDate || !lastDate) return [];

  const segments = reservations
    .filter((reservation) => reservation.status !== "cancelled")
    .flatMap((reservation) => getReservationItems(reservation).filter((item) => item.roomId === room.id).map((item) => ({ reservation, item })))
    .map(({ reservation, item }) => {
      const startDate = item.checkIn < firstDate ? firstDate : item.checkIn;
      const endDate = item.checkOut > lastDate ? lastDate : item.checkOut;
      const startIndex = timelineDays.findIndex((day) => day.date === startDate);
      const endIndex = timelineDays.findIndex((day) => day.date === endDate);
      if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) return null;

      return {
        endIndex,
        lane: 0,
        reservation,
        roomId: room.id,
        startIndex
      };
    })
    .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment))
    .sort((left, right) => left.startIndex - right.startIndex || left.endIndex - right.endIndex);

  const laneEnds: number[] = [];
  return segments.map((segment) => {
    const laneIndex = laneEnds.findIndex((endIndex) => endIndex < segment.startIndex);
    const nextLane = laneIndex >= 0 ? laneIndex : laneEnds.length;
    laneEnds[nextLane] = segment.endIndex;
    return { ...segment, lane: nextLane };
  });
}

function buildCleaningTimelineSegments(
  room: Room,
  reservations: Reservation[],
  timelineDays: Array<{ date: string }>
) {
  if (!isStayBookingObject(room)) return [];
  return reservations
    .filter((reservation) => reservation.status !== "cancelled")
    .flatMap((reservation) => getReservationItems(reservation).filter((item) => item.roomId === room.id).map((item) => ({ reservation, item })))
    .map(({ reservation, item }) => {
      const dayIndex = timelineDays.findIndex((day) => day.date === item.checkOut);
      if (dayIndex < 0) return null;
      return {
        dayIndex,
        lane: 0,
        reservation,
        roomId: room.id
      };
    })
    .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
}

function formatShortDayMonth(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long"
  }).format(parseDateInput(date));
}

function hasReservationPrepayment(reservation: Pick<Reservation, "status" | "prepaymentReceivedAt" | "noShowAt">) {
  return Boolean(reservation.prepaymentReceivedAt || reservation.noShowAt || reservation.status === "booked");
}

function getReservationStatusLabel(reservation: Pick<Reservation, "status" | "checkedInAt" | "checkedOutAt" | "checkOut" | "checkOutTime" | "extendedAt" | "noShowAt" | "prepaymentReceivedAt">) {
  if (reservation.noShowAt) return "Незаезд";
  if (reservation.status === "cancelled") return "Снято с брони";
  if (isReservationCheckedOut(reservation)) return "Выехал";
  if (reservation.extendedAt) return "Продлен";
  if (reservation.checkedInAt) return "Въехал";
  if (reservation.prepaymentReceivedAt) return "Предоплата получена";
  if (reservation.status === "booked") return "Забронировано";
  if (reservation.status === "pending") return "На согласовании";
  return "Снято с брони";
}

function isReservationCheckedOut(reservation: Pick<Reservation, "checkedInAt" | "checkedOutAt" | "checkOut" | "checkOutTime">) {
  if (reservation.checkedOutAt) return true;
  if (!reservation.checkedInAt || !reservation.checkOut) return false;
  const [hours, minutes] = (reservation.checkOutTime || DEFAULT_CHECK_OUT_TIME).split(":").map((part) => Number(part));
  const checkOutDate = parseDateInput(reservation.checkOut);
  checkOutDate.setHours(Number.isFinite(hours) ? hours : 12, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return Date.now() >= checkOutDate.getTime();
}

function getPanelReservationChipLabel(reservation: Reservation | null) {
  if (!reservation) return "Выбрано";
  if (reservation.noShowAt) return "Незаезд";
  if (reservation.balancePaidAt) return "Оплата принята";
  if (reservation.checkedInAt) return "Въехал";
  if (reservation.status === "booked") return "Забронировано";
  if (reservation.status === "pending") return "На согласовании";
  return "Бронь отменена";
}

function getPanelReservationChipTone(reservation: Reservation | null) {
  if (!reservation) return "draft";
  if (reservation.status === "cancelled" || reservation.noShowAt) return "cancelled";
  if (reservation.balancePaidAt || reservation.checkedInAt || reservation.status === "booked") return "booked";
  return "pending";
}

function canMarkBalancePaid(reservation: Pick<Reservation, "status" | "balancePaidAt" | "noShowAt">) {
  return reservation.status !== "cancelled" && !reservation.noShowAt && !reservation.balancePaidAt;
}

function canMarkCheckedIn(reservation: Pick<Reservation, "status" | "checkedInAt" | "noShowAt">) {
  return reservation.status !== "cancelled" && !reservation.noShowAt && !reservation.checkedInAt;
}

function buildBookingPanelSummary(
  rooms: Room[],
  reservations: Reservation[],
  availableRooms: Room[],
  checkIn: string,
  checkOut: string,
  inventoryAirBeds: number,
  inventoryRollaways: number,
  packageDiscountPercent: number,
  packageMinRooms: number,
  packagePeriodDiscountPercent: number,
  packagePeriodDiscountFrom: string,
  packagePeriodDiscountTo: string,
  expenseEntries: ExpenseEntry[] = []
) {
  const bookableStayRooms = rooms.filter((room) => isRoomAvailableInBookingPanel(room) && isRoomIncludedInBookingSummary(room) && isStayBookingObject(room));
  const availableStayRooms = availableRooms.filter((room) => isStayBookingObject(room) && isRoomIncludedInBookingSummary(room));
  const availableServiceObjects = availableRooms.filter((room) => !isStayBookingObject(room) && isRoomIncludedInBookingSummary(room));
  const activeReservations = reservations.filter((reservation) =>
    reservation.status === "booked" && dateRangesOverlap(checkIn, checkOut, reservation.checkIn, reservation.checkOut)
  );
  const bookedStayRoomIds = new Set(
    activeReservations
      .flatMap((reservation) => reservation.roomIds)
      .filter((roomId) => {
        const room = rooms.find((item) => item.id === roomId);
        return room ? isStayBookingObject(room) : false;
      })
  );
  const bookedRevenue = activeReservations.reduce((sum, reservation) => sum + reservation.total, 0);
  const plannedRevenue = bookableStayRooms
    .reduce((sum, room) => sum + calculateRoomStayPrice(room, checkIn, checkOut), 0);
  const discountedReservations = activeReservations.filter((reservation) => reservation.discountAmount > 0);
  const actualDiscountAmount = discountedReservations.reduce((sum, reservation) => sum + reservation.discountAmount, 0);
  const analyticsReservations = filterAnalyticsReservations(reservations, rooms, { dateFrom: checkIn, dateTo: checkOut, search: "", statusFilter: "all" });
  const analyticsExpenses = filterAnalyticsExpenseEntries(expenseEntries, { dateFrom: checkIn, dateTo: checkOut });
  const analytics = buildAnalyticsSnapshot(analyticsReservations, {}, rooms, [], analyticsExpenses);
  const recommendation = buildAnalyticsPriceRecommendation({
    analytics,
    dateFrom: checkIn,
    dateTo: checkOut,
    expenseEntries: analyticsExpenses,
    reservations: analyticsReservations,
    rooms
  });
  const packageRequiredRooms = packageMinRooms > 0 ? packageMinRooms : bookableStayRooms.length;
  const configuredPackageDiscountPercent = packageDiscountPercent > 0 && bookableStayRooms.length >= packageRequiredRooms ? packageDiscountPercent : 0;
  const configuredPeriodDiscountPercent = packagePeriodDiscountPercent > 0 && isDateRangeOverlapping(checkIn, checkOut, packagePeriodDiscountFrom, packagePeriodDiscountTo)
    ? packagePeriodDiscountPercent
    : 0;
  const plannedDiscountPercent = Math.max(recommendation.discountReservePercent, configuredPackageDiscountPercent, configuredPeriodDiscountPercent);
  const plannedDiscountAmount = Math.round(plannedRevenue * plannedDiscountPercent / 100);
  const availableExtraInventory = getAvailableExtraInventory(reservations, checkIn, checkOut, inventoryAirBeds, inventoryRollaways);
  const availableStayCapacity = calculateAvailableStayCapacity(availableStayRooms, availableExtraInventory);

  return {
    actualDiscountAmount,
    actualDiscountCount: discountedReservations.length,
    availableRevenue: plannedRevenue,
    availableServiceObjects: availableServiceObjects.length,
    availableStayCapacity,
    availableStayRooms: availableStayRooms.length,
    bookedRevenue,
    bookedStayRooms: bookedStayRoomIds.size,
    plannedDiscountAmount,
    totalStayRooms: bookableStayRooms.length
  };
}

function buildCatalogAvailabilitySummary(
  rooms: Room[],
  reservations: Reservation[],
  checkIn: string,
  checkOut: string,
  inventoryAirBeds: number,
  inventoryRollaways: number
): CatalogAvailabilitySummary {
  const availableExtraInventory = getAvailableExtraInventory(reservations, checkIn, checkOut, inventoryAirBeds, inventoryRollaways);
  const visibleRooms = rooms.filter(isRoomIncludedInBookingSummary);
  const visibleStayRooms = visibleRooms.filter(isStayBookingObject);

  return {
    airBeds: availableExtraInventory.airBeds,
    gazebos: visibleRooms.filter((room) => room.objectType === "gazebo").length,
    mode: "available",
    rollaways: availableExtraInventory.rollaways,
    rooms: visibleStayRooms.length,
    saunas: visibleRooms.filter((room) => room.objectType === "sauna").length,
    sleepingPlaces: calculateAvailablePricePdfSleepingPlacesTotal(visibleStayRooms, availableExtraInventory)
  };
}

function buildBookedCatalogSummary(rooms: Room[], reservation: Reservation): CatalogAvailabilitySummary {
  const extraInventoryCounts = getReservationExtraInventoryCounts(reservation);

  return {
    airBeds: extraInventoryCounts.airBeds,
    gazebos: rooms.filter((room) => room.objectType === "gazebo").length,
    mode: "booked",
    rollaways: extraInventoryCounts.rollaways,
    rooms: rooms.filter(isStayBookingObject).length,
    saunas: rooms.filter((room) => room.objectType === "sauna").length,
    sleepingPlaces: calculateReservationSleepingPlacesTotal(reservation, rooms)
  };
}

function calculateAvailableStayCapacity(availableStayRooms: Room[], availableExtraInventory: { airBeds: number; rollaways: number }) {
  const baseCapacity = availableStayRooms.reduce((sum, room) => sum + getRoomBaseSleepingCapacity(room), 0);
  const allowedAirBeds = availableStayRooms.reduce((sum, room) => sum + getAllowedExtraPlaceCount(room, "air-bed"), 0);
  const allowedRollaways = availableStayRooms.reduce((sum, room) => sum + getAllowedExtraPlaceCount(room, "rollaway"), 0);
  return baseCapacity + Math.min(availableExtraInventory.airBeds, allowedAirBeds) + Math.min(availableExtraInventory.rollaways, allowedRollaways);
}

function getRoomBaseSleepingCapacity(room: Room) {
  if (!isStayBookingObject(room)) return 0;
  if (!room.sleepingPlaces.length) return room.capacityAdults + room.capacityChildren;
  return room.sleepingPlaces.reduce((sum, place) => {
    if (place.type === "air-bed" || place.type === "rollaway") return sum;
    return sum + getSleepingPlacePlacesCount(place);
  }, 0);
}

function getAvailableExtraInventory(
  reservations: Reservation[],
  checkIn: string,
  checkOut: string,
  inventoryAirBeds: number,
  inventoryRollaways: number
) {
  const used = reservations
    .filter((reservation) =>
      reservation.status === "booked" &&
      dateRangesOverlap(checkIn, checkOut, reservation.checkIn, reservation.checkOut)
    )
    .reduce((sum, reservation) => {
      const counts = getReservationExtraInventoryCounts(reservation);
      return {
        airBeds: sum.airBeds + counts.airBeds,
        rollaways: sum.rollaways + counts.rollaways
      };
    }, { airBeds: 0, rollaways: 0 });

  return {
    airBeds: Math.max(0, inventoryAirBeds - used.airBeds),
    rollaways: Math.max(0, inventoryRollaways - used.rollaways)
  };
}

function isStayBookingObject(room: Pick<Room, "category" | "objectType">) {
  return room.category === "guest-room" || room.objectType === "room" || room.objectType === "house";
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCreateTypeOption(objectType: Room["objectType"]) {
  return CREATE_TYPE_OPTIONS.find((option) => option.objectType === objectType) ?? CREATE_TYPE_OPTIONS[0];
}

function getCreateFallbackTitle(option: Pick<Room, "category" | "objectType">, nextNumber: string) {
  if (option.objectType === "house") return `Домик ${nextNumber}`;
  if (option.objectType === "room") return `Номер ${nextNumber}`;
  if (option.objectType === "sauna") return "Сауна с бассейном";
  if (option.objectType === "gazebo") return "Беседка";
  if (option.objectType === "bbq") return "Мангальная зона";
  if (option.objectType === "firepit") return "Костровая";
  if (option.objectType === "parking") return "Парковка";
  if (option.objectType === "dining") return "Столовая";
  if (option.category === "amenity") return "Услуга / зона";
  return "Служебный объект";
}

function createObjectCode(title: string) {
  const code = title
    .trim()
    .toUpperCase()
    .replace(/[^A-ZА-Я0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
  return code || "OBJECT";
}

function getObjectTypeLabel(room: Pick<Room, "category" | "objectType">) {
  if (room.objectType === "house") return "Домик";
  if (room.objectType === "room") return "Номер";
  if (room.objectType === "sauna") return "Сауна";
  if (room.objectType === "gazebo") return "Беседка";
  if (room.objectType === "bbq") return "Мангал";
  if (room.objectType === "firepit") return "Костровая";
  if (room.objectType === "parking") return "Парковка";
  if (room.objectType === "dining") return "Столовая";
  if (room.objectType === "staff" || room.category === "staff-room") return "Персонал";
  if (room.objectType === "amenity" || room.category === "amenity") return "Зона";
  return "Номер";
}

function getBathroomDescription(type: Room["bathroomType"]) {
  return BATHROOM_OPTIONS.find((option) => option.value === type)?.description ?? BATHROOM_OPTIONS[0].description;
}

function getObjectBathroomDescription(room: Pick<Room, "objectType" | "bathroomType">) {
  if (room.objectType === "sauna" && room.bathroomType === "inside-room") {
    return "Душ и санузел внутри сауны.";
  }

  return getBathroomDescription(room.bathroomType);
}

function getDefaultBathroomType(objectType: Room["objectType"]): Room["bathroomType"] {
  if (objectType === "room" || objectType === "house" || objectType === "sauna") return "inside-room";
  if (objectType === "gazebo") return "none";
  return "none";
}

function shouldShowBathroomType(objectType: Room["objectType"]) {
  return objectType === "room" || objectType === "house" || objectType === "sauna" || objectType === "gazebo" || objectType === "amenity";
}

function shouldShowBathroomInCard(objectType: Room["objectType"], bathroomType: Room["bathroomType"]) {
  return shouldShowBathroomType(objectType) && bathroomType !== "none";
}

function CatalogItemIcon({ room, size = 18 }: { room: Room; size?: number }) {
  if (room.objectType === "house") {
    return <Home size={size} />;
  }
  if (room.objectType === "dining") {
    return <Utensils size={size} />;
  }
  if (room.objectType === "parking") {
    return <Car size={size} />;
  }
  if (room.objectType === "sauna" || room.id.includes("sauna") || /сауна|бан/i.test(room.title)) {
    return <Flame size={size} />;
  }
  if (room.objectType === "bbq" || room.id.includes("bbq") || /мангал/i.test(room.title)) {
    return <Utensils size={size} />;
  }
  if (room.objectType === "firepit") {
    return <Flame size={size} />;
  }
  if (room.objectType === "gazebo" || room.id.includes("gazebo") || /бесед/i.test(room.title)) {
    return <Hotel size={size} />;
  }
  return <BedDouble size={size} />;
}

function getDefaultCategory(number: string): Room["category"] {
  const numeric = Number(number);
  if (numeric >= 101 && numeric <= 104) return "staff-room";
  return "guest-room";
}

function getDefaultBookable(number: string) {
  const numeric = Number(number);
  return !(numeric >= 101 && numeric <= 104);
}

function getDefaultGroup(category: Room["category"]) {
  if (category === "staff-room") return "Блок персонала";
  if (category === "amenity") return "Территория";
  return "Блок А";
}

function getDefaultObjectType(category: Room["category"]): Room["objectType"] {
  if (category === "amenity") return "amenity";
  if (category === "staff-room") return "staff";
  return "room";
}

function getGroupSuggestions(rooms: Room[]) {
  return Array.from(new Set(DEFAULT_GROUPS.concat(rooms.map((room) => room.group).filter(Boolean)))).sort((a, b) =>
    a.localeCompare(b, "ru")
  );
}

function getPreviousRoomGroup(rooms: Room[], roomId: string) {
  const index = rooms.findIndex((room) => room.id === roomId);
  return index > 0 ? rooms[index - 1].group : undefined;
}

function getDefaultIncludedInStay(id: string) {
  return id === "amenity-gazebo" || id === "amenity-bbq";
}

function formatPrice(price: number) {
  if (!price) return "Бесплатно";
  return `${new Intl.NumberFormat("ru-RU").format(price)} тг`;
}

function formatKitchenSaleRowLabel(sale: Reservation) {
  const label = (sale.comment || "").replace(/^Кухня:\s*/i, "").trim();
  const match = label.match(/^(.*?)\s*[×xх]\s*(\d+)\s*$/i);
  if (!match) return label;

  const title = match[1].trim();
  const portions = Math.max(1, Number(match[2]) || 1);
  const unitPrice = Math.round((sale.total || 0) / portions);
  return `${title} × ${portions} × ${formatPrice(unitPrice)}`;
}

function formatAnalyticsMoney(price: number) {
  return `${new Intl.NumberFormat("ru-RU").format(price || 0)} тг`;
}

function formatNightsWord(count: number) {
  const normalizedCount = Math.abs(count);
  const lastTwoDigits = normalizedCount % 100;
  const lastDigit = normalizedCount % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "ночей";
  if (lastDigit === 1) return "ночь";
  if (lastDigit >= 2 && lastDigit <= 4) return "ночи";
  return "ночей";
}

function formatKazakhDate(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parseDateInput(date));
}

function formatShortDateText(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short"
  }).format(parseDateInput(date)).replace(".", "");
}

function formatDateTimeText(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function isDateRangeOverlapping(checkIn: string, checkOut: string, periodFrom: string, periodTo: string) {
  if (!checkIn || !checkOut || !periodFrom) return false;
  const normalizedPeriodTo = periodTo || periodFrom;
  return checkIn <= normalizedPeriodTo && checkOut >= periodFrom;
}

function createExpenseId(prefix: string) {
  return `expense-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPriceInputValue(price: number, isFocused: boolean) {
  if (isFocused && price === 0) return "";
  if (!price) return "";
  return new Intl.NumberFormat("ru-RU").format(price);
}

function getFocusedNumberInputValue(value: number, isFocused: boolean) {
  return isFocused && value === 0 ? "" : value;
}

function parsePriceInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatExpenseAmountInput(value: string) {
  const amount = parsePriceInput(value);
  return amount ? new Intl.NumberFormat("ru-RU").format(amount) : "";
}

function formatRoomPriceLine(room: Room) {
  const weekdayPrice = room.weekdayPrice || room.basePrice || 0;
  const weekendPrice = room.weekendPrice || weekdayPrice;
  const holidayPrice = room.holidayPrice || weekendPrice;
  const priceLabel = isHourlyObject(room) ? "Цена за час" : "Цена";

  if (weekdayPrice === weekendPrice && weekdayPrice === holidayPrice) {
    return `${priceLabel}: ${formatPrice(weekdayPrice)}`;
  }

  return [
    `Будни: ${formatPrice(weekdayPrice)}`,
    `Выходные: ${formatPrice(weekendPrice)}`,
    `Праздники: ${formatPrice(holidayPrice)}`
  ].join("\n");
}

function getPriceForType(room: Room, type: "weekday" | "weekend" | "holiday") {
  const weekdayPrice = room.weekdayPrice || room.basePrice || 0;
  const weekendPrice = room.weekendPrice || weekdayPrice;
  const holidayPrice = room.holidayPrice || weekendPrice;
  if (type === "holiday") return holidayPrice;
  if (type === "weekend") return weekendPrice;
  return weekdayPrice;
}

function getPriceTypesInRange(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return ["weekday"] as Array<"weekday" | "weekend" | "holiday">;
  const order: Array<"weekday" | "weekend" | "holiday"> = ["weekday", "weekend", "holiday"];
  const selectedTypes = new Set<"weekday" | "weekend" | "holiday">();
  const nights = getNightsCount(checkIn, checkOut);
  for (let day = 0; day < nights; day += 1) {
    selectedTypes.add(getPriceTypeForDate(formatDateInput(addDays(parseDateInput(checkIn), day))));
  }
  return order.filter((type) => selectedTypes.has(type));
}

function getRoomDayTypePriceLines(room: Room, checkIn: string, checkOut: string, compact = false) {
  const labels: Record<"weekday" | "weekend" | "holiday", string> = compact
    ? { weekday: "Будни", weekend: "Выходные", holiday: "Праздники" }
    : { weekday: "Будни", weekend: "Выходные", holiday: "Праздники" };
  return getPriceTypesInRange(checkIn, checkOut).map((type) => `${labels[type]}: ${formatPrice(getPriceForType(room, type))}`);
}

function getPriceProposalRoomPriceLines(room: Room, checkIn: string, checkOut: string, groupPeriodTotals: boolean) {
  if (isHourlyBookingObject(room)) {
    return [`Цена: ${formatPrice(calculateRoomStayPrice(room, checkIn, checkOut))} / 2 ч.`];
  }

  if (groupPeriodTotals) {
    return [`Цена за период: ${formatPrice(calculateRoomStayPrice(room, checkIn, checkOut))}`];
  }

  return getRoomDayTypePriceLines(room, checkIn, checkOut);
}

type SocialPricePriceRow = {
  label: string;
  value: string;
  tone: "primary" | "secondary";
};

function getSocialPricePeriodDiscountPercent(checkIn: string, checkOut: string, periodDiscountPercent = 0, periodDiscountFrom = "", periodDiscountTo = "") {
  return periodDiscountPercent > 0 && isDateRangeOverlapping(checkIn, checkOut, periodDiscountFrom, periodDiscountTo)
    ? periodDiscountPercent
    : 0;
}

function getSocialPricePriceRows(
  room: Room,
  checkIn: string,
  checkOut: string,
  groupPeriodTotals: boolean,
  periodDiscountPercent = 0,
  periodDiscountFrom = "",
  periodDiscountTo = ""
): SocialPricePriceRow[] {
  if (isHourlyBookingObject(room)) {
    return [{ label: "", value: `${formatPrice(calculateRoomStayPrice(room, checkIn, checkOut))} / 2 ч.`, tone: "primary" }];
  }

  const basePrice = groupPeriodTotals
    ? calculateRoomStayPrice(room, checkIn, checkOut)
    : getRoomPriceForDate(room, checkIn);
  const activeDiscountPercent = basePrice > 0
    ? getSocialPricePeriodDiscountPercent(checkIn, checkOut, periodDiscountPercent, periodDiscountFrom, periodDiscountTo)
    : 0;
  const discountedPrice = activeDiscountPercent > 0 ? Math.round(basePrice * (100 - activeDiscountPercent) / 100) : basePrice;
  const weekdayPrice = getPriceForType(room, "weekday");
  const weekendPrice = getPriceForType(room, "weekend");
  const rows: SocialPricePriceRow[] = [
    {
      label: activeDiscountPercent > 0 ? "Со скидкой" : groupPeriodTotals && getNightsCount(checkIn, checkOut) > 1 ? "За период" : "Цена",
      value: formatPrice(discountedPrice),
      tone: "primary"
    }
  ];

  if (activeDiscountPercent > 0) {
    rows.push({ label: "Без скидки", value: formatPrice(basePrice), tone: "secondary" });
  }
  rows.push(
    { label: "Будни", value: formatPrice(weekdayPrice), tone: "secondary" },
    { label: "Выходные", value: formatPrice(weekendPrice), tone: "secondary" }
  );
  return rows;
}

function getSocialPriceDisplayPriceLines(
  room: Room,
  checkIn: string,
  checkOut: string,
  groupPeriodTotals: boolean,
  periodDiscountPercent = 0,
  periodDiscountFrom = "",
  periodDiscountTo = ""
) {
  return getSocialPricePriceRows(room, checkIn, checkOut, groupPeriodTotals, periodDiscountPercent, periodDiscountFrom, periodDiscountTo)
    .map((row) => row.label ? `${row.label}: ${row.value}` : row.value);
}

function formatSelectedDatePriceLine(room: Room, date: string) {
  if (isHourlyObject(room)) {
    return `Цена за час: ${formatPrice(getRoomPriceForDate(room, date))}`;
  }

  const priceType = getPriceTypeForDate(date);
  const label = priceType === "holiday" ? "Цена на праздник" : priceType === "weekend" ? "Цена на выходной" : "Цена";
  return `${label}: ${formatPrice(getRoomPriceForDate(room, date))}`;
}

function getCatalogCardTitle(room: Room) {
  const objectLabel = getObjectTypeLabel(room);
  if (shouldShowObjectNumber(room)) {
    const objectNumber = room.number ? `${objectLabel} ${room.number}` : objectLabel;
    return room.title ? `${objectNumber} / ${room.title}` : objectNumber;
  }

  return room.title || objectLabel;
}

function formatBookingPickerObjectLabel(room: Room) {
  if (room.objectType === "sauna") return "Сауна";
  return shouldShowObjectNumber(room) ? room.number || "Без номера" : room.title || getObjectTypeLabel(room);
}

function getSocialPricePeriodText(checkIn: string, checkOut: string) {
  if (!checkIn && !checkOut) return "Актуальный прайс";
  if (checkIn && checkOut && checkIn !== checkOut) return `${formatKazakhDate(checkIn)} - ${formatKazakhDate(checkOut)}`;
  return `На ${formatKazakhDate(checkIn || checkOut)}`;
}

function getSocialPriceObjectIcon(room: Room) {
  if (room.objectType === "sauna") return "С";
  if (room.objectType === "gazebo") return "Б";
  if (room.category === "amenity") return "У";
  return "Н";
}

function getSocialPriceObjectTitle(room: Room) {
  if (room.objectType === "sauna") return room.title || "Сауна с бассейном";
  if (room.objectType === "gazebo") return room.title || "Беседка";
  if (shouldShowObjectNumber(room)) return `Номер ${room.number || ""}`.trim();
  return room.title || getObjectTypeLabel(room);
}

function getSocialPriceListTitle(room: Room) {
  if (shouldShowObjectNumber(room)) {
    return `Номер ${room.number || ""} | ${room.title || getObjectTypeLabel(room)}${room.floor ? ` | ${room.floor}` : ""}`.trim();
  }
  return `${room.title || getObjectTypeLabel(room)}${room.floor ? ` | ${room.floor}` : ""}`;
}

function getSocialPriceHourlyPriceLine(room: Room, checkIn: string) {
  const hourlyPrice = getRoomPriceForDate(room, checkIn);
  return `Цена: ${formatPrice(hourlyPrice)}/час · минимум 2 часа`;
}

function getSocialPriceDisplayPrice(room: Room, checkIn: string, checkOut: string, groupPeriodTotals = true) {
  return getSocialPriceDisplayPriceLines(room, checkIn, checkOut, groupPeriodTotals).join(" · ");
}

function getSocialPriceListDetails(room: Room, checkIn: string) {
  if (isStayBookingObject(room)) {
    const sleeping = formatSleepingPlaces(room.sleepingPlaces);
    const food = getSelectedFood(room.amenities);
    return [
      sleeping ? `Места: ${sleeping}` : "",
      food.length ? `Питание: ${food.join(", ")}` : "",
      buildSocialPriceAmenityLine(room)
    ].filter(Boolean);
  }

  if (room.objectType === "gazebo") {
    return ["Входит в проживание", buildSocialPriceAmenityLine(room)].filter(Boolean);
  }

  if (isHourlyBookingObject(room)) {
    return [getSocialPriceHourlyPriceLine(room, checkIn), buildSocialPriceAmenityLine(room)].filter(Boolean);
  }

  return [buildSocialPriceAmenityLine(room)].filter(Boolean);
}

function getSocialPriceCardDescriptionLines(room: Room, checkIn: string, checkOut: string) {
  const food = getSelectedFood(room.amenities);
  const lines = [
    shouldShowObjectNumber(room) ? [room.number, room.title, room.floor].filter(Boolean).join(" | ") : room.title || getObjectTypeLabel(room),
    ...(
      isStayBookingObject(room)
        ? getVisibleSleepingPlaces(room.sleepingPlaces).map((place) => `| ${formatSleepingPlaceWithCapacity(place).replace(" / ", " | ")}`)
        : []
    ),
    food.length ? `| Питание: ${food.join(", ")}` : "",
    buildSocialPriceAmenityLine(room) ? `| Удобства: ${buildSocialPriceAmenityLine(room)}` : "",
    room.objectType === "gazebo" ? "| Беседка входит в стоимость проживания" : "",
    isHourlyBookingObject(room) ? `| ${getSocialPriceHourlyPriceLine(room, checkIn)}` : "",
    isStayBookingObject(room) ? `| Период: ${getNightsCount(checkIn, checkOut)} ноч.` : ""
  ];
  return lines.filter(Boolean);
}

function buildSocialPriceAmenityLine(room: Room) {
  const bathroomDescription = shouldShowBathroomInCard(room.objectType, room.bathroomType) ? getObjectBathroomDescription(room) : "";
  const amenities = getVisibleAmenities(room);
  return [bathroomDescription, amenities.join(", ")].filter(Boolean).join(" ");
}

function getSocialPriceObjectMeta(room: Room, checkIn: string, checkOut: string) {
  const parts = [];
  if (room.title && shouldShowObjectNumber(room)) parts.push(room.title);
  if (room.floor) parts.push(room.floor);
  if (isStayBookingObject(room)) parts.push(`${calculateRoomSleepingPlacesTotal(room)} мест`);
  if (isHourlyBookingObject(room)) parts.push("по часам");
  if (isStayBookingObject(room)) parts.push(`${getNightsCount(checkIn, checkOut)} ноч.`);
  return parts.filter(Boolean).join(" · ");
}

function getPanelObjectCapacityTitle(room: Room) {
  if (!isStayBookingObject(room)) return room.title || getObjectTypeLabel(room);
  return formatCapacityTitle(getRoomTotalSleepingCapacity(room));
}

function getPanelObjectMetaLine(room: Room) {
  if (!shouldShowObjectNumber(room)) return room.floor || "";
  return [room.number || "Без номера", room.title || getObjectTypeLabel(room), room.floor].filter(Boolean).join(" | ");
}

function getRoomTotalSleepingCapacity(room: Room) {
  if (!isStayBookingObject(room)) return room.capacityAdults + room.capacityChildren;
  const capacity = room.sleepingPlaces.reduce((sum, place) => {
    return sum + getSleepingPlacePlacesCount(place);
  }, 0);
  return capacity || room.capacityAdults + room.capacityChildren || 1;
}

function formatCapacityTitle(capacity: number) {
  const normalizedCapacity = Math.max(1, Math.round(capacity));
  const labels: Record<number, string> = {
    1: "Одноместный",
    2: "Двухместный",
    3: "Трехместный",
    4: "Четырехместный",
    5: "Пятиместный",
    6: "Шестиместный"
  };
  return labels[normalizedCapacity] ?? `${normalizedCapacity}-местный`;
}

function formatCardPrice(price: number) {
  return price ? new Intl.NumberFormat("ru-RU").format(price) : "0";
}

function shouldShowObjectNumber(room: Pick<Room, "objectType" | "category">) {
  return room.objectType === "room" || room.objectType === "house" || room.category === "guest-room";
}

function shouldShowStayTimes(room: Pick<Room, "objectType" | "category">) {
  return room.objectType === "room" || room.objectType === "house" || room.category === "guest-room";
}

function isHourlyObject(room: Pick<Room, "objectType" | "category">) {
  return room.category === "amenity" || ["sauna", "gazebo", "bbq", "firepit", "parking", "dining", "amenity"].includes(room.objectType);
}

function isHourlyBookingObject(room: Pick<Room, "objectType">) {
  return room.objectType === "sauna";
}

function getObjectCapacityLine(room: Pick<Room, "category" | "objectType" | "capacityAdults">) {
  if (room.category !== "amenity") return "";
  if (room.objectType === "parking") return room.capacityAdults > 0 ? `\nМест: ${room.capacityAdults}` : "";
  if (room.objectType === "bbq") return room.capacityAdults > 0 ? `\nКоличество: ${room.capacityAdults}` : "";
  return room.capacityAdults > 0 ? `\nВместимость: до ${room.capacityAdults} чел.` : "";
}

function getPriceTypeForDate(date: string) {
  if (isKazakhstanHoliday(date)) return "holiday";
  if (isWeekendDate(date)) return "weekend";
  return "weekday";
}

function buildWhatsAppPreview(room: Room, checkInTime = DEFAULT_CHECK_IN_TIME, checkOutTime = DEFAULT_CHECK_OUT_TIME, priceDate?: string) {
  const price = priceDate ? formatSelectedDatePriceLine(room, priceDate) : formatRoomPriceLine(room);
  const food = getSelectedFood(room.amenities);
  const amenities = getVisibleAmenities(room);
  const foodLine = food.length ? `\nПитание: ${food.join(", ")}` : "";
  const sleepingPlaces = formatSleepingPlaces(room.sleepingPlaces);
  const sleepingLine = sleepingPlaces ? `\nМеста: ${sleepingPlaces}` : "";
  const extraSleepingPlaces = formatConfiguredExtraSleepingPlaces(room.sleepingPlaces);
  const extraSleepingLine = extraSleepingPlaces ? `\nДопместа: ${extraSleepingPlaces}` : "";
  const capacityLine = getObjectCapacityLine(room);
  const bathroomDescription = shouldShowBathroomInCard(room.objectType, room.bathroomType) ? getObjectBathroomDescription(room) : "";
  const amenitiesText = [bathroomDescription, amenities.join(", ")].filter(Boolean).join(" ");
  const amenitiesLine = amenitiesText ? `\nУдобства: ${amenitiesText}` : "";
  const minimumDuration = room.objectType === "sauna" ? "\nМинимум 2 часа" : "";
  const times = shouldShowStayTimes(room) ? `\nЗаезд ${checkInTime}, выезд ${checkOutTime}` : "";
  const titleLine = getCatalogCardTitle(room);
  return `${titleLine}${capacityLine}${sleepingLine}${extraSleepingLine}${foodLine}${amenitiesLine}${minimumDuration}${times}\n${price}`;
}

function buildReservationMessage(reservation: Reservation, rooms: Room[]) {
  const reservationItems = getReservationItems(reservation, rooms);
  const bookedRooms = reservationItems
    .map((item) => rooms.find((room) => room.id === item.roomId))
    .filter((room): room is Room => Boolean(room));
  const nightlyRooms = bookedRooms.filter((room) => !isHourlyBookingObject(room));
  const hourlyRooms = bookedRooms.filter(isHourlyBookingObject);
  const guestName = reservation.guestFirstName || "Гость";
  const guestLabel = "Гость";
  const hourlyHours = Math.max(2, reservation.hourlyHours ?? 2);
  const roomLines = reservationItems.map((item) => {
    const room = rooms.find((candidate) => candidate.id === item.roomId);
    if (!room || isHourlyBookingObject(room)) return "";
    const roomExtraInventory = formatRoomExtraInventoryLines(reservation.extraInventoryByRoomId?.[room.id]);

    const sleepingPlaces = formatReservationSleepingPlaceLines(room.sleepingPlaces);
    const floorText = room.floor ? ` | ${room.floor}` : "";
    const hasCustomDates = item.checkIn !== reservation.checkIn || item.checkOut !== reservation.checkOut;
    const dateLines = [
      ...(hasCustomDates ? [
      `| Заезд: ${formatKazakhDate(item.checkIn)} ${item.checkInTime || reservation.checkInTime}`,
        `| Выезд: ${formatKazakhDate(item.checkOut)} ${item.checkOutTime || reservation.checkOutTime}`
      ] : []),
      `| Сутки: ${getNightsCount(item.checkIn, item.checkOut)}`
    ];
    return [
      `*${getObjectTypeLabel(room)} ${room.number} | ${room.title}${floorText}*`,
      ...dateLines,
      ...sleepingPlaces,
      formatReservationRoomDailyPriceLine(room, item.checkIn, item.checkOut),
      roomExtraInventory
    ].filter(Boolean).join("\n");
  }).filter(Boolean).join("\n\n");
  const hasNightlyRooms = nightlyRooms.length > 0;
  const hasHourlyRooms = hourlyRooms.length > 0;
  const hasOnlyHourlyRooms = hasHourlyRooms && !hasNightlyRooms;
  const hourlyRoomTotal = hourlyRooms.reduce((sum, room) => sum + calculateRoomStayPrice(room, reservation.checkIn, reservation.checkOut, hourlyHours), 0);
  const hourlyReservationLines = hourlyRooms
    .map((room) => hasOnlyHourlyRooms
      ? [
        `*${room.title}:*`,
        `* Время: ${reservation.checkInTime} - ${reservation.checkOutTime} (${hourlyHours} ч.)`,
        `* Цена: ${formatPrice(calculateRoomStayPrice(room, reservation.checkIn, reservation.checkOut, hourlyHours))}`
      ].join("\n")
      : `Сауна: ${formatKazakhDate(reservation.checkIn)} с ${reservation.checkInTime} по ${reservation.checkOutTime}, ${hourlyHours} ч.`
    )
    .join("\n\n");
  const extraInventoryCounts = getReservationExtraInventoryCounts(reservation);
  const extraInventoryUnitPrice = getExtraPlaceUnitPrice(bookedRooms);
  const extraInventoryNights = getNightsCount(reservation.checkIn, reservation.checkOut);
  const extraInventoryLines = [
    extraInventoryCounts.airBeds > 0 ? `* Надувной матрас: ${extraInventoryCounts.airBeds} (+${formatPrice(extraInventoryCounts.airBeds * extraInventoryUnitPrice * extraInventoryNights)})` : "",
    extraInventoryCounts.rollaways > 0 ? `* Раскладушка: ${extraInventoryCounts.rollaways} (+${formatPrice(extraInventoryCounts.rollaways * extraInventoryUnitPrice * extraInventoryNights)})` : ""
  ].filter(Boolean);
  const extraInventory = extraInventoryLines.length ? `\n\n*Допместа всего:*\n${extraInventoryLines.join("\n")}` : "";
  const sleepingPlaceTotal = calculateReservationSleepingPlacesTotal(reservation, bookedRooms);
  const nightlyReservationItems = reservationItems.filter((item) => {
    const room = rooms.find((candidate) => candidate.id === item.roomId);
    return room && !isHourlyBookingObject(room);
  });
  const uniqueNightlyPeriods = Array.from(new Set(nightlyReservationItems.map((item) => `${item.checkIn}::${item.checkOut}`)));
  const summaryNightsText = uniqueNightlyPeriods.length <= 1
    ? String(getNightsCount(nightlyReservationItems[0]?.checkIn ?? reservation.checkIn, nightlyReservationItems[0]?.checkOut ?? reservation.checkOut))
    : nightlyReservationItems.map((item) => getNightsCount(item.checkIn, item.checkOut)).join(" / ");
  const averagePerPersonLine = formatReservationAveragePerPersonLine(
    reservation,
    uniqueNightlyPeriods.length <= 1
      ? getNightsCount(nightlyReservationItems[0]?.checkIn ?? reservation.checkIn, nightlyReservationItems[0]?.checkOut ?? reservation.checkOut)
      : getNightsCount(reservation.checkIn, reservation.checkOut)
  );
  const summaryLines = hasOnlyHourlyRooms ? "" : [
    "*Итого:*",
    `| Сутки: ${summaryNightsText}`,
    `| Номера: ${nightlyRooms.length}`,
    formatReservationSummaryGuestLine(reservation),
    sleepingPlaceTotal > 0 ? `| Спальных мест: ${sleepingPlaceTotal}` : "",
    reservation.breakfastIncluded === false && reservation.breakfastDiscountAmount ? `| Без завтрака: -${formatPrice(reservation.breakfastDiscountAmount)}` : "",
    hourlyRoomTotal > 0 ? `| Сауна с бассейном: ${formatPrice(hourlyRoomTotal)}` : "",
    `| Сумма: ${formatPrice(reservation.subtotal)}`,
    reservation.discountPercent && reservation.discountAmount > 0 ? `| Скидка: ${reservation.discountPercent}% (${formatPrice(reservation.discountAmount)})` : "",
    `*| Сумма со скидкой: ${formatPrice(reservation.total)}*`,
    averagePerPersonLine
  ].filter(Boolean).join("\n");
  const extraBed = reservation.extraBed && !extraInventoryLines.length ? "\nДоп. кровать: по согласованию включена" : "";
  const comment = formatReservationComment(reservation.comment);
  const balance = Math.max(0, reservation.total - reservation.prepayment);
  const fullPaymentMode = reservation.prepayment >= reservation.total;
  const payment = reservation.prepaymentReceivedAt
    ? `\n*${fullPaymentMode ? "Оплата внесена" : "Предоплата внесена"}: ${formatPrice(reservation.prepayment)}*\nОстаток к оплате: ${formatPrice(balance)}`
    : `\n\n*${fullPaymentMode ? "К оплате 100%" : "Предоплата 50%"}: ${formatPrice(reservation.prepayment)}*${reservation.paymentLink ? `\n${reservation.paymentLink}` : ""}`;
  const stayDates = hasNightlyRooms
    ? `\nЗаезд: ${formatKazakhDate(reservation.checkIn)} ${reservation.checkInTime}\nВыезд: ${formatKazakhDate(reservation.checkOut)} ${reservation.checkOutTime}`
    : "";
  const breakfastLine = hasNightlyRooms
    ? `\nПитание: ${reservation.breakfastIncluded === false ? "без завтрака" : "завтрак включен"}`
    : "";
  const petLine = reservation.hasPet ? "\nПитомец: да" : "";

  const bookingCondition = reservation.isManualSale
    ? ""
    : fullPaymentMode
      ? "* После полной оплаты бронь закрепляем за вами.\n* При незаезде оплата не возвращается."
      : "* После внесения предоплаты бронь закрепляем за вами.\n* При незаезде предоплата не возвращается.";

  return `*${guestName}*
Бронирование
на согласование
${stayDates}
${breakfastLine ? breakfastLine.trim() : ""}
${petLine ? petLine.trim() : ""}
${[roomLines, hourlyReservationLines].filter(Boolean).join("\n\n")}${extraBed}${extraInventory}${comment}${summaryLines ? `\n\n${summaryLines}` : ""}${payment}${bookingCondition ? `\n\n${bookingCondition}` : ""}`;
}

function formatReservationRoomDailyPriceLine(room: Room, checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) {
    return `| Цена за сутки: ${formatPrice(getRoomPriceForDate(room, checkIn))}`;
  }

  const nights = getNightsCount(checkIn, checkOut);
  const priceGroups = Array.from({ length: nights }, (_, day) => {
    const date = formatDateInput(addDays(parseDateInput(checkIn), day));
    const priceType = getPriceTypeForDate(date);
    return {
      priceType,
      price: getRoomPriceForDate(room, date)
    };
  });
  const uniquePrices = Array.from(new Set(priceGroups.map((item) => item.price)));

  if (uniquePrices.length <= 1) {
    return `| Цена за сутки: ${formatPrice(uniquePrices[0] ?? getRoomPriceForDate(room, checkIn))}`;
  }

  const labels: Record<"weekday" | "weekend" | "holiday", string> = {
    holiday: "Праздник",
    weekend: "Выходной",
    weekday: "Будний"
  };
  const order: Array<"weekend" | "holiday" | "weekday"> = ["weekend", "holiday", "weekday"];
  const compactGroups = order
    .map((priceType) => {
      const group = priceGroups.find((item) => item.priceType === priceType);
      return group ? `${labels[priceType]} ${formatPrice(group.price)}` : "";
    })
    .filter(Boolean);

  return `| Цена за сутки: ${compactGroups.join(" / ")}`;
}

function buildReservationTotalMessage(reservation: Reservation, rooms: Room[]) {
  const bookedRooms = reservation.roomIds
    .map((roomId) => rooms.find((room) => room.id === roomId))
    .filter((room): room is Room => Boolean(room));
  const nightlyRooms = bookedRooms.filter((room) => !isHourlyBookingObject(room));
  const sleepingPlaceTotal = calculateReservationSleepingPlacesTotal(reservation, bookedRooms);
  const fullPaymentMode = reservation.prepayment >= reservation.total;
  const discountLine = reservation.discountPercent && reservation.discountAmount > 0
    ? `| Скидка: ${reservation.discountPercent}% (${formatPrice(reservation.discountAmount)})`
    : "";
  const nights = getNightsCount(reservation.checkIn, reservation.checkOut);
  const averagePerPersonLine = formatReservationAveragePerPersonLine(reservation, nights);
  const guestSummaryLine = formatReservationSummaryGuestLine(reservation);

  const lines = [
    reservation.guestFirstName || "Гость",
    `Заезд: ${formatKazakhDate(reservation.checkIn)} ${reservation.checkInTime}`,
    `Выезд: ${formatKazakhDate(reservation.checkOut)} ${reservation.checkOutTime}`,
    "",
    "*Итого:*",
    `| Сутки: ${nights}`,
    `| Номера: ${nightlyRooms.length}`,
    ...(guestSummaryLine ? [guestSummaryLine] : []),
    ...(sleepingPlaceTotal > 0 ? [`| Спальных мест: ${sleepingPlaceTotal}`] : []),
    `| Сумма: ${formatPrice(reservation.subtotal)}`,
    ...(discountLine ? [discountLine] : []),
    `*| Сумма со скидкой: ${formatPrice(reservation.total)}*`,
    ...(averagePerPersonLine ? [averagePerPersonLine] : []),
    "",
    `*${fullPaymentMode ? "К оплате 100%" : "Предоплата 50%"}: ${formatPrice(reservation.prepayment)}*`,
    ...(reservation.paymentLink ? [reservation.paymentLink] : []),
    "",
    "* После внесения предоплаты бронь закрепляем за вами.",
    "* При незаезде предоплата не возвращается."
  ];

  return lines.join("\n").trim();
}

function buildReservationPaymentConfirmationMessage(reservation: Reservation, rooms: Room[]) {
  const paidAmount = Math.max(0, reservation.paidAmount ?? 0);
  const balance = Math.max(0, reservation.total - paidAmount);
  const paymentLabel = getManualSalePaymentLabel(reservation.paymentMethod ?? "");
  return [
    `*${reservation.guestFirstName || "Гость"}*`,
    "Подтверждение брони",
    `Номера: ${formatReservationConfirmationRooms(reservation, rooms)}`,
    `Заезд: ${formatKazakhDate(reservation.checkIn)} ${reservation.checkInTime}`,
    `Выезд: ${formatKazakhDate(reservation.checkOut)} ${reservation.checkOutTime}`,
    formatReservationGuestCountText(reservation),
    "",
    "Оплата поступила.",
    `Получено: ${formatPrice(paidAmount)}`,
    `Остаток: ${formatPrice(balance)}`,
    paymentLabel ? `Способ оплаты: ${paymentLabel}` : "",
    "Оставшаяся сумма вносится в день заезда."
  ].filter(Boolean).join("\n");
}

function formatReservationComment(comment: string) {
  if (!comment) return "";
  return `\nКомментарий: ${comment}`;
}

function formatRoomExtraInventoryLines(item?: { airBeds?: number; rollaways?: number }) {
  const lines = [
    item?.airBeds ? `| Надувной матрас: ${item.airBeds} | Мест: ${item.airBeds}` : "",
    item?.rollaways ? `| Раскладушка: ${item.rollaways} | Мест: ${item.rollaways}` : ""
  ].filter(Boolean);
  return lines.length ? `*Допместа:*\n${lines.join("\n")}` : "";
}

async function createSocialPriceImageBlob({
  checkIn,
  checkOut,
  description,
  groupPeriodTotals = true,
  periodDiscountFrom = "",
  periodDiscountPercent = 0,
  periodDiscountTo = "",
  rooms
}: {
  checkIn: string;
  checkOut: string;
  description: string;
  groupPeriodTotals?: boolean;
  periodDiscountFrom?: string;
  periodDiscountPercent?: number;
  periodDiscountTo?: string;
  rooms: Room[];
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");

  context.fillStyle = "#f4f7f4";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#0f765f";
  context.font = "800 30px Arial, sans-serif";
  context.fillText(getSocialPricePeriodText(checkIn, checkOut), 54, 76);

  let y = 104;
  if (description.trim()) {
    context.font = "600 23px Arial, sans-serif";
    const descriptionLines = wrapCanvasText(context, description.trim(), 900).slice(0, 3);
    drawRoundRect(context, 54, y, 972, 38 + descriptionLines.length * 30, 22, "#ffffff");
    context.fillStyle = "#25313d";
    descriptionLines.forEach((line, index) => context.fillText(line, 84, y + 34 + index * 30));
    y += 52 + descriptionLines.length * 30;
  }

  const selectedRooms = rooms.filter(isStayBookingObject);
  const listBottom = 1814;
  const maxListHeight = Math.max(640, listBottom - y);
  const cardGap = rooms.length > 12 ? 6 : 8;
  const cardHeight = Math.max(78, Math.min(126, Math.floor((maxListHeight - cardGap * Math.max(0, rooms.length - 1)) / Math.max(1, rooms.length))));
  const compact = cardHeight < 104;
  const visibleLimit = Math.max(1, Math.floor(maxListHeight / (cardHeight + cardGap)));
  const visibleRooms = rooms.slice(0, visibleLimit);
  const hiddenCount = Math.max(0, rooms.length - visibleRooms.length);

  visibleRooms.forEach((room) => {
    drawRoundRect(context, 54, y, 972, cardHeight, 22, "#ffffff");
    drawRoundRect(context, 78, y + (compact ? 10 : 16), compact ? 48 : 58, compact ? 48 : 58, 15, "#e4f5ef");
    context.fillStyle = "#0f765f";
    context.font = `800 ${compact ? 21 : 27}px Arial, sans-serif`;
    context.textAlign = "center";
    context.fillText(getSocialPriceObjectIcon(room), 78 + (compact ? 24 : 29), y + (compact ? 42 : 56));
    context.textAlign = "left";

    context.fillStyle = "#14212c";
    context.font = `800 ${compact ? 22 : 26}px Arial, sans-serif`;
    context.fillText(getSocialPriceListTitle(room), 148, y + (compact ? 30 : 38));
    context.fillStyle = "#596675";
    context.font = `600 ${compact ? 16 : 19}px Arial, sans-serif`;
    const detailMaxWidth = compact ? 470 : 500;
    const detailLines = getSocialPriceListDetails(room, checkIn)
      .flatMap((line) => wrapCanvasText(context, line, detailMaxWidth))
      .slice(0, compact ? 2 : 3);
    detailLines.forEach((line, index) => context.fillText(fitCanvasText(context, line, detailMaxWidth), 148, y + (compact ? 55 : 68) + index * (compact ? 20 : 23)));

    context.textAlign = "right";
    const priceRows = getSocialPricePriceRows(room, checkIn, checkOut, groupPeriodTotals, periodDiscountPercent, periodDiscountFrom, periodDiscountTo).slice(0, compact ? 3 : 4);
    const primaryPrice = priceRows[0];
    if (primaryPrice) {
      context.fillStyle = "#0f765f";
      context.font = `900 ${compact ? 17 : 19}px Arial, sans-serif`;
      if (primaryPrice.label) context.fillText(fitCanvasText(context, primaryPrice.label, 260), 992, y + (compact ? 25 : 31));
      context.font = `900 ${compact ? 21 : 25}px Arial, sans-serif`;
      context.fillText(fitCanvasText(context, primaryPrice.value, 260), 992, y + (compact ? 50 : 59));
    }
    priceRows.slice(1, compact ? 3 : 4).forEach((row, index) => {
      const rowY = y + (compact ? 72 : 79) + index * (compact ? 18 : 20);
      context.fillStyle = "#596675";
      context.font = `700 ${compact ? 13 : 15}px Arial, sans-serif`;
      const label = row.label ? `${row.label}: ${row.value}` : row.value;
      context.fillText(fitCanvasText(context, label, 270), 992, rowY);
    });
    context.textAlign = "left";
    y += cardHeight + cardGap;
  });

  if (hiddenCount > 0) {
    context.fillStyle = "#596675";
    context.font = "700 26px Arial, sans-serif";
    context.fillText(`Еще объектов: ${hiddenCount}`, 74, y + 22);
  }

  context.fillStyle = "#0f765f";
  context.font = "800 21px Arial, sans-serif";
  context.fillText(`Номеров: ${selectedRooms.length} · Беседка входит в проживание`, 54, 1860);
  context.textAlign = "right";
  context.fillText("Green Pine Burabay", 1026, 1860);
  context.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Image export failed"));
    }, "image/png", 0.96);
  });
}

async function createSocialPriceRoomImageBlob({
  checkIn,
  checkOut,
  description,
  groupPeriodTotals = true,
  includePhoto = true,
  periodDiscountFrom = "",
  periodDiscountPercent = 0,
  periodDiscountTo = "",
  room
}: {
  checkIn: string;
  checkOut: string;
  description: string;
  groupPeriodTotals?: boolean;
  includePhoto?: boolean;
  periodDiscountFrom?: string;
  periodDiscountPercent?: number;
  periodDiscountTo?: string;
  room: Room;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");

  context.fillStyle = "#f4f7f4";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#0f765f";
  context.font = "800 30px Arial, sans-serif";
  context.fillText(getSocialPricePeriodText(checkIn, checkOut), 54, 76);

  const photoPath = includePhoto ? getMainPhotoPath(room) : "";
  const photoY = 112;
  const photoHeight = 930;
  if (photoPath) {
    try {
      await drawPdfImage(context, photoPath, 54, photoY, 972, photoHeight, 34);
    } catch (error) {
      console.error("[GPB] Story photo failed", error);
      drawRoundRect(context, 54, photoY, 972, 420, 34, "#ffffff");
      context.fillStyle = "#64707d";
      context.font = "700 32px Arial, sans-serif";
      context.fillText("Фото не удалось загрузить", 104, photoY + 218);
    }
  } else {
    drawRoundRect(context, 54, photoY, 972, 420, 34, "#ffffff");
    context.fillStyle = "#64707d";
    context.font = "700 32px Arial, sans-serif";
    context.fillText("Фото не загружено", 104, photoY + 218);
  }

  const textY = photoPath ? photoY + photoHeight + 40 : photoY + 478;
  const blockHeight = 1814 - textY;
  let cursorY = textY + 62;
  context.fillStyle = "#16202a";
  context.font = "800 40px Arial, sans-serif";
  context.fillText(getSocialPriceObjectTitle(room), 96, cursorY);
  cursorY += 54;

  context.fillStyle = "#506170";
  context.font = "700 26px Arial, sans-serif";
  const descriptionLines = [
    ...getSocialPriceCardDescriptionLines(room, checkIn, checkOut),
    description.trim()
  ].filter(Boolean).flatMap((line) => wrapCanvasText(context, line, 870)).slice(0, photoPath ? 11 : 18);
  descriptionLines.forEach((line) => {
    context.fillText(line, 96, cursorY);
    cursorY += 36;
  });

  const priceRows = getSocialPricePriceRows(room, checkIn, checkOut, groupPeriodTotals, periodDiscountPercent, periodDiscountFrom, periodDiscountTo).slice(0, 4);
  const priceStartY = textY + blockHeight - 58 - (priceRows.length - 1) * 42;
  priceRows.forEach((row, index) => {
    const isPrimary = row.tone === "primary";
    context.fillStyle = isPrimary ? "#0f765f" : "#596675";
    context.font = `${isPrimary ? "900" : "700"} ${isPrimary ? 44 : 25}px Arial, sans-serif`;
    const label = row.label ? `${row.label}: ${row.value}` : row.value;
    context.fillText(fitCanvasText(context, label, 870), 96, priceStartY + index * 42);
  });

  drawRoundRect(context, 54, 1830, 972, 46, 23, "#e2f3ed");
  context.fillStyle = "#0f765f";
  context.font = "800 22px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("Green Pine Burabay", 540, 1860);
  context.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Image export failed"));
    }, "image/png", 0.96);
  });
}

async function createZipBlob(files: Array<{ name: string; blob: Blob }>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const fileName = encoder.encode(file.name);
    const data = new Uint8Array(await file.blob.arrayBuffer());
    const crc = calculateCrc32(data);
    const localHeader = new Uint8Array(30 + fileName.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, fileName.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(fileName, 30);
    chunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, fileName.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(fileName, 46);
    centralChunks.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(...centralChunks);

  const endHeader = new Uint8Array(22);
  const endView = new DataView(endHeader.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);
  chunks.push(endHeader);

  return new Blob(chunks, { type: "application/zip" });
}

function calculateCrc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function createMenuPdfFile(menuItems: MenuItem[]) {
  const pageWidth = 780;
  const pageHeight = 1200;
  const margin = 36;
  const pages: HTMLCanvasElement[] = [];
  let canvas = createPdfCanvas(pageWidth, pageHeight);
  let context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");
  let y = drawMenuPdfHeader(context, pageWidth);

  function pushPage() {
    pages.push(canvas);
    canvas = createPdfCanvas(pageWidth, pageHeight);
    context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    y = drawMenuPdfSmallHeader(context);
  }

  for (const item of menuItems) {
    const cardHeight = 220;
    if (y + cardHeight > pageHeight - margin) pushPage();
    y = await drawMenuPdfCard(context, item, y, pageWidth, cardHeight);
  }

  pages.push(canvas);
  const pdf = new jsPDF({ unit: "px", format: [pageWidth, pageHeight], orientation: "portrait" });
  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage([pageWidth, pageHeight], "portrait");
    pdf.addImage(page.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, pageWidth, pageHeight);
  });

  return new File([pdf.output("blob")], `menu-${formatDateInput(new Date())}.pdf`, { type: "application/pdf" });
}

function drawMenuPdfHeader(context: CanvasRenderingContext2D, pageWidth: number) {
  drawRoundRect(context, 28, 28, pageWidth - 56, 150, 28, "#0f6b57");
  context.fillStyle = "#ffffff";
  context.font = "700 44px Arial";
  context.fillText("Меню", 60, 88);
  context.font = "500 22px Arial";
  context.fillText("Кухня Green Pine Burabay", 60, 128);
  return 216;
}

function drawMenuPdfSmallHeader(context: CanvasRenderingContext2D) {
  context.fillStyle = "#f4f6f7";
  context.fillRect(0, 0, 780, 72);
  context.fillStyle = "#16202a";
  context.font = "700 24px Arial";
  context.fillText("Меню", 40, 46);
  return 92;
}

async function drawMenuPdfCard(context: CanvasRenderingContext2D, item: MenuItem, y: number, pageWidth: number, height: number) {
  const x = 28;
  const width = pageWidth - 56;
  drawPdfShadow(context, x, y, width, height, 24);
  drawRoundRect(context, x, y, width, height, 24, "#ffffff");

  const imageSize = 168;
  const imageX = x + 18;
  const imageY = y + 26;
  if (item.photoPath) {
    await drawPdfImage(context, item.photoPath, imageX, imageY, imageSize, imageSize, 18);
  } else {
    drawRoundRect(context, imageX, imageY, imageSize, imageSize, 18, "#e8f5ef");
    context.fillStyle = "#0f7a63";
    context.font = "700 56px Arial";
    context.fillText("М", imageX + 58, imageY + 106);
  }

  const textX = imageX + imageSize + 24;
  const textWidth = width - imageSize - 78;
  context.fillStyle = "#16202a";
  context.font = "700 28px Arial";
  const titleLines = wrapCanvasText(context, item.title, textWidth - 190);
  const visibleTitleLines = titleLines.length > 2
    ? titleLines.slice(0, 2).map((line, index) => index === 1 ? fitCanvasText(context, line, textWidth - 190) : line)
    : titleLines;
  visibleTitleLines.forEach((line, index) => context.fillText(line, textX, y + 50 + index * 31));

  context.fillStyle = "#0f6b57";
  context.font = "700 26px Arial";
  const priceText = formatPrice(item.price);
  context.fillText(priceText, x + width - 28 - context.measureText(priceText).width, y + 58);

  context.fillStyle = "#5d6875";
  context.font = "700 18px Arial";
  const meta = item.cookingTime.trim() ? `Время приготовления: ${item.cookingTime.trim()}` : "Время приготовления уточняйте";
  const detailsY = y + 91 + Math.max(0, visibleTitleLines.length - 1) * 25;
  context.fillText(fitCanvasText(context, meta, textWidth), textX, detailsY);

  context.fillStyle = "#25313d";
  context.font = "500 18px Arial";
  const composition = item.composition.trim() ? `Состав: ${item.composition.trim()}` : "Состав уточняйте";
  const lines = wrapCanvasText(context, composition, textWidth).slice(0, 4);
  lines.forEach((line, index) => context.fillText(line, textX, detailsY + 33 + index * 24));
  return y + height + 22;
}

async function createPriceProposalPdfFile({
  availabilitySummary,
  checkIn,
  checkInTime,
  checkOut,
  checkOutTime,
  discountPercent,
  galleryPhotoPaths = [],
  galleryVideoPaths = [],
  freeRoomIds = [],
  giftText,
  groupPeriodTotals = true,
  includeGallery = false,
  linkIds = [],
  linkMethods = {},
  minRooms,
  mode = "available",
  reservation,
  rooms,
  summaryOptions = DEFAULT_PRICE_PDF_SUMMARY_OPTIONS
}: {
  availabilitySummary?: CatalogAvailabilitySummary;
  checkIn: string;
  checkInTime: string;
  checkOut: string;
  checkOutTime: string;
  discountPercent: number;
  galleryPhotoPaths?: string[];
  galleryVideoPaths?: string[];
  freeRoomIds?: string[];
  giftText: string;
  groupPeriodTotals?: boolean;
  includeGallery?: boolean;
  linkIds?: string[];
  linkMethods?: Record<string, string>;
  minRooms: number;
  mode?: "available" | "booking";
  reservation?: Reservation | null;
  rooms: Room[];
  summaryOptions?: PricePdfSummaryOptionKey[];
}) {
  const pageWidth = 780;
  const pageHeight = 1200;
  const margin = 36;
  const pages: HTMLCanvasElement[] = [];
  let canvas = createPdfCanvas(pageWidth, pageHeight);
  let context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");
  let y = drawPdfHeader(context, { checkIn, checkOut, mode, pageWidth, rooms });

  function pushPage() {
    pages.push(canvas);
    canvas = createPdfCanvas(pageWidth, pageHeight);
    context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    y = drawPdfSmallHeader(context, { checkIn, mode, pageWidth });
  }

  const guestRooms = rooms.filter((room) => room.category !== "amenity");
  const amenities = rooms.filter((room) => room.category === "amenity");
  const packageEnabled = discountPercent > 0 || giftText || (minRooms > 0 && guestRooms.length >= minRooms);
  const freeRoomIdSet = new Set(freeRoomIds);
  y = drawPdfOfferSummary(context, {
    availabilitySummary,
    checkIn,
    checkOut,
    discountPercent,
    freeRoomIdSet,
    linkIds,
    linkMethods,
    mode,
    reservation,
    rooms,
    summaryOptions,
    y,
    pageWidth
  });

  const pdfGalleryPhotoPaths = includeGallery ? galleryPhotoPaths.filter(Boolean) : [];
  const pdfGalleryVideoCount = includeGallery ? galleryVideoPaths.filter(Boolean).length : 0;
  async function drawGalleryPhoto(path: string, title: string) {
    const minGalleryHeight = 820;
    if (y + minGalleryHeight > pageHeight - margin) pushPage();
    const galleryHeight = Math.max(minGalleryHeight, pageHeight - y - 28);
    y = await drawPdfGalleryImageCard(context, path, title, y, pageWidth, galleryHeight);
  }

  if (pdfGalleryPhotoPaths[0]) {
    await drawGalleryPhoto(pdfGalleryPhotoPaths[0], "Галерея объекта");
  } else if (pdfGalleryVideoCount > 0) {
    y = drawPdfInfoBlock(context, "Галерея объекта", [`Видео объекта: ${pdfGalleryVideoCount}`], y, pageWidth);
  }

  if (packageEnabled) {
    const packageLines = [
      discountPercent > 0 ? `Скидка при аренде всех номеров: ${discountPercent}%` : "",
      giftText,
      minRooms > 0 ? `Условие действует от ${minRooms} номеров.` : ""
    ].filter(Boolean);
    y = drawPdfInfoBlock(context, "Пакетное предложение", packageLines, y, pageWidth);
  }

  if (guestRooms.length) {
    for (const room of guestRooms) {
      const cardHeight = estimatePdfRoomCardHeight(room, reservation);
      if (y + cardHeight > pageHeight - margin) pushPage();
      y = await drawPdfRoomCard(context, room, { checkIn, checkInTime, checkOut, checkOutTime, freePrice: freeRoomIdSet.has(room.id), groupPeriodTotals, pageHeight, reservation, y, pageWidth });
    }
  }

  if (amenities.length) {
    for (const room of amenities) {
      const cardHeight = estimatePdfRoomCardHeight(room, reservation);
      if (y + cardHeight > pageHeight - margin) pushPage();
      y = await drawPdfRoomCard(context, room, { checkIn, checkInTime, checkOut, checkOutTime, freePrice: freeRoomIdSet.has(room.id), groupPeriodTotals, pageHeight, reservation, y, pageWidth });
    }
  }

  if (pdfGalleryPhotoPaths.length > 1) {
    for (const [index, path] of pdfGalleryPhotoPaths.slice(1).entries()) {
      await drawGalleryPhoto(path, `Галерея объекта ${index + 2}`);
    }
  }

  pages.push(canvas);
  const pdf = new jsPDF({ unit: "px", format: [pageWidth, pageHeight], orientation: "portrait" });
  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage([pageWidth, pageHeight], "portrait");
    pdf.addImage(page.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, pageWidth, pageHeight);
  });

  const blob = pdf.output("blob");
  return new File([blob], `price-${checkIn || "proposal"}.pdf`, { type: "application/pdf" });
}

function drawPdfOfferSummary(
  context: CanvasRenderingContext2D,
  {
    availabilitySummary,
    checkIn,
    checkOut,
    discountPercent,
    freeRoomIdSet,
    linkIds,
    linkMethods,
    mode,
    reservation,
    rooms,
    summaryOptions,
    y,
    pageWidth
  }: {
    availabilitySummary?: CatalogAvailabilitySummary;
    checkIn: string;
    checkOut: string;
    discountPercent: number;
    freeRoomIdSet: Set<string>;
    linkIds: string[];
    linkMethods: Record<string, string>;
    mode: "available" | "booking";
    reservation?: Reservation | null;
    rooms: Room[];
    summaryOptions: PricePdfSummaryOptionKey[];
    y: number;
    pageWidth: number;
  }
) {
  const summaryPriceRooms = mode === "available" ? rooms.filter(isStayBookingObject) : rooms;
  const subtotal = reservation?.subtotal ?? summaryPriceRooms.reduce((sum, room) => freeRoomIdSet.has(room.id) ? sum : sum + calculateRoomStayPrice(room, checkIn, checkOut), 0);
  const discountAmount = reservation?.discountAmount ?? Math.round(subtotal * clampNumber(discountPercent, 0, 100) / 100);
  const total = reservation?.total ?? Math.max(0, subtotal - discountAmount);
  const prepayment = reservation?.prepayment ?? Math.round(total * 0.5);
  const roomCount = rooms.filter((room) => room.category !== "amenity").length;
  const extraInventoryLines = reservation ? formatPdfExtraInventorySummaryLines(reservation, rooms) : [];
  const sleepingPlacesTotal = reservation
    ? calculateReservationSleepingPlacesTotal(reservation, rooms)
    : calculatePricePdfSleepingPlacesTotal(rooms, availabilitySummary);
  const selectedSummaryOptions = new Set(summaryOptions.length ? summaryOptions : DEFAULT_PRICE_PDF_SUMMARY_OPTIONS);
  const selectedLinkLines = buildSettingMethodList(LINK_METHODS, linkMethods)
    .filter((method) => linkIds.includes(method.id) && linkMethods[method.id]?.trim())
    .map((method) => `${method.label}: ${linkMethods[method.id].trim()}`);
  const lines = [
    selectedSummaryOptions.has("period") ? `Период: ${formatKazakhDate(checkIn)} - ${formatKazakhDate(checkOut)}` : "",
    selectedSummaryOptions.has("rooms") ? mode === "booking" ? `Бронируется на согласование: ${roomCount} номеров` : `Доступные номера: ${availabilitySummary?.rooms ?? roomCount}` : "",
    selectedSummaryOptions.has("saunas") && availabilitySummary ? `Сауна: ${availabilitySummary.saunas}` : "",
    selectedSummaryOptions.has("airBeds") && availabilitySummary ? `Надувные матрасы: ${availabilitySummary.airBeds}` : "",
    selectedSummaryOptions.has("rollaways") && availabilitySummary ? `Раскладушки: ${availabilitySummary.rollaways}` : "",
    ...extraInventoryLines,
    reservation && reservation.breakfastIncluded !== undefined ? `Питание: ${reservation.breakfastIncluded === false ? "без завтрака" : "завтрак включен"}` : "",
    reservation?.breakfastIncluded === false && reservation.breakfastDiscountAmount ? `Без завтрака: -${formatPrice(reservation.breakfastDiscountAmount)}` : "",
    selectedSummaryOptions.has("sleepingPlaces") && sleepingPlacesTotal > 0 ? `Всего спальных мест: ${sleepingPlacesTotal}` : "",
    selectedSummaryOptions.has("subtotal") ? `Стоимость до скидки: ${formatPrice(subtotal)}` : "",
    selectedSummaryOptions.has("discount") && discountPercent > 0 ? `Скидка: ${discountPercent}% (-${formatPrice(discountAmount)})` : "",
    selectedSummaryOptions.has("total") ? `Итого: ${formatPrice(total)}` : "",
    selectedSummaryOptions.has("prepayment") ? `Предоплата 50%: ${formatPrice(prepayment)}` : "",
    ...selectedLinkLines,
    selectedSummaryOptions.has("conditions") ? "Бронь закрепляется после предоплаты. При отмене или незаезде предоплата не возвращается." : ""
  ].filter(Boolean);

  return drawPdfInfoBlock(context, mode === "booking" ? "Сводка бронирования" : "Сводка предложения", lines, y, pageWidth);
}

function createPdfCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#f4f6f7";
    context.fillRect(0, 0, width, height);
  }
  return canvas;
}

function drawPdfHeader(context: CanvasRenderingContext2D, { checkIn, checkOut, mode, pageWidth, rooms }: { checkIn: string; checkOut: string; mode: "available" | "booking"; pageWidth: number; rooms: Room[] }) {
  drawRoundRect(context, 28, 28, pageWidth - 56, 178, 28, "#0f6b57");
  context.fillStyle = "#ffffff";
  context.font = "700 40px Arial";
  context.fillText(mode === "booking" ? "Бронь на согласование" : "Предложение", 60, 84);
  context.font = "500 23px Arial";
  context.fillText(`${formatKazakhDate(checkIn)} - ${formatKazakhDate(checkOut)}`, 60, 128);
  context.font = "500 20px Arial";
  context.fillText(`${mode === "booking" ? "Бронируется" : "Свободно"}: ${rooms.filter((room) => room.category !== "amenity").length} номеров`, 60, 166);
  return 244;
}

function drawPdfSmallHeader(context: CanvasRenderingContext2D, { checkIn, mode, pageWidth }: { checkIn: string; mode: "available" | "booking"; pageWidth: number }) {
  context.fillStyle = "#f4f6f7";
  context.fillRect(0, 0, pageWidth, 72);
  context.fillStyle = "#16202a";
  context.font = "700 22px Arial";
  context.fillText(`${mode === "booking" ? "Бронь на согласование" : "Предложение"} на ${formatKazakhDate(checkIn)}`, 40, 46);
  return 84;
}

async function drawPdfGalleryImageCard(context: CanvasRenderingContext2D, path: string, title: string, y: number, pageWidth: number, height: number) {
  const x = 28;
  const width = pageWidth - 56;
  drawPdfShadow(context, x, y, width, height, 28);
  drawRoundRect(context, x, y, width, height, 28, "#ffffff");
  context.fillStyle = "#16202a";
  context.font = "700 24px Arial";
  context.fillText(title, x + 28, y + 42);
  await drawPdfImage(context, path, x + 18, y + 64, width - 36, height - 88, 22);
  return y + height + 28;
}

function drawPdfInfoBlock(context: CanvasRenderingContext2D, title: string, lines: string[], y: number, pageWidth: number) {
  const wrappedLines = lines.flatMap((line) => wrapCanvasText(context, line, pageWidth - 112));
  const height = 74 + wrappedLines.length * 26;
  drawRoundRect(context, 36, y, pageWidth - 72, height, 18, "#fff8e8");
  context.fillStyle = "#7a5b14";
  context.font = "700 24px Arial";
  context.fillText(title, 60, y + 38);
  context.fillStyle = "#25313d";
  context.font = "500 19px Arial";
  wrappedLines.forEach((line, index) => context.fillText(line, 60, y + 76 + index * 26));
  return y + height + 22;
}

function drawPdfSectionTitle(context: CanvasRenderingContext2D, title: string, y: number) {
  context.fillStyle = "#16202a";
  context.font = "700 28px Arial";
  context.fillText(title, 36, y);
  return y + 24;
}

function estimatePdfRoomCardHeight(room: Room, reservation?: Reservation | null, checkIn = getDefaultCheckInDate(), checkOut = formatDateInput(addDays(parseDateInput(getDefaultCheckInDate()), 1)), groupPeriodTotals = true) {
  const textLines = buildPdfRoomPreview(room, DEFAULT_CHECK_IN_TIME, DEFAULT_CHECK_OUT_TIME, checkIn, checkOut, false, reservation, groupPeriodTotals).split("\n").length;
  return Math.max(820, 380 + textLines * 29);
}

function buildPdfRoomPreview(room: Room, checkInTime: string, checkOutTime: string, priceDate: string, checkOut: string, freePrice: boolean, reservation?: Reservation | null, groupPeriodTotals = true) {
  const basePreview = buildWhatsAppPreview(room, checkInTime, checkOutTime, priceDate);
  const preview = reservation?.breakfastIncluded === false
    ? basePreview
      .split("\n")
      .filter((line) => !line.startsWith("Питание:"))
      .concat("Питание: без завтрака")
      .join("\n")
    : basePreview;
  const priceLines = reservation ? [] : getPriceProposalRoomPriceLines(room, priceDate, checkOut, groupPeriodTotals);
  const roomExtraInventory = reservation ? formatPdfRoomExtraInventoryLines(reservation.extraInventoryByRoomId?.[room.id]) : "";
  const roomPlacesTotal = reservation ? calculateRoomReservationSleepingPlacesTotal(room, reservation.extraInventoryByRoomId?.[room.id]) : 0;
  const previewLines = preview.split("\n");
  const priceStartIndex = previewLines.findIndex((line) => /^Цена|^Будни|^Выходные|^Праздники/.test(line));
  const previewWithPrice = priceLines.length && priceStartIndex >= 0
    ? previewLines.slice(0, priceStartIndex).concat(priceLines).join("\n")
    : preview;
  const previewWithInventory = [
    previewWithPrice,
    roomExtraInventory,
    roomPlacesTotal > 0 ? `Всего мест: ${roomPlacesTotal}` : ""
  ].filter(Boolean).join("\n");
  if (!freePrice) return previewWithInventory;

  const lines = previewWithInventory.split("\n");
  const priceIndex = lines.findIndex((line) => /^Цена|^Будни|^Выходные|^Праздники/.test(line));
  if (priceIndex === -1) {
    return `${preview}\nЦена: бесплатно в составе предложения`;
  }

  return lines
    .slice(0, priceIndex)
    .concat("Цена: бесплатно в составе предложения")
    .join("\n");
}

function getPdfRoomCardTextBlockHeight(lines: string[]) {
  const lineHeight = 25;
  const titleExtra = lines.length ? 4 : 0;
  return 78 + lines.length * lineHeight + titleExtra;
}

function formatPdfRoomExtraInventoryLines(item?: { airBeds?: number; rollaways?: number }) {
  const lines = [
    item?.airBeds ? `- Надувной матрас: ${item.airBeds} / Мест: ${item.airBeds}` : "",
    item?.rollaways ? `- Раскладушка: ${item.rollaways} / Мест: ${item.rollaways}` : ""
  ].filter(Boolean);
  return lines.length ? `Допместа:\n${lines.join("\n")}` : "";
}

function formatPdfExtraInventorySummaryLines(reservation: Reservation, rooms: Room[]) {
  const counts = getReservationExtraInventoryCounts(reservation);
  const unitPrice = getExtraPlaceUnitPrice(rooms);
  const nights = getNightsCount(reservation.checkIn, reservation.checkOut);
  return [
    counts.airBeds ? `Надувной матрас: ${counts.airBeds} (+${formatPrice(counts.airBeds * unitPrice * nights)})` : "",
    counts.rollaways ? `Раскладушка: ${counts.rollaways} (+${formatPrice(counts.rollaways * unitPrice * nights)})` : ""
  ].filter(Boolean);
}

async function drawPdfRoomCard(
  context: CanvasRenderingContext2D,
  room: Room,
  {
    checkIn,
    checkInTime,
    checkOut,
    checkOutTime,
    freePrice,
    groupPeriodTotals,
    pageHeight,
    pageWidth,
    reservation,
    y
  }: { checkIn: string; checkInTime: string; checkOut: string; checkOutTime: string; freePrice?: boolean; groupPeriodTotals?: boolean; pageHeight: number; pageWidth: number; reservation?: Reservation | null; y: number }
) {
  const x = 28;
  const width = pageWidth - 56;
  const text = buildPdfRoomPreview(room, checkInTime, checkOutTime, checkIn, checkOut, Boolean(freePrice), reservation, groupPeriodTotals);
  context.font = "500 19px Arial";
  const textX = x + 32;
  const lines = text.split("\n").flatMap((line) => wrapCanvasText(context, line, width - 64));
  const height = Math.max(estimatePdfRoomCardHeight(room, reservation, checkIn, checkOut, groupPeriodTotals), pageHeight - y - 28);
  const textBlockHeight = getPdfRoomCardTextBlockHeight(lines);
  const imageX = x + 18;
  const imageY = y + 18;
  const imageWidth = width - 36;
  const mainPhoto = getMainPhotoPath(room);
  const imageHeight = mainPhoto ? Math.max(210, height - textBlockHeight - 18) : 0;
  const textStartY = y + height - textBlockHeight + 38;

  drawPdfShadow(context, x, y, width, height, 28);
  drawRoundRect(context, x, y, width, height, 28, "#ffffff");
  if (mainPhoto) {
    await drawPdfImage(context, mainPhoto, imageX, imageY, imageWidth, imageHeight, 24);
  }

  context.fillStyle = "#ffffff";
  context.fillRect(x + 18, imageY + imageHeight, imageWidth, height - imageHeight - 18);
  let cursorY = textStartY;
  lines.forEach((line, index) => {
    const isPrice = /^Цена|^Будни|^Выходные|^Праздники/.test(line);
    const isSection = /^Допместа/.test(line);
    context.fillStyle = index === 0 ? "#16202a" : isPrice ? "#0f6b57" : "#25313d";
    context.font = index === 0 ? "700 26px Arial" : isPrice || isSection ? "700 21px Arial" : "500 19px Arial";
    context.fillText(line, textX, cursorY);
    cursorY += index === 0 ? 29 : 25;
  });

  return y + height + 28;
}

async function drawPdfImage(context: CanvasRenderingContext2D, path: string, x: number, y: number, width: number, height: number, radius = 0) {
  try {
    const { image, objectUrl } = await loadPdfImage(path);
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, width, height);
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.save();
    context.beginPath();
    drawRoundRectPath(context, x, y, width, height, radius);
    context.clip();
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
    URL.revokeObjectURL(objectUrl);
  } catch {
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, width, height);
    context.fillStyle = "#64707d";
    context.font = "500 20px Arial";
    context.fillText("Фото недоступно", x + 24, y + height / 2);
  }
}

function loadPdfImage(path: string) {
  return new Promise<{ image: HTMLImageElement; objectUrl: string }>(async (resolve, reject) => {
    let objectUrl = "";
    try {
      const response = await fetch(getMediaUrl(path));
      if (!response.ok) {
        reject(new Error(`Image fetch failed: ${response.status}`));
        return;
      }

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
    } catch (error) {
      reject(error);
      return;
    }

    const image = new window.Image();
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image load failed"));
    };
    image.src = objectUrl;
  });
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (context.measureText(nextLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function fitCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  let nextText = text;
  while (nextText.length > 1 && context.measureText(`${nextText}...`).width > maxWidth) {
    nextText = nextText.slice(0, -1);
  }
  return `${nextText.trimEnd()}...`;
}

function drawRoundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  context.fillStyle = color;
  drawRoundRectPath(context, x, y, width, height, radius);
  context.fill();
}

function drawPdfShadow(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.save();
  context.shadowColor = "rgba(22, 32, 42, 0.12)";
  context.shadowBlur = 26;
  context.shadowOffsetY = 10;
  drawRoundRect(context, x, y, width, height, radius, "#ffffff");
  context.restore();
}

function drawRoundRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

async function sendRoomToActiveWhatsAppChat(room: Room, checkInTime = DEFAULT_CHECK_IN_TIME, checkOutTime = DEFAULT_CHECK_OUT_TIME, priceDate?: string) {
  const message = buildWhatsAppPreview(room, checkInTime, checkOutTime, priceDate);
  const firstPhoto = getMainPhotoPath(room);

  if (firstPhoto) {
    const photoFile = await createFileFromMediaPath(firstPhoto);
    return sendImageFileToActiveWhatsAppChat(photoFile, message);
  }

  return sendTextToActiveWhatsAppChat(message);
}

async function sendRoomPhotosToActiveWhatsAppChat(room: Room, checkInTime = DEFAULT_CHECK_IN_TIME, checkOutTime = DEFAULT_CHECK_OUT_TIME, priceDate?: string) {
  const message = buildWhatsAppPreview(room, checkInTime, checkOutTime, priceDate);
  const photoPaths = getOrderedPhotoPathsForSending(room);
  const photoFiles = await Promise.all(photoPaths.map((path) => createFileFromMediaPath(path)));

  if (!photoFiles.length) {
    return sendTextToActiveWhatsAppChat(message);
  }

  if (photoFiles.length === 1) {
    return sendImageFileToActiveWhatsAppChat(photoFiles[0], message);
  }

  const extraPhotoFiles = photoFiles.slice(1);
  const extraPhotosSent = extraPhotoFiles.length > 1
    ? await sendMediaFilesToActiveWhatsAppChat(extraPhotoFiles, "")
    : await sendImageFileToActiveWhatsAppChat(extraPhotoFiles[0], "");
  if (!extraPhotosSent) {
    return false;
  }

  await waitForElement(findWhatsAppMessageInput, 8000);
  await waitForDelay(1600);
  return sendImageFileToActiveWhatsAppChat(photoFiles[0], message);
}

async function sendRoomVideoToActiveWhatsAppChat(room: Room) {
  const firstVideo = room.videoPaths[0];
  if (!firstVideo) {
    return false;
  }

  const videoFile = await createRawMediaFileFromPath(firstVideo);
  const caption = shouldShowObjectNumber(room)
    ? `Видео: ${room.number ? `${getObjectTypeLabel(room)} ${room.number}` : getObjectTypeLabel(room)}\n${room.title}`
    : room.title || getObjectTypeLabel(room);
  return sendImageFileToActiveWhatsAppChat(videoFile, caption);
}

async function sendFileToActiveWhatsAppChat(file: File, caption: string) {
  return sendMediaFilesToActiveWhatsAppChat([file], caption);
}

async function sendMediaFilesThroughAttachmentToActiveWhatsAppChat(files: File[], caption: string) {
  try {
    const mediaInput = await findWhatsAppMediaInput();
    if (!mediaInput) {
      return false;
    }

    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    mediaInput.files = dataTransfer.files;
    mediaInput.dispatchEvent(new Event("input", { bubbles: true }));
    mediaInput.dispatchEvent(new Event("change", { bubbles: true }));

    const captionInput = await waitForElement(findWhatsAppMediaCaptionInput, 6000);
    if (!captionInput) {
      return false;
    }

    if (caption) {
      captionInput.focus();
      clearWhatsAppInput(captionInput);
      await pasteTextIntoWhatsAppInput(captionInput, caption);
    }

    const sendButton = await waitForElement(findWhatsAppSendButton, 6000);
    if (!sendButton) {
      return false;
    }

    sendButton.click();
    await waitForMediaPreviewClose(captionInput, 9000);
    await waitForElement(findWhatsAppMessageInput, 9000);
    await waitForDelay(1200);
    return true;
  } catch {
    return false;
  }
}

async function sendMediaFilesToActiveWhatsAppChat(files: File[], caption: string) {
  try {
    const chatInput = findWhatsAppMessageInput();
    if (!chatInput) {
      return false;
    }

    chatInput.focus();
    const pasted = pasteFilesIntoWhatsAppInput(chatInput, files);
    if (!pasted) {
      return false;
    }

    const captionInput = await waitForElement(findWhatsAppMediaCaptionInput, 6000);
    if (!captionInput) {
      return false;
    }

    if (caption) {
      captionInput.focus();
      clearWhatsAppInput(captionInput);
      await pasteTextIntoWhatsAppInput(captionInput, caption);
    }

    const sendButton = await waitForElement(findWhatsAppSendButton, 6000);
    if (!sendButton) {
      return false;
    }

    sendButton.click();
    await waitForMediaPreviewClose(captionInput, 9000);
    await waitForElement(findWhatsAppMessageInput, 9000);
    await waitForDelay(1200);
    return true;
  } catch {
    return false;
  }
}

async function sendImageFileToActiveWhatsAppChat(file: File, caption: string) {
  try {
    const chatInput = findWhatsAppMessageInput();
    if (!chatInput) {
      return false;
    }

    chatInput.focus();
    const pasted = pasteFileIntoWhatsAppInput(chatInput, file);
    if (!pasted) {
      return false;
    }

    const captionInput = await waitForElement(findWhatsAppMediaCaptionInput, 6000);
    if (!captionInput) {
      return false;
    }

    if (caption) {
      captionInput.focus();
      clearWhatsAppInput(captionInput);
      await pasteTextIntoWhatsAppInput(captionInput, caption);
    }

    const sendButton = await waitForElement(findWhatsAppSendButton, 6000);
    if (!sendButton) {
      return false;
    }

    sendButton.click();
    await waitForMediaPreviewClose(captionInput, 9000);
    await waitForElement(findWhatsAppMessageInput, 9000);
    await waitForDelay(1200);
    return true;
  } catch {
    return false;
  }
}

async function createFileFromMediaPath(path: string) {
  const response = await fetch(getMediaUrl(path));
  if (!response.ok) {
    throw new Error(`Media fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  const jpegBlob = blob.type === "image/jpeg" ? blob : await convertImageBlobToJpeg(blob);
  return new File([jpegBlob], getMediaFileName(path), { type: "image/jpeg" });
}

async function createRawMediaFileFromPath(path: string) {
  const compatiblePath = await ensureWhatsappVideoMedia(path);
  const response = await fetch(getMediaUrl(compatiblePath));
  if (!response.ok) {
    throw new Error(`Media fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  return new File([blob], getRawMediaFileName(compatiblePath, blob.type), { type: blob.type || "video/mp4" });
}

function getMediaFileName(path: string) {
  const cleanName = decodeURIComponent(path.split("/").pop()?.split("?")[0] || "room-photo.jpg");
  return cleanName.replace(/\.(jpe?g|png|webp|heic|heif|hec)$/i, "") + ".jpg";
}

function getRawMediaFileName(path: string, mimeType: string) {
  const cleanName = decodeURIComponent(path.split("/").pop()?.split("?")[0] || "room-video.mp4");
  if (/\.[a-z0-9]+$/i.test(cleanName)) {
    return cleanName;
  }

  return mimeType === "video/quicktime" ? `${cleanName}.mov` : `${cleanName}.mp4`;
}

function convertImageBlobToJpeg(blob: Blob) {
  return new Promise<Blob>((resolve, reject) => {
    const image = new window.Image();
    const objectUrl = URL.createObjectURL(blob);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Canvas context unavailable"));
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      canvas.toBlob((jpegBlob) => {
        URL.revokeObjectURL(objectUrl);
        if (jpegBlob) {
          resolve(jpegBlob);
        } else {
          reject(new Error("JPEG conversion failed"));
        }
      }, "image/jpeg", 0.92);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image load failed"));
    };

    image.src = objectUrl;
  });
}

async function sendTextToActiveWhatsAppChat(message: string) {
  const input = findWhatsAppMessageInput();
  if (!input) {
    return false;
  }

  input.focus();
  clearWhatsAppInput(input);
  await waitForDelay(80);
  if ((input.innerText || input.textContent || "").trim()) {
    clearWhatsAppInput(input);
    await waitForDelay(80);
  }
  await pasteTextIntoWhatsAppInput(input, message);
  await waitForDelay(120);

  const sendButton = findWhatsAppSendButton();
  if (sendButton) {
    sendButton.click();
    await waitForDelay(650);
    return true;
  }

  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", code: "Enter" }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Enter", code: "Enter" }));
  await waitForDelay(650);
  return true;
}

async function insertTextIntoActiveWhatsAppChat(message: string) {
  const input = findWhatsAppMessageInput();
  if (!input) {
    return false;
  }

  input.focus();
  clearWhatsAppInput(input);
  await waitForDelay(80);
  if ((input.innerText || input.textContent || "").trim()) {
    clearWhatsAppInput(input);
    await waitForDelay(80);
  }
  await pasteTextIntoWhatsAppInput(input, message);
  await waitForDelay(120);
  input.focus();
  return true;
}

function clearWhatsAppInput(input: HTMLElement) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.execCommand("delete", false);
}

async function pasteTextIntoWhatsAppInput(input: HTMLElement, message: string) {
  const clipboardEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: new DataTransfer()
  });
  clipboardEvent.clipboardData?.setData("text/plain", message);

  const handled = !input.dispatchEvent(clipboardEvent);
  if (!handled && input.textContent !== message) {
    document.execCommand("insertText", false, message);
  }
}

function pasteFileIntoWhatsAppInput(input: HTMLElement, file: File) {
  return pasteFilesIntoWhatsAppInput(input, [file]);
}

function pasteFilesIntoWhatsAppInput(input: HTMLElement, files: File[]) {
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  const clipboardEvent = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer
  });

  return !input.dispatchEvent(clipboardEvent);
}

function waitForDelay(delayMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function waitForMediaPreviewClose(captionInput: HTMLElement, timeoutMs: number) {
  return new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      if (!document.body.contains(captionInput) || !isVisibleElement(captionInput)) {
        window.clearInterval(intervalId);
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(intervalId);
        resolve();
      }
    }, 120);
  });
}

function findWhatsAppMessageInput() {
  const footerInputs = Array.from(document.querySelectorAll<HTMLElement>('footer div[contenteditable="true"], footer div[role="textbox"][contenteditable="true"]'));
  const visibleFooterInput = footerInputs.reverse().find((element) => isVisibleElement(element));
  if (visibleFooterInput) {
    return visibleFooterInput;
  }

  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div[contenteditable="true"][role="textbox"]'));
  return candidates.reverse().find((element) => isVisibleElement(element) && !element.closest('[role="dialog"]')) ?? null;
}

function findWhatsAppMediaCaptionInput() {
  const visibleInputs = Array.from(
    document.querySelectorAll<HTMLElement>('div[contenteditable="true"], div[role="textbox"][contenteditable="true"]')
  ).filter((element) => isVisibleElement(element));

  const dialogInput = visibleInputs.find((element) => Boolean(element.closest('[role="dialog"]')));
  return dialogInput ?? visibleInputs.reverse().find((element) => !element.closest("footer")) ?? null;
}

async function findWhatsAppMediaInput() {
  const existingInput = getVisibleOrHiddenWhatsAppMediaInput();
  if (existingInput) {
    return existingInput;
  }

  const attachButton = findWhatsAppAttachButton();
  attachButton?.click();
  const openedInput = await waitForElement(getVisibleOrHiddenWhatsAppMediaInput, 1200);
  if (openedInput) {
    return openedInput;
  }

  findWhatsAppPhotoVideoAttachButton()?.click();
  return waitForElement(getVisibleOrHiddenWhatsAppMediaInput, 2500);
}

function getVisibleOrHiddenWhatsAppMediaInput() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
  const mediaInput = inputs.find((input) => isWhatsAppPhotoVideoInput(input));
  return mediaInput ?? null;
}

function isWhatsAppPhotoVideoInput(input: HTMLInputElement) {
  const accept = input.accept.toLowerCase();
  if (!accept) return false;
  if (/sticker|webp/.test(accept)) return false;
  return accept.includes("image/*") || accept.includes("image/jpeg") || accept.includes("image/png");
}

function findWhatsAppAttachButton() {
  const iconNames = ["plus", "clip", "attach-menu-plus", "attach"];
  for (const iconName of iconNames) {
    const button = document.querySelector<HTMLElement>(`button span[data-icon="${iconName}"]`)?.closest("button");
    if (button && isVisibleElement(button)) {
      return button;
    }
  }

  return Array.from(document.querySelectorAll<HTMLButtonElement>("footer button")).find((button) =>
    isVisibleElement(button) && /attach|прикреп|влож/i.test(button.getAttribute("aria-label") ?? "")
  ) ?? null;
}

function findWhatsAppPhotoVideoAttachButton() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[role="button"], button, li, div[tabindex]'));
  return candidates.find((element) =>
    isVisibleElement(element) &&
    /фото|видео|photo|video|image|изображ/i.test(element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || "")
  ) ?? null;
}

function findWhatsAppSendButton() {
  const iconButton = document.querySelector<HTMLElement>('button span[data-icon="send"]')?.closest("button");
  if (iconButton && isVisibleElement(iconButton)) {
    return iconButton;
  }

  return Array.from(document.querySelectorAll<HTMLButtonElement>("footer button")).find((button) =>
    isVisibleElement(button) && /send|отправить/i.test(button.getAttribute("aria-label") ?? "")
  ) ?? null;
}

function waitForElement<T extends HTMLElement>(finder: () => T | null, timeoutMs: number) {
  return new Promise<T | null>((resolve) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const element = finder();
      if (element) {
        window.clearInterval(intervalId);
        resolve(element);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(intervalId);
        resolve(null);
      }
    }, 120);
  });
}

function isVisibleElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getDebugText(element: HTMLElement | null | undefined) {
  if (!element) return "";
  return [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("data-testid"),
    element.innerText,
    element.textContent
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function isGpbElement(element: HTMLElement) {
  return Boolean(element.closest("#gpb-booking-extension-root, .gpb-panel, .gpb-catalog-modal, .gpb-create-modal, .gpb-crop-modal"));
}

function getWhatsAppMediaItems(room: Room) {
  const photos = room.photoPaths.map((path) => ({ path, type: "photo" as const }));
  const videos = room.videoPaths.map((path) => ({ path, type: "video" as const }));
  return [...photos, ...videos];
}

function getMainPhotoPath(room: Pick<Room, "photoPaths">) {
  return room.photoPaths[0] || "";
}

function getOrderedPhotoPathsForSending(room: Pick<Room, "photoPaths">) {
  const mainPhoto = getMainPhotoPath(room);
  if (!mainPhoto) return [];
  return [mainPhoto, ...room.photoPaths.filter((path) => path !== mainPhoto)];
}

function isHeicPath(path: string) {
  return /\.(heic|heif|hec)$/i.test(path);
}

function parseAmenities(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCustomAmenities(value: string) {
  return parseAmenities(value)
    .filter((item) => !getPresetCatalogItems().includes(item))
    .join(", ");
}

function updateCustomAmenities(
  currentAmenities: string,
  customAmenities: string,
  updateRoom: (patch: Partial<Room>) => void
) {
  const presetItems = getPresetCatalogItems();
  const selectedAmenities = parseAmenities(currentAmenities).filter((item) => presetItems.includes(item));
  const customItems = parseAmenities(customAmenities);
  updateRoom({ amenities: selectedAmenities.concat(customItems).join(", ") });
}

function getAmenityOptionsForRoom(currentAmenities: string, customAmenityOptions: string[] = getCustomAmenityOptionsFromLocal()) {
  const selectedCustomAmenities = parseAmenities(currentAmenities).filter((item) => (
    !getPresetCatalogItems().includes(item)
  ));
  return Array.from(new Set(AMENITY_OPTIONS.concat(customAmenityOptions, selectedCustomAmenities)));
}

function getFoodOptions(customFoodOptions: string[] = getCustomFoodOptionsFromLocal()) {
  return Array.from(new Set(FOOD_OPTIONS.concat(customFoodOptions)));
}

function getPresetCatalogItems() {
  return AMENITY_OPTIONS.concat(getCustomAmenityOptionsFromLocal(), FOOD_OPTIONS, getCustomFoodOptionsFromLocal());
}

function getSelectedFood(value: string) {
  const foodOptions = getFoodOptions();
  return parseAmenities(value).filter((item) => foodOptions.includes(item));
}

function getSelectedAmenities(value: string) {
  return parseAmenities(value).filter((item) => !FOOD_OPTIONS.includes(item));
}

function getVisibleAmenities(room: Pick<Room, "amenities" | "objectType">) {
  const amenities = getSelectedAmenities(room.amenities);
  if (room.objectType === "sauna") {
    return amenities.filter((item) => item !== "Полотенца");
  }

  return amenities;
}

function formatSleepingPlaces(places: SleepingPlace[]) {
  return getVisibleSleepingPlaces(places)
    .map((place) => formatSleepingPlaceWithCapacity(place))
    .join(", ");
}

function formatConfiguredExtraSleepingPlaces(places: SleepingPlace[]) {
  return getConfiguredExtraSleepingPlaces(places)
    .map((place) => formatSleepingPlaceWithCapacity(place))
    .join(", ");
}

function formatSleepingPlaceLines(places: SleepingPlace[]) {
  return getVisibleSleepingPlaces(places)
    .map((place) => `* ${formatSleepingPlaceWithCapacity(place)}`);
}

function formatReservationSleepingPlaceLines(places: SleepingPlace[]) {
  return getVisibleSleepingPlaces(places)
    .map((place) => `| ${formatSleepingPlaceWithCapacity(place).replace(" / ", " | ")}`);
}

function getVisibleSleepingPlaces(places: SleepingPlace[]) {
  return places
    .filter((place) => place.count > 0 && getSleepingPlacePlacesCount(place) > 0 && place.type !== "air-bed" && place.type !== "rollaway")
}

function getConfiguredExtraSleepingPlaces(places: SleepingPlace[]) {
  return places
    .filter((place) => place.count > 0 && getSleepingPlacePlacesCount(place) > 0 && (place.type === "air-bed" || place.type === "rollaway"));
}

function getSleepingPlaceTitle(place: Pick<SleepingPlace, "title" | "type">) {
  const optionTitle = SLEEPING_PLACE_OPTIONS.find((option) => option.value === place.type)?.title;
  return place.title || optionTitle || "Спальное место";
}

function formatSleepingPlaceWithCapacity(place: SleepingPlace) {
  const count = Math.max(0, place.count || 0);
  return `${getSleepingPlaceTitle(place)}: ${count} / Мест: ${getSleepingPlacePlacesCount(place)}`;
}
