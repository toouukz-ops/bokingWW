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

export async function saveGuestContact(contact: GuestContact): Promise<GuestContact> {
  const now = new Date();
  const normalizedContact = {
    ...contact,
    phone: normalizeGuestPhone(contact.phone)
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
  return {
    phone: normalizeGuestPhone(document.phone),
    appeal: document.appeal,
    inquiryDate: document.inquiryDate
  };
}

function normalizeGuestPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value.trim();
  if (/^8\d{10}$/.test(digits)) return `+7${digits.slice(1)}`;
  if (/^7\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+7${digits}`;
  return `+${digits}`;
}
