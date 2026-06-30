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
    const stores = getStores();
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

  const getStores = () => {
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

    return stores.filter((store, index, list) => store?.Chat?.models && list.indexOf(store) === index);
  };

  const readChatSerializedId = (chat) => String(
    chat?.id?._serialized ||
    chat?.__x_id?._serialized ||
    chat?.wid?._serialized ||
    chat?.__x_wid?._serialized ||
    chat?.id ||
    ""
  );

  const readChatTime = (chat) => {
    const value = chat?.t || chat?.timestamp || chat?.__x_t || chat?.__x_timestamp || chat?.msgs?.models?.at?.(-1)?.t || 0;
    return Number(value) || 0;
  };

  const readMessageId = (message) => String(
    message?.id?._serialized ||
    message?.__x_id?._serialized ||
    message?.id?.id ||
    message?.__x_id?.id ||
    message?.id ||
    ""
  );

  const readMessageChatId = (message) => {
    const values = [
      message?.id?.remote?._serialized,
      message?.id?.remote?.user,
      message?.id?.remote,
      message?.chatId?._serialized,
      message?.chatId?.user,
      message?.chatId,
      message?.from?._serialized,
      message?.from?.user,
      message?.from,
      message?.to?._serialized,
      message?.to?.user,
      message?.to
    ];

    for (const value of values) {
      if (!value) continue;
      const text = String(value);
      if (text && text !== "[object Object]") return text;
    }
    return "";
  };

  const readMessageMediaMarker = (message) => {
    const type = cleanText(message?.type || message?.__x_type || message?.mediaData?.type || message?.__x_mediaData?.type || "");
    const mime = cleanText(message?.mimetype || message?.__x_mimetype || message?.mediaData?.mimetype || message?.__x_mediaData?.mimetype || "");
    const value = `${type} ${mime}`;
    if (/video/i.test(value)) return "[Медиа: видео]";
    if (/image|photo|sticker/i.test(value)) return "[Медиа: фото]";
    if (/audio|ptt|voice/i.test(value)) return "[Медиа: аудио]";
    if (/document|file|pdf|application\//i.test(value)) return "[Медиа: файл]";
    if (message?.isMedia || message?.__x_isMedia || message?.mediaData || message?.__x_mediaData) return "[Медиа]";
    return "";
  };

  const readMessageText = (message) => cleanText(
    message?.body ||
    message?.__x_body ||
    message?.caption ||
    message?.__x_caption ||
    message?.text ||
    message?.__x_text ||
    message?.message?.conversation ||
    readMessageMediaMarker(message) ||
    ""
  );

  const readMessageTimestamp = (message) => {
    const value = Number(message?.t || message?.timestamp || message?.__x_t || message?.__x_timestamp || 0);
    if (!value) return "";
    return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
  };

  const readMessageFromMe = (message) => Boolean(
    message?.id?.fromMe ||
    message?.__x_id?.fromMe ||
    message?.fromMe ||
    message?.__x_isSentByMe ||
    message?.isSentByMe
  );

  const readChatMessages = (store, chat, limit) => {
    const chatId = readChatSerializedId(chat);
    const ownMessages = [
      ...(chat?.msgs?.models || []),
      ...(chat?.msgs?._models || []),
      ...(typeof chat?.msgs?.getModelsArray === "function" ? chat.msgs.getModelsArray() : [])
    ];
    const storeMessages = (store?.Msg?.models || [])
      .filter((message) => {
        const messageChatId = readMessageChatId(message);
        return chatId && messageChatId && (messageChatId === chatId || chatId.includes(messageChatId) || messageChatId.includes(chatId));
      });
    const seen = new Set();
    return ownMessages.concat(storeMessages)
      .filter((message) => {
        const id = readMessageId(message) || `${readMessageTimestamp(message)}:${readMessageText(message)}`;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((message) => ({
        id: readMessageId(message),
        timestamp: readMessageTimestamp(message),
        fromMe: readMessageFromMe(message),
        author: cleanText(message?.senderObj?.pushname || message?.senderObj?.formattedName || message?.author || message?.__x_author || ""),
        type: cleanText(message?.type || message?.__x_type || ""),
        text: readMessageText(message)
      }))
      .filter((message) => message.text)
      .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)))
      .slice(-limit);
  };

  const exportLoadedDialogs = ({ chatLimit = 50, messageLimit = 250 } = {}) => {
    const stores = getStores();
    for (const store of stores) {
      const chats = (store.Chat?.models || [])
        .map((chat) => ({
          chat,
          id: readChatSerializedId(chat),
          phone: readId(chat),
          title: readTitle(chat),
          isActive: Boolean(chat?.active || chat?.__x_active || chat?.isActive || chat?.__x_isActive),
          time: readChatTime(chat)
        }))
        .filter((item) => item.id || item.title || item.phone)
        .sort((left, right) => Number(right.isActive) - Number(left.isActive) || right.time - left.time)
        .slice(0, chatLimit);

      const dialogs = chats
        .map((item) => ({
          id: item.id,
          title: item.title,
          phone: item.phone,
          isActive: item.isActive,
          messages: readChatMessages(store, item.chat, messageLimit)
        }))
        .filter((dialog) => dialog.messages.length);

      if (dialogs.length) {
        return {
          exportedAt: new Date().toISOString(),
          source: "whatsapp-store",
          chatLimit,
          messageLimit,
          dialogs
        };
      }
    }

    return {
      exportedAt: new Date().toISOString(),
      source: "whatsapp-store",
      chatLimit,
      messageLimit,
      dialogs: []
    };
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

  window.addEventListener("gpb-request-chat-dialog-export", (event) => {
    const requestId = event.detail?.requestId || "";
    try {
      window.dispatchEvent(new CustomEvent("gpb-chat-dialog-export", {
        detail: {
          requestId,
          ok: true,
          payload: exportLoadedDialogs(event.detail || {})
        }
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent("gpb-chat-dialog-export", {
        detail: {
          requestId,
          ok: false,
          error: error?.message || "Dialog export failed"
        }
      }));
    }
  });
})();
