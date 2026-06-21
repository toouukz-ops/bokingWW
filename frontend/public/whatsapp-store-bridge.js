(() => {
  if (window.__GPB_WHATSAPP_STORE_BRIDGE__) return;
  window.__GPB_WHATSAPP_STORE_BRIDGE__ = true;

  const normalize = (value) => {
    if (!value) return "";
    const text = String(value);
    const jidMatch = text.match(/(\d{10,15})@(c\.us|s\.whatsapp\.net)/);
    if (jidMatch) return jidMatch[1];
    const plainMatch = text.match(/^\d{10,15}$/);
    return plainMatch ? plainMatch[0] : "";
  };

  const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

  const readTitle = (chat) => cleanText(
    chat?.formattedTitle ||
    chat?.__x_formattedTitle ||
    chat?.name ||
    chat?.__x_name ||
    chat?.contact?.formattedName ||
    chat?.contact?.__x_formattedName ||
    chat?.contact?.name ||
    chat?.contact?.pushname ||
    chat?.contact?.__x_pushname ||
    ""
  );

  const readHeaderTitle = () => {
    const header = document.querySelector("#main header");
    const candidates = [
      header?.querySelector("span[title]")?.getAttribute("title"),
      header?.querySelector("[title]")?.getAttribute("title"),
      header?.querySelector("span[dir='auto']")?.textContent,
      header?.innerText?.split("\n")[0]
    ];

    return candidates.map(cleanText).find(Boolean) || "";
  };

  const readId = (chat) => {
    const contact = chat?.contact || chat?.__x_contact || {};
    const values = [
      chat?.id?._serialized,
      chat?.id?.user,
      chat?.__x_id?._serialized,
      chat?.__x_id?.user,
      chat?.wid?._serialized,
      chat?.wid?.user,
      chat?.__x_wid?._serialized,
      chat?.__x_wid?.user,
      contact?.id?._serialized,
      contact?.id?.user,
      contact?.__x_id?._serialized,
      contact?.__x_id?.user,
      contact?.wid?._serialized,
      contact?.wid?.user,
      contact?.__x_wid?._serialized,
      contact?.__x_wid?.user,
      contact?.phoneNumber,
      contact?.__x_phoneNumber,
      contact?.userid,
      contact?.__x_userid,
      contact?.formattedPhone,
      contact?.__x_formattedPhone
    ];

    for (const value of values) {
      const phone = normalize(value);
      if (phone) return phone;
    }

    return "";
  };

  const readActiveChatPhone = () => {
    const stores = [];
    if (window.Store?.Chat?.models) stores.push(window.Store);

    const chunk = window.webpackChunkwhatsapp_web_client || window.webpackChunkbuild || window.webpackJsonp;
    if (Array.isArray(chunk)) {
      chunk.push([[Math.random()], {}, (require) => {
        for (const id in require.c) {
          const exports = require.c[id]?.exports;
          for (const candidate of [exports, exports?.default, exports?.default?.default]) {
            if (candidate?.Chat?.models) stores.push(candidate);
            if (candidate?.default?.Chat?.models) stores.push(candidate.default);
          }
        }
      }]);
    }

    const headerTitle = readHeaderTitle();

    for (const store of stores) {
      const chats = store.Chat?.models || [];
      const active = chats.find((chat) => chat?.active || chat?.__x_active || chat?.isActive || chat?.__x_isActive);
      const phone = readId(active);
      if (phone) return phone;

      if (headerTitle) {
        const byTitle = chats.find((chat) => readTitle(chat) === headerTitle);
        const titlePhone = readId(byTitle);
        if (titlePhone) return titlePhone;
      }
    }

    return "";
  };

  window.addEventListener("gpb-request-active-chat-phone", (event) => {
    const requestId = event.detail?.requestId || "";
    let phone = "";
    try {
      phone = readActiveChatPhone();
    } catch {
      phone = "";
    }

    window.dispatchEvent(new CustomEvent("gpb-active-chat-phone", {
      detail: {
        requestId,
        phone
      }
    }));
  });
})();
