import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { guestContactSchema, listGuestContacts, saveGuestContact, type GuestContact } from "./guestContacts.js";
import { uploadsRoot } from "./media.js";
import { saveStoredMediaBuffer } from "./mediaStore.js";
import { getRoom, listRooms, roomSchema, saveRoom, type Room } from "./rooms.js";

export type ServerBackupPayload = {
  guestContacts?: GuestContact[];
  mediaFiles?: Array<{ dataBase64: string; path: string }>;
  rooms?: Room[];
};

export type ServerBackupExportOptions = {
  includeGuestContacts?: boolean;
  includeMedia?: boolean;
  includeRooms?: boolean;
};

export type BackupImportReport = {
  conflicts: number;
  imported: number;
  skipped: number;
};

export async function exportServerBackup(options: ServerBackupExportOptions = {}) {
  const includeRooms = options.includeRooms ?? true;
  const includeGuestContacts = options.includeGuestContacts ?? true;
  const includeMedia = options.includeMedia ?? true;
  const sourceRooms = includeRooms || includeMedia ? await listRooms() : [];
  const guestContacts = includeGuestContacts ? await listGuestContacts() : [];
  const mediaFiles = includeMedia ? await readBackupMediaFiles(sourceRooms) : [];

  return {
    exportedAt: new Date().toISOString(),
    guestContacts,
    mediaFiles,
    rooms: includeRooms ? sourceRooms : [],
    version: 1
  };
}

export async function importServerBackup(payload: ServerBackupPayload): Promise<Record<string, BackupImportReport>> {
  const mediaReport = await importBackupMediaFiles(payload.mediaFiles ?? []);
  const roomsReport = await importBackupRooms(payload.rooms ?? []);
  const contactsReport = await importBackupGuestContacts(payload.guestContacts ?? []);

  return {
    guestContacts: contactsReport,
    mediaFiles: mediaReport,
    rooms: roomsReport
  };
}

async function readBackupMediaFiles(rooms: Room[]) {
  const paths = Array.from(new Set(rooms.flatMap((room) => room.photoPaths.concat(room.videoPaths)).filter(Boolean)));
  const files: Array<{ dataBase64: string; path: string }> = [];

  for (const path of paths) {
    const localPath = getSafeUploadPath(path);
    if (!localPath) continue;

    try {
      const data = await readFile(localPath);
      files.push({ path, dataBase64: data.toString("base64") });
    } catch {
      continue;
    }
  }

  return files;
}

async function importBackupMediaFiles(files: Array<{ dataBase64: string; path: string }>): Promise<BackupImportReport> {
  const report = createImportReport();

  for (const file of files) {
    const localPath = getSafeUploadPath(file.path);
    if (!localPath || !file.dataBase64) {
      report.skipped += 1;
      continue;
    }

    try {
      const data = Buffer.from(file.dataBase64, "base64");
      await mkdir(dirname(localPath), { recursive: true });
      await writeFile(localPath, data, { flag: "wx" });
      await saveStoredMediaBuffer(file.path, data);
      report.imported += 1;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        await saveStoredMediaBuffer(file.path, Buffer.from(file.dataBase64, "base64"));
        report.skipped += 1;
      } else {
        report.conflicts += 1;
      }
    }
  }

  return report;
}

async function importBackupRooms(rooms: Room[]): Promise<BackupImportReport> {
  const report = createImportReport();

  for (const room of rooms) {
    const parsed = roomSchema.safeParse(room);
    if (!parsed.success || !parsed.data.id) {
      report.skipped += 1;
      continue;
    }

    const existing = await getRoom(parsed.data.id);
    if (existing) {
      report.skipped += 1;
      continue;
    }

    try {
      await saveRoom(parsed.data);
      report.imported += 1;
    } catch {
      report.conflicts += 1;
    }
  }

  return report;
}

async function importBackupGuestContacts(contacts: GuestContact[]): Promise<BackupImportReport> {
  const report = createImportReport();
  const existingPhones = new Set((await listGuestContacts()).map((contact) => normalizePhone(contact.phone)));

  for (const contact of contacts) {
    const parsed = guestContactSchema.safeParse(contact);
    if (!parsed.success) {
      report.skipped += 1;
      continue;
    }

    const phone = normalizePhone(parsed.data.phone);
    if (!phone || existingPhones.has(phone)) {
      report.skipped += 1;
      continue;
    }

    try {
      await saveGuestContact(parsed.data);
      existingPhones.add(phone);
      report.imported += 1;
    } catch {
      report.conflicts += 1;
    }
  }

  return report;
}

function createImportReport(): BackupImportReport {
  return {
    conflicts: 0,
    imported: 0,
    skipped: 0
  };
}

function getSafeUploadPath(publicPath: string) {
  if (!publicPath.startsWith("/uploads/")) return null;
  const localPath = resolve(publicPath.replace(/^\/uploads\//, `${uploadsRoot}/`));
  return localPath.startsWith(uploadsRoot) ? localPath : null;
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}
