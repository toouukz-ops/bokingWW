#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { MongoClient } = require("../backend/node_modules/mongodb");

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const shouldDeleteTechnical = args.has("--delete-technical");
const allHistory = args.has("--all");
const daysArgument = process.argv.slice(2).find((item) => item.startsWith("--days="));
const days = Math.max(1, Math.min(Number(daysArgument?.slice("--days=".length) || 3), 90));

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URL;
const dbName = process.env.MONGODB_DB_NAME || process.env.MONGO_DB_NAME || process.env.DB_NAME || "gpb_whatsapp_booking";

if (!uri) {
  console.error("Set MONGODB_URI, MONGO_URI, or DB_URL before running this script.");
  process.exit(1);
}

const technicalTitlePattern = /^(аудиозвонок|видео|фото|медиа|вы удалили это сообщение|вы закрепили сообщение|facebook business)$/i;
const guestTitlePattern = /^Гость\s+(\d{4})$/i;

function normalizePhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("7") && digits.length > 11) return "";
  if (/^8\d{10}$/.test(digits)) {
    const phone = `7${digits.slice(1)}`;
    return /^77\d{9}$/.test(phone) ? `+${phone}` : "";
  }
  if (/^7\d{10}$/.test(digits)) return /^77\d{9}$/.test(digits) ? `+${digits}` : "";
  if (/^\d{10}$/.test(digits)) return `+7${digits}`;
  return `+${digits}`;
}

function guestTitleFromPhone(phone) {
  const digits = normalizePhone(phone).replace(/\D/g, "");
  return digits.length >= 4 ? `Гость ${digits.slice(-4)}` : "";
}

function normalizeTitle(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function getPhoneCandidatesByTitle(title, contacts, reservations) {
  const normalizedTitle = normalizeTitle(title);
  const match = normalizedTitle.match(guestTitlePattern);
  const phones = new Set();

  for (const contact of contacts) {
    const phone = normalizePhone(contact.phone || "");
    if (!phone) continue;
    const appeal = normalizeTitle(contact.apel || contact.appeal || "");
    if (appeal && appeal.toLowerCase() === normalizedTitle.toLowerCase()) phones.add(phone);
    if (match && phone.replace(/\D/g, "").endsWith(match[1])) phones.add(phone);
  }

  for (const reservation of reservations) {
    const phone = normalizePhone(reservation.phone || "");
    if (!phone) continue;
    const guestName = normalizeTitle(reservation.guestName || reservation.guest || reservation.name || "");
    if (guestName && guestName.toLowerCase() === normalizedTitle.toLowerCase()) phones.add(phone);
    if (match && phone.replace(/\D/g, "").endsWith(match[1])) phones.add(phone);
  }

  return [...phones];
}

function buildMessageKeyFilter(document) {
  return {
    chatKey: document.chatKey,
    messageKey: document.messageKey
  };
}

async function main() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db(dbName);
  const chatMessages = db.collection("chatMessages");
  const guestContacts = db.collection("guestContacts");
  const reservations = db.collection("reservations");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const messageFilter = allHistory ? {} : { updatedAt: { $gte: since } };

  const [messages, contacts, reservationItems] = await Promise.all([
    chatMessages.find(messageFilter, {
      projection: { chatKey: 1, chatTitle: 1, phone: 1, messageKey: 1, updatedAt: 1 }
    }).sort({ updatedAt: -1 }).limit(allHistory ? 100_000 : 20_000).toArray(),
    guestContacts.find({}, { projection: { phone: 1, appeal: 1, apel: 1 } }).toArray(),
    reservations.find({}, { projection: { phone: 1, guestName: 1, guest: 1, name: 1 } }).toArray()
  ]);

  const updates = [];
  const deletes = [];
  const skipped = [];

  for (const message of messages) {
    const rawPhone = normalizeTitle(message.phone || "");
    const currentPhone = normalizePhone(rawPhone);
    const currentTitle = normalizeTitle(message.chatTitle || "");
    const currentKey = normalizeTitle(message.chatKey || "");
    let targetPhone = currentPhone;

    if (rawPhone && !currentPhone) {
      skipped.push({
        chatKey: currentKey,
        chatTitle: currentTitle,
        phone: rawPhone,
        reason: "invalid_phone"
      });
      continue;
    }

    if (!targetPhone) {
      const candidates = getPhoneCandidatesByTitle(currentTitle || currentKey.replace(/^title:/i, ""), contacts, reservationItems);
      if (candidates.length === 1) {
        targetPhone = candidates[0];
      } else if (shouldDeleteTechnical && technicalTitlePattern.test(currentTitle || currentKey.replace(/^title:/i, ""))) {
        deletes.push(message);
        continue;
      } else {
        skipped.push({
          chatKey: currentKey,
          chatTitle: currentTitle,
          phone: message.phone || "",
          reason: candidates.length > 1 ? `ambiguous:${candidates.join(",")}` : "no_phone_match"
        });
        continue;
      }
    }

    const targetTitle = guestTitleFromPhone(targetPhone);
    const targetKey = `phone:${targetPhone}`;
    if (message.phone !== targetPhone || message.chatTitle !== targetTitle || message.chatKey !== targetKey) {
      updates.push({
        filter: buildMessageKeyFilter(message),
        set: {
          phone: targetPhone,
          chatTitle: targetTitle,
          chatKey: targetKey,
          updatedAt: new Date()
        },
        from: {
          chatKey: message.chatKey,
          chatTitle: message.chatTitle,
          phone: message.phone
        }
      });
    }
  }

  console.log(JSON.stringify({
    mode: shouldApply ? "apply" : "dry-run",
    scope: allHistory ? "all" : `last_${days}_days`,
    scanned: messages.length,
    updates: updates.length,
    deletes: deletes.length,
    skipped: skipped.length,
    skippedSamples: skipped.slice(0, 30),
    updateSamples: updates.slice(0, 30).map((item) => ({
      from: item.from,
      to: item.set
    }))
  }, null, 2));

  if (shouldApply) {
    const operations = updates.map((item) => ({
      updateMany: {
        filter: item.filter,
        update: { $set: item.set }
      }
    })).concat(deletes.map((item) => ({
      deleteOne: {
        filter: buildMessageKeyFilter(item)
      }
    })));
    for (let index = 0; index < operations.length; index += 300) {
      await chatMessages.bulkWrite(operations.slice(index, index + 300), { ordered: false });
    }
    console.log(JSON.stringify({ appliedUpdates: updates.length, appliedDeletes: deletes.length }, null, 2));
  }

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
