import { z } from "zod";
import { db } from "./db.js";

export const guestContactSchema = z.object({
  phone: z.string().min(1),
  appeal: z.string().min(1),
  inquiryDate: z.string().datetime()
});

export type GuestContact = z.infer<typeof guestContactSchema>;

interface GuestContactDocument extends GuestContact {
  createdAt: Date;
  updatedAt: Date;
}

const guestContacts = db.collection<GuestContactDocument>("guestContacts");

export async function listGuestContacts(): Promise<GuestContact[]> {
  const documents = await guestContacts.find({}, { maxTimeMS: 5000 }).sort({ inquiryDate: -1 }).limit(5000).toArray();
  return documents.map(mapGuestContactDocument);
}

export async function getGuestContact(phone: string): Promise<GuestContact | null> {
  const normalizedPhone = normalizeGuestPhone(phone);
  const document = await guestContacts.findOne({ phone: normalizedPhone }, { maxTimeMS: 3000 });
  if (document) return mapGuestContactDocument(document);

  const digits = normalizedPhone.replace(/\D/g, "");
  if (!/^7\d{10}$/.test(digits)) return null;
  const legacyDocument = await guestContacts
    .find({ phone: { $regex: `^\\+?${digits}\\d+` } }, { maxTimeMS: 3000 })
    .sort({ updatedAt: -1 })
    .limit(1)
    .next();
  if (legacyDocument) return mapGuestContactDocument(legacyDocument);
  return document ? mapGuestContactDocument(document) : null;
}

export async function saveGuestContact(contact: GuestContact): Promise<GuestContact> {
  const now = new Date();
  const normalizedPhone = normalizeGuestPhone(contact.phone);
  const normalizedContact = {
    ...contact,
    phone: normalizedPhone,
    appeal: normalizeGuestAppeal(contact.appeal, normalizedPhone)
  };

  await guestContacts.updateOne(
    { phone: normalizedContact.phone },
    {
      $set: {
        ...normalizedContact,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true, maxTimeMS: 5000 }
  );

  return normalizedContact;
}

export async function deleteGuestContact(phone: string): Promise<void> {
  await guestContacts.deleteOne({ phone: normalizeGuestPhone(phone) }, { maxTimeMS: 5000 });
}

function mapGuestContactDocument(document: GuestContactDocument): GuestContact {
  const phone = normalizeGuestPhone(document.phone);
  return {
    phone,
    appeal: normalizeGuestAppeal(document.appeal, phone),
    inquiryDate: document.inquiryDate
  };
}

function normalizeGuestPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value.trim();
  if (digits.startsWith("7") && digits.length > 11) return "";
  if (/^8\d{10}$/.test(digits)) {
    return `+7${digits.slice(1)}`;
  }
  if (/^7\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+7${digits}`;
  return `+${digits}`;
}

function normalizeGuestAppeal(value: string, phone: string) {
  const fallbackName = getGuestNameFallbackFromPhone(phone);
  const trimmedValue = value.trim();
  if (/^Гость\s+\d{4}$/i.test(trimmedValue) && fallbackName) return fallbackName;
  return trimmedValue || fallbackName || phone;
}

function getGuestNameFallbackFromPhone(phone: string) {
  const digits = normalizeGuestPhone(phone).replace(/\D/g, "");
  return digits.length >= 4 ? `Гость ${digits.slice(-4)}` : "";
}
