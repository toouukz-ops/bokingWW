import type { ManifestV3Export } from "@crxjs/vite-plugin";

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: "GPB WhatsApp Booking",
  version: "0.1.0",
  description: "Локальная панель бронирования поверх WhatsApp Web.",
  permissions: ["storage"],
  host_permissions: ["https://web.whatsapp.com/*", "http://127.0.0.1:8765/*"],
  content_scripts: [
    {
      matches: ["https://web.whatsapp.com/*"],
      js: ["src/content/main.tsx"],
      css: ["src/content/styles.css"],
      run_at: "document_idle"
    }
  ],
  action: {
    default_title: "GPB Booking"
  }
};

export default manifest;

