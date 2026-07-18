import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "GPB WhatsApp Booking",
  version: "1.0.129",
  description: "Локальная панель бронирования поверх WhatsApp Web.",
  permissions: ["storage", "activeTab", "tabs"],
  host_permissions: ["<all_urls>", "https://web.whatsapp.com/*", "http://127.0.0.1:8765/*", "https://*.onrender.com/*", "https://api.open-meteo.com/*"],
  content_scripts: [
    {
      matches: ["https://web.whatsapp.com/*"],
      js: ["src/content/main.tsx"],
      css: ["src/content/styles.css"],
      run_at: "document_idle"
    }
  ],
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module"
  },
  web_accessible_resources: [
    {
      resources: ["whatsapp-store-bridge.js", "whatsapp-contact-form-bridge.js"],
      matches: ["https://web.whatsapp.com/*"]
    }
  ],
  action: {
    default_title: "GPB Booking"
  }
};

export default manifest;
