import { writeFile } from "node:fs/promises";

const API_BASE_URL = process.env.API_BASE_URL || "https://bokingww.onrender.com";
const backupPath = `chatMessages-backup-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-before-gpt-clean.json`;

function normalizeExtractedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDialogMessageText(value) {
  return normalizeExtractedText(value).replace(/\b\d{1,2}:\d{2}\b\s*$/g, "").trim();
}

function cleanVisibleDialogMessageText(value, fromMe) {
  let text = String(value || "").replace(/\b\d{1,2}:\d{2}\b\s*$/g, "").trim();
  if (fromMe) text = text.replace(/^Вы\s+/i, "").trim();
  return text;
}

function isDialogMediaMarker(value) {
  return /^\[Медиа(?::\s*(?:видео|фото|аудио|файл))?\]$/i.test(String(value || "").trim());
}

function isLikelyWhatsAppSystemText(value) {
  return /сообщения и звонки защищены|messages and calls are end-to-end encrypted|нажмите, чтобы узнать больше|click to learn more/i.test(value);
}

function isLikelyWhatsAppNonMessageText(value) {
  return /инструменты безопасности|заблокировать|нет общих групп|нет в списке контактов|ваш контакт|использует автоматический таймер|исчезающих сообщений|реклама \(instagram\)|автоматическое приветствие/i.test(value);
}

function extractDialogRoomNumbers(text) {
  const numbers = new Set();
  for (const match of String(text || "").matchAll(/(?:Номер|№)\s*([0-9]{2,4})/gi)) {
    numbers.add(match[1]);
  }
  return Array.from(numbers);
}

function extractDialogLineValue(text, pattern) {
  const match = String(text || "").match(pattern);
  return normalizeExtractedText(match?.[1] || "");
}

function extractDialogMoneyValue(text, pattern) {
  const match = String(text || "").match(pattern);
  return normalizeExtractedText(match?.[1] || "");
}

function summarizeReservationDialogMessage(text, prefix) {
  const roomNumbers = extractDialogRoomNumbers(text);
  const guestCount = extractDialogLineValue(text, /Гости:\s*([^|\n]+)/i);
  const total = extractDialogMoneyValue(text, /(?:Сумма со скидкой|Сумма|Итого):?\s*([0-9\s ]+тг)/i);
  const parts = [
    roomNumbers.length ? `номера ${roomNumbers.join(", ")}` : "",
    guestCount ? `гости ${guestCount.replace(/^Гости:\s*/i, "")}` : "",
    total ? `сумма ${total}` : ""
  ].filter(Boolean);
  return parts.length ? `${prefix}: ${parts.join("; ")}` : prefix;
}

function isLikelyRoomCardDialogMessage(text) {
  return /(?:^|\n)(?:Номер\s+\d+|Сауна|Беседка)/i.test(text) &&
    /(?:Цена|Питание|Удобства|Места|Заезд|выезд|Будни|Выходные|Праздник|тг)/i.test(text);
}

function summarizeOperatorDialogMessage(text) {
  const normalized = normalizeExtractedText(text);
  if (!normalized) return "";
  const technicalSummary = getTechnicalOperatorDialogSummary(normalized);
  if (technicalSummary) return technicalSummary;

  return normalized;
}

function getTechnicalOperatorDialogSummary(normalized) {
  if (/Бронирование\s+на согласование|на согласование/i.test(normalized) && /(?:Заезд|Выезд|Итого|Предоплата|К оплате)/i.test(normalized)) {
    return summarizeReservationDialogMessage(normalized, "Отправлена бронь на согласование");
  }

  if (/Подтверждение брони|Оплата поступила/i.test(normalized)) {
    return summarizeReservationDialogMessage(normalized, "Отправлено подтверждение брони");
  }

  if (/(?:pay\.kaspi\.kz|Оплата продавцу)/i.test(normalized) && /(?:Заезд|Выезд|Итого|Сумма)/i.test(normalized)) {
    return summarizeReservationDialogMessage(normalized, "Отправлена ссылка на оплату");
  }

  if (/Прайс на|Предложение на согласование|В PDF выбранные объекты|Доступные номера|Бронируется на согласование/i.test(normalized)) {
    const roomNumbers = extractDialogRoomNumbers(normalized);
    return roomNumbers.length ? `Отправлен прайс: номера ${roomNumbers.join(", ")}` : "Отправлен прайс";
  }

  if (/Меню Green Pine Burabay|Меню\b/i.test(normalized) && (normalized.length > 120 || /[0-9\s ]+тг/i.test(normalized))) {
    return "Отправлено меню";
  }

  if (/Видео объекта/i.test(normalized)) return "Отправлено видео объекта";

  if (/Сауна/i.test(normalized) && /(?:Минимум|Цена|Будни|Выходные|Праздник|тг)/i.test(normalized)) {
    return "Отправлена сауна";
  }

  if (isLikelyRoomCardDialogMessage(normalized)) {
    const roomNumbers = extractDialogRoomNumbers(normalized);
    if (roomNumbers.length) return roomNumbers.length === 1 ? `Отправлен номер ${roomNumbers[0]}` : `Отправлены номера ${roomNumbers.join(", ")}`;
    return "Отправлена карточка номера";
  }

  if (normalized.length > 900 || normalized.split("\n").length > 14) {
    const roomNumbers = extractDialogRoomNumbers(normalized);
    return roomNumbers.length ? `Отправлена служебная информация: номера ${roomNumbers.join(", ")}` : "Отправлена служебная информация";
  }

  return "";
}

function isLikelyTechnicalOperatorDialogMessage(value) {
  const normalized = normalizeExtractedText(cleanVisibleDialogMessageText(normalizeDialogMessageText(value), true));
  return Boolean(normalized && getTechnicalOperatorDialogSummary(normalized));
}

function normalizeDialogMessageForStorage(value, fromMe) {
  const text = cleanVisibleDialogMessageText(normalizeDialogMessageText(value), fromMe);
  if (!text || isDialogMediaMarker(text) || isLikelyWhatsAppSystemText(text) || isLikelyWhatsAppNonMessageText(text)) return "";
  if (!fromMe) return text;
  return summarizeOperatorDialogMessage(text);
}

async function main() {
  const response = await fetch(`${API_BASE_URL}/api/chat-messages?limit=20000`);
  if (!response.ok) throw new Error(`Cannot fetch chat messages: ${response.status}`);
  const payload = await response.json();
  const dialogs = Array.isArray(payload.dialogs) ? payload.dialogs : [];
  await writeFile(backupPath, JSON.stringify({ exportedAt: new Date().toISOString(), dialogs }, null, 2));

  let dialogsChanged = 0;
  let messagesChanged = 0;
  let messagesKept = 0;

  for (const dialog of dialogs) {
    const messages = Array.isArray(dialog.messages) ? dialog.messages : [];
    const cleanedMessages = messages.map((message) => {
      const fromMe = Boolean(message.fromMe) || isLikelyTechnicalOperatorDialogMessage(message.text || "");
      const text = normalizeDialogMessageForStorage(message.text || "", fromMe);
      if (!text) return null;
      if (text !== message.text) messagesChanged += 1;
      else messagesKept += 1;
      return {
        ...message,
        id: String(message.messageKey || message.id || ""),
        text,
        type: fromMe && text !== message.text ? "summary" : String(message.type || "visible")
      };
    }).filter(Boolean);

    if (!cleanedMessages.length) continue;
    const changed = cleanedMessages.some((message, index) =>
      message.text !== messages[index]?.text ||
      message.type !== messages[index]?.type ||
      message.fromMe !== messages[index]?.fromMe
    );
    if (!changed) continue;

    const saveResponse = await fetch(`${API_BASE_URL}/api/chat-messages/${encodeURIComponent(dialog.chatKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatTitle: dialog.chatTitle || "",
        clientId: "cleanup-script",
        messages: cleanedMessages,
        operatorName: "cleanup",
        phone: dialog.phone || ""
      })
    });
    if (!saveResponse.ok) throw new Error(`Cannot save dialog ${dialog.chatKey}: ${saveResponse.status}`);
    dialogsChanged += 1;
  }

  console.log(JSON.stringify({
    backupPath,
    dialogs: dialogs.length,
    dialogsChanged,
    messagesChanged,
    messagesKept
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
