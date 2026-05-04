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
import { getHealth } from "../shared/api";

const MIN_WIDTH = 320;
const MAX_WIDTH = 960;

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
  const rooms = ["101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "115"];
  const [selectedRoom, setSelectedRoom] = useState(rooms[0]);

  return (
    <div className="gpb-modal-backdrop">
      <div className="gpb-catalog-modal" role="dialog" aria-modal="true" aria-label="Каталог номеров">
        <header className="gpb-catalog-header">
          <div>
            <strong>Каталог номеров</strong>
            <span>Фото, видео, цены, вместимость и описание для ответов клиентам.</span>
          </div>
          <button type="button" onClick={onClose} title="Закрыть">
            <X size={20} />
          </button>
        </header>

        <div className="gpb-catalog-body">
          <nav className="gpb-room-list" aria-label="Номера">
            {rooms.map((room) => (
              <button
                className={room === selectedRoom ? "is-active" : ""}
                key={room}
                type="button"
                onClick={() => setSelectedRoom(room)}
              >
                <BedDouble size={18} />
                <span>Номер {room}</span>
              </button>
            ))}
          </nav>

          <main className="gpb-room-editor">
            <section className="gpb-editor-section">
              <div className="gpb-editor-title">
                <BedDouble size={20} />
                <h2>Номер {selectedRoom}</h2>
              </div>

              <div className="gpb-form-grid">
                <label>
                  Название
                  <input defaultValue={`Номер ${selectedRoom}`} />
                </label>
                <label>
                  Статус
                  <select defaultValue="active">
                    <option value="active">Активен</option>
                    <option value="hidden">Скрыт</option>
                    <option value="repair">Ремонт</option>
                  </select>
                </label>
                <label>
                  Базовая цена
                  <input min="0" type="number" placeholder="20000" />
                </label>
                <label>
                  Этаж
                  <input placeholder="1 этаж" />
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
                  <input min="1" type="number" defaultValue="2" />
                </label>
                <label>
                  Дети
                  <input min="0" type="number" defaultValue="0" />
                </label>
                <label>
                  Доп. места
                  <input min="0" type="number" defaultValue="0" />
                </label>
                <label>
                  Кровати
                  <input placeholder="1 двуспальная" />
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
                <textarea placeholder="Уютный номер, кондиционер, санузел, Wi-Fi..." />
              </label>
              <label className="gpb-wide-label">
                Удобства
                <input placeholder="Wi-Fi, кондиционер, душ, холодильник, телевизор" />
              </label>
              <label className="gpb-wide-label">
                Заметки для администратора
                <textarea placeholder="Не отправляется клиенту. Например: солнечная сторона, лучше предлагать семьям." />
              </label>
            </section>

            <footer className="gpb-catalog-footer">
              <button className="gpb-secondary" type="button">Отмена</button>
              <button className="gpb-primary" type="button">Сохранить номер</button>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
