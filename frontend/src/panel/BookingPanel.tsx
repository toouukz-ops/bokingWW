import {
  Banknote,
  BedDouble,
  CalendarDays,
  Hotel,
  Image,
  Pencil,
  MoveDown,
  MoveUp,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Trash2,
  Users,
  Video,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteRoomMedia, getHealth, getMediaUrl, getRooms, saveRoom, uploadRoomMedia } from "../shared/api";
import type { CatalogItemCategory, Room, RoomStatus } from "../shared/types";

const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
const ROOM_NUMBERS = ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "115"];
const CATALOG_DEFAULTS = [
  ...ROOM_NUMBERS.map((number) => ({
    id: createRoomId(number),
    number,
    title: `Номер ${number}`,
    category: (Number(number) <= 104 ? "staff-room" : "guest-room") as CatalogItemCategory,
    bookable: Number(number) >= 105
  })),
  {
    id: "amenity-sauna",
    number: "SAUNA",
    title: "Сауна",
    category: "amenity",
    bookable: true
  },
  {
    id: "amenity-gazebo",
    number: "GAZEBO",
    title: "Беседка",
    category: "amenity",
    bookable: true
  },
  {
    id: "amenity-bbq",
    number: "BBQ",
    title: "Мангальная зона",
    category: "amenity",
    bookable: true
  }
] as const;
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
  "Балкон",
  "Вид на горы",
  "Кухня",
  "Чайник",
  "Парковка"
];

function getMaxPanelWidth() {
  return Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.62));
}

export function BookingPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [width, setWidth] = useState(420);
  const [backendState, setBackendState] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    getHealth()
      .then(() => setBackendState("online"))
      .catch(() => setBackendState("offline"));
  }, []);

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
        <div>
          <strong>Бронирование</strong>
          <span>{statusText}</span>
        </div>
        <div className="gpb-header-actions">
          <button type="button" onClick={() => setIsCatalogOpen(true)} title="Каталог номеров">
            <Hotel size={18} />
          </button>
          <button type="button" title="Настройки">
            <Settings size={18} />
          </button>
          <button type="button" onClick={() => setIsOpen(false)} title="Свернуть панель">
            <PanelRightClose size={18} />
          </button>
        </div>
      </header>

      <section className="gpb-section">
        <div className="gpb-section-title">
          <CalendarDays size={18} />
          <span>Текущий запрос</span>
        </div>
        <div className="gpb-empty-state">Ожидаю входящее сообщение из активного чата.</div>
      </section>

      <section className="gpb-section">
        <div className="gpb-grid">
          <label>
            Заезд
            <input type="date" />
          </label>
          <label>
            Выезд
            <input type="date" />
          </label>
          <label>
            Взрослые
            <input min="1" type="number" defaultValue="1" />
          </label>
          <label>
            Дети
            <input min="0" type="number" defaultValue="0" />
          </label>
        </div>
      </section>

      <section className="gpb-section">
        <button className="gpb-primary" type="button">Проверить номера</button>
        <button className="gpb-secondary" type="button">Создать черновик ответа</button>
      </section>

      {isCatalogOpen ? <RoomCatalogModal onClose={() => setIsCatalogOpen(false)} /> : null}
    </aside>
  );
}

function RoomCatalogModal({ onClose }: { onClose: () => void }) {
  const [rooms, setRooms] = useState<Room[]>(() => CATALOG_DEFAULTS.map(createEmptyRoom));
  const [selectedRoomId, setSelectedRoomId] = useState(CATALOG_DEFAULTS[0].id);
  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isTechnicalOpen, setIsTechnicalOpen] = useState(false);
  const [focusedPriceRoomId, setFocusedPriceRoomId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const activeRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0];

  useEffect(() => {
    getRooms()
      .then((items) => {
        setRooms(mergeRooms(items));
        setLoadState("ready");
      })
      .catch(() => setLoadState("ready"));
  }, []);

  function updateActiveRoom(patch: Partial<Room>) {
    setSaveState("idle");
    setRooms((currentRooms) =>
      currentRooms.map((room) => (room.id === activeRoom.id ? { ...room, ...patch } : room))
    );
  }

  function toggleAmenity(amenity: string) {
    const amenities = parseAmenities(activeRoom.amenities);
    const nextAmenities = amenities.includes(amenity)
      ? amenities.filter((item) => item !== amenity)
      : amenities.concat(amenity);
    updateActiveRoom({ amenities: nextAmenities.join(", ") });
  }

  function moveActiveRoom(direction: -1 | 1) {
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

  async function handleSave() {
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

  async function handleMediaUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    setSaveState("saving");
    try {
      const updatedRoom = await uploadRoomMedia(activeRoom, file);
      setRooms((currentRooms) => currentRooms.map((room) => (room.id === updatedRoom.id ? updatedRoom : room)));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  async function handleMediaDelete(path: string) {
    setSaveState("saving");
    try {
      const updatedRoom = await deleteRoomMedia(activeRoom, path);
      setRooms((currentRooms) => currentRooms.map((room) => (room.id === updatedRoom.id ? updatedRoom : room)));
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
              Фото, видео, цены, вместимость и описание для ответов клиентам.
            </span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="gpb-catalog-body">
          <nav className="gpb-room-list" aria-label="Номера">
            {rooms.map((room) => (
              <button
                className={room.id === activeRoom.id ? "is-active" : ""}
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
              >
                <BedDouble size={18} />
                <span>
                  {room.title || `Номер ${room.number}`}
                  <small>{getCategoryLabel(room.category)}</small>
                </span>
              </button>
            ))}
          </nav>

          <main className="gpb-room-editor">
            <div className="gpb-room-editor-scroll">
              <section className="gpb-editor-section gpb-identity-section">
                <div className="gpb-editor-title gpb-identity-title">
                  <BedDouble size={20} />
                  <div>
                    <h2>{activeRoom.title}</h2>
                    <span>{activeRoom.number} · {getCategoryLabel(activeRoom.category)}</span>
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
                  </div>
                </div>

                {isTechnicalOpen ? (
                  <div className="gpb-form-grid gpb-technical-grid">
                    <label>
                      Номер
                      <input value={activeRoom.number} onChange={(event) => updateActiveRoom({ number: event.target.value })} />
                    </label>
                    <label>
                      Название
                      <input value={activeRoom.title} onChange={(event) => updateActiveRoom({ title: event.target.value })} />
                    </label>
                    <label>
                      Тип
                      <select
                        value={activeRoom.category}
                        onChange={(event) =>
                          updateActiveRoom({
                            category: event.target.value as Room["category"],
                            bookable: event.target.value !== "staff-room"
                          })
                        }
                      >
                        <option value="guest-room">Гостевой номер</option>
                        <option value="staff-room">Персонал</option>
                        <option value="amenity">Зона/услуга</option>
                      </select>
                    </label>
                    <label>
                      Этаж
                      <input value={activeRoom.floor} onChange={(event) => updateActiveRoom({ floor: event.target.value })} />
                    </label>
                  </div>
                ) : null}
              </section>

              <section className={`gpb-editor-section gpb-booking-state ${activeRoom.bookable ? "is-bookable" : "is-closed"}`}>
                <div>
                  <strong>{activeRoom.bookable ? "Можно бронировать" : "Не бронируется"}</strong>
                  <span>
                    {activeRoom.bookable
                      ? "Этот объект можно предлагать клиентам по датам."
                      : "Агент не должен предлагать этот объект гостям."}
                  </span>
                </div>
                <select
                  value={activeRoom.bookable ? "yes" : "no"}
                  onChange={(event) => updateActiveRoom({ bookable: event.target.value === "yes" })}
                >
                  <option value="yes">Бронируется</option>
                  <option value="no">Не бронируется</option>
                </select>
              </section>

              <section className="gpb-editor-section gpb-price-section">
                <div className="gpb-editor-title">
                  <Banknote size={20} />
                  <h2>Цена</h2>
                </div>
                <label className="gpb-price-input">
                  Базовая цена
                  <input
                    inputMode="numeric"
                    type="text"
                    value={getPriceInputValue(activeRoom.basePrice, focusedPriceRoomId === activeRoom.id)}
                    onBlur={() => setFocusedPriceRoomId(null)}
                    onChange={(event) => updateActiveRoom({ basePrice: parsePriceInput(event.target.value) })}
                    onFocus={() => setFocusedPriceRoomId(activeRoom.id)}
                  />
                </label>
                <p>Позже здесь добавим цены по сезонам и конкретным датам.</p>
              </section>

              <section className="gpb-editor-section">
                <div className="gpb-editor-title">
                  <Users size={20} />
                  <h2>Вместимость</h2>
                </div>
                <div className="gpb-form-grid">
                  <label>
                    Взрослые
                    <input
                      min="1"
                      type="number"
                      value={activeRoom.capacityAdults}
                      onChange={(event) => updateActiveRoom({ capacityAdults: toNumber(event.target.value, 1) })}
                    />
                  </label>
                  <label>
                    Дети
                    <input
                      min="0"
                      type="number"
                      value={activeRoom.capacityChildren}
                      onChange={(event) => updateActiveRoom({ capacityChildren: toNumber(event.target.value, 0) })}
                    />
                  </label>
                  <label>
                    Доп. места
                    <input
                      min="0"
                      type="number"
                      value={activeRoom.extraBeds}
                      onChange={(event) => updateActiveRoom({ extraBeds: toNumber(event.target.value, 0) })}
                    />
                  </label>
                  <label>
                    Кровати
                    <input value={activeRoom.beds} onChange={(event) => updateActiveRoom({ beds: event.target.value })} />
                  </label>
                </div>
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
                </div>
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
                  <h2>Описание и удобства</h2>
                </div>
                <label className="gpb-wide-label">
                  Короткое описание для WhatsApp
                  <textarea
                    placeholder="Уютный номер, кондиционер, санузел, Wi-Fi..."
                    value={activeRoom.description}
                    onChange={(event) => updateActiveRoom({ description: event.target.value })}
                  />
                </label>
                <label className="gpb-wide-label">
                  Удобства
                  <div className="gpb-amenity-grid">
                    {AMENITY_OPTIONS.map((amenity) => {
                      const isActive = parseAmenities(activeRoom.amenities).includes(amenity);
                      return (
                        <button
                          className={isActive ? "is-active" : ""}
                          key={amenity}
                          type="button"
                          onClick={() => toggleAmenity(amenity)}
                        >
                          {amenity}
                        </button>
                      );
                    })}
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
                Сохранить номер
              </button>
            </footer>
          </main>

          <aside className="gpb-preview-panel">
            <div className="gpb-preview-card">
              <div className="gpb-preview-media">
                {activeRoom.photoPaths[0] ? (
                  <MediaImage alt={activeRoom.title} path={activeRoom.photoPaths[0]} />
                ) : (
                  <Image size={28} />
                )}
              </div>
              <div className="gpb-preview-content">
                <strong>{activeRoom.title}</strong>
                <span>{activeRoom.number} · {getCategoryLabel(activeRoom.category)}</span>
                <p>{activeRoom.description || "Описание появится здесь и будет использоваться для ответа в WhatsApp."}</p>
                <dl>
                  <div>
                    <dt>Цена</dt>
                    <dd>{formatPrice(activeRoom.basePrice)}</dd>
                  </div>
                  <div>
                    <dt>Гости</dt>
                    <dd>{activeRoom.capacityAdults} взр. · {activeRoom.capacityChildren} дет.</dd>
                  </div>
                  <div>
                    <dt>Статус</dt>
                    <dd>{activeRoom.bookable ? "можно предложить" : "не предлагать"}</dd>
                  </div>
                </dl>
                <div className="gpb-whatsapp-bubble">
                  {buildWhatsAppPreview(activeRoom)}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function createEmptyRoom(item: (typeof CATALOG_DEFAULTS)[number]): Room {
  return {
    id: item.id,
    number: item.number,
    title: item.title,
    sortOrder: CATALOG_DEFAULTS.findIndex((catalogItem) => catalogItem.id === item.id),
    category: item.category,
    bookable: item.bookable,
    status: "active",
    basePrice: 0,
    floor: "",
    capacityAdults: 2,
    capacityChildren: 0,
    extraBeds: 0,
    beds: "",
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
    category: room.category ?? getDefaultCategory(room.number),
    bookable: typeof room.bookable === "boolean" ? room.bookable : getDefaultBookable(room.number)
  }));
  const byId = new Map(normalizedRooms.map((room) => [room.id, room]));
  const rooms = CATALOG_DEFAULTS.map((item) => byId.get(item.id) ?? createEmptyRoom(item));
  return withSortOrder(rooms.sort((left, right) => left.sortOrder - right.sortOrder));
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

function getCategoryLabel(category: Room["category"]) {
  if (category === "staff-room") return "Персонал";
  if (category === "amenity") return "Зона";
  return "Гости";
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

function formatPrice(price: number) {
  if (!price) return "Не указана";
  return `${new Intl.NumberFormat("ru-RU").format(price)} тг`;
}

function getPriceInputValue(price: number, isFocused: boolean) {
  if (isFocused && price === 0) return "";
  if (!price) return "0";
  return new Intl.NumberFormat("ru-RU").format(price);
}

function parsePriceInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function buildWhatsAppPreview(room: Room) {
  const price = formatPrice(room.basePrice);
  const description = room.description || "Уютный вариант для отдыха.";
  const amenities = room.amenities ? `\nУдобства: ${room.amenities}` : "";
  return `${room.title}\n${description}${amenities}\nЦена: ${price}`;
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
    .filter((item) => !AMENITY_OPTIONS.includes(item))
    .join(", ");
}

function updateCustomAmenities(
  currentAmenities: string,
  customAmenities: string,
  updateRoom: (patch: Partial<Room>) => void
) {
  const selectedAmenities = parseAmenities(currentAmenities).filter((item) => AMENITY_OPTIONS.includes(item));
  const customItems = parseAmenities(customAmenities);
  updateRoom({ amenities: selectedAmenities.concat(customItems).join(", ") });
}
