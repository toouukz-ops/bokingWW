import { createRoot } from "react-dom/client";
import { BookingPanel } from "../panel/BookingPanel";

const ROOT_ID = "gpb-booking-extension-root";

function mountPanel() {
  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;
  document.body.appendChild(root);

  createRoot(root).render(<BookingPanel />);
}

function waitForWhatsApp() {
  const observer = new MutationObserver(() => {
    const app = document.querySelector("#app");
    if (app) {
      observer.disconnect();
      mountPanel();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

waitForWhatsApp();

