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
  const documents = await guestContacts.find().sort({ inquiryDate: -1 }).toArray();
  return documents.map(mapGuestContactDocument);
}

export async function saveGuestContact(contact: GuestContact): Promise<GuestContact> {
  const now = new Date();

  await guestContacts.updateOne(
    { phone: contact.phone },
    {
      $set: {
        ...contact,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return contact;
}

export async function deleteGuestContact(phone: string): Promise<void> {
  await guestContacts.deleteOne({ phone });
}

function mapGuestContactDocument(document: GuestContactDocument): GuestContact {
  return {
    phone: document.phone,
    appeal: document.appeal,
    inquiryDate: document.inquiryDate
  };
}
