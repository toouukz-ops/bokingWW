import {
  Banknote,
  BedDouble,
  CalendarDays,
  Hotel,
  Image,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Users,
  Video,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getHealth, getRooms, saveRoom } from "../shared/api";
import type { Room, RoomStatus } from "../shared/types";

const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
const ROOM_NUMBERS = ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "115"];

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
  const [rooms, setRooms] = useState<Room[]>(() => ROOM_NUMBERS.map(createEmptyRoom));
  const [selectedRoom, setSelectedRoom] = useState(ROOM_NUMBERS[0]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "offline">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const activeRoom = rooms.find((room) => room.number === selectedRoom) ?? rooms[0];

  useEffect(() => {
    getRooms()
      .then((items) => {
        setRooms(mergeRooms(items));
        setLoadState("ready");
      })
      .catch(() => setLoadState("offline"));
  }, []);

  function updateActiveRoom(patch: Partial<Room>) {
    setSaveState("idle");
    setRooms((currentRooms) =>
      currentRooms.map((room) => (room.number === activeRoom.number ? { ...room, ...patch } : room))
    );
  }

  async function handleSave() {
    setSaveState("saving");
    try {
      const savedRoom = await saveRoom(activeRoom);
      setRooms((currentRooms) => currentRooms.map((room) => (room.number === savedRoom.number ? savedRoom : room)));
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
              {loadState === "offline"
                ? "Backend недоступен, сохранение не сработает."
                : "Фото, видео, цены, вместимость и описание для ответов клиентам."}
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
                className={room.number === selectedRoom ? "is-active" : ""}
                key={room.number}
                type="button"
                onClick={() => setSelectedRoom(room.number)}
              >
                <BedDouble size={18} />
                <span>{room.title || `Номер ${room.number}`}</span>
              </button>
            ))}
          </nav>

          <main className="gpb-room-editor">
            <div className="gpb-room-editor-scroll">
              <section className="gpb-editor-section">
                <div className="gpb-editor-title">
                  <BedDouble size={20} />
                  <h2>Номер {activeRoom.number}</h2>
                </div>

                <div className="gpb-form-grid">
                  <label>
                    Название
                    <input value={activeRoom.title} onChange={(event) => updateActiveRoom({ title: event.target.value })} />
                  </label>
                  <label>
                    Статус
                    <select
                      value={activeRoom.status}
                      onChange={(event) => updateActiveRoom({ status: event.target.value as RoomStatus })}
                    >
                      <option value="active">Активен</option>
                      <option value="hidden">Скрыт</option>
                      <option value="repair">Ремонт</option>
                    </select>
                  </label>
                  <label>
                    Базовая цена
                    <input
                      min="0"
                      type="number"
                      value={activeRoom.basePrice}
                      onChange={(event) => updateActiveRoom({ basePrice: toNumber(event.target.value, 0) })}
                    />
                  </label>
                  <label>
                    Этаж
                    <input value={activeRoom.floor} onChange={(event) => updateActiveRoom({ floor: event.target.value })} />
                  </label>
                </div>
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
                  <button type="button">
                    <Image size={22} />
                    <span>Добавить фото</span>
                  </button>
                  <button type="button">
                    <Video size={22} />
                    <span>Добавить видео</span>
                  </button>
                </div>
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
                  <input
                    placeholder="Wi-Fi, кондиционер, душ, холодильник, телевизор"
                    value={activeRoom.amenities}
                    onChange={(event) => updateActiveRoom({ amenities: event.target.value })}
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
        </div>
      </div>
    </div>
  );
}

function createEmptyRoom(number: string): Room {
  return {
    number,
    title: `Номер ${number}`,
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

function mergeRooms(loadedRooms: Room[]) {
  return ROOM_NUMBERS.map((number) => loadedRooms.find((room) => room.number === number) ?? createEmptyRoom(number));
}

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
