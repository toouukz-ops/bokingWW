import { CalendarDays, PanelRightClose, PanelRightOpen, Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getHealth } from "../shared/api";

const MIN_WIDTH = 320;
const MAX_WIDTH = 960;

function getMaxPanelWidth() {
  return Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.62));
}

export function BookingPanel() {
  const [isOpen, setIsOpen] = useState(true);
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
    </aside>
  );
}
