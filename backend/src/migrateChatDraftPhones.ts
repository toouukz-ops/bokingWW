import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnyBulkWriteOperation, ObjectId } from "mongodb";
import { canonicalizeChatDraftIdentity } from "./chatDraftDomain.js";
import { db, mongoClient } from "./db.js";

type DraftDocument = {
  _id: ObjectId;
  chatId: string;
  draft: Record<string, unknown>;
  updatedAt?: Date;
};

const apply = process.argv.includes("--apply");
const collection = db.collection<DraftDocument>("chatDrafts");

try {
  await mongoClient.connect();
  const documents = await collection.find().toArray();
  const groups = new Map<string, DraftDocument[]>();

  for (const document of documents) {
    if (!isMalformedKazakhstanPhoneChatId(document.chatId)) continue;
    const identity = canonicalizeChatDraftIdentity(document.chatId, document.draft);
    groups.set(identity.chatId, (groups.get(identity.chatId) ?? []).concat(document));
  }

  for (const [canonicalChatId, malformedDocuments] of groups) {
    const canonicalDocument = documents.find((document) => document.chatId === canonicalChatId);
    if (canonicalDocument) groups.set(canonicalChatId, malformedDocuments.concat(canonicalDocument));
  }

  const affectedDocuments = uniqueDocuments(Array.from(groups.values()).flat());
  const report = {
    apply,
    canonicalGroups: groups.size,
    documentsToRemove: affectedDocuments.filter((document) =>
      canonicalizeChatDraftIdentity(document.chatId, document.draft).chatId !== document.chatId
    ).length,
    documentsBackedUp: affectedDocuments.length,
    groupsWithReservation: Array.from(groups.values()).filter((items) =>
      items.some((item) => isRecord(item.draft.lastReservation))
    ).length,
    groupsWithStatus: Array.from(groups.values()).filter((items) =>
      items.some((item) => hasMeaningfulStatus(item.draft))
    ).length
  };

  console.log(JSON.stringify(report, null, 2));
  if (!apply || !groups.size) process.exitCode = 0;
  else {
    const backupDirectory = path.resolve("data", "migration-backups");
    await mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `chat-drafts-phone-normalization-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );
    await writeFile(backupPath, JSON.stringify({
      createdAt: new Date().toISOString(),
      report,
      documents: affectedDocuments
    }, null, 2));

    const batches = chunk(Array.from(groups.entries()), 20);
    for (const [batchIndex, batch] of batches.entries()) {
      const session = mongoClient.startSession();
      try {
        await session.withTransaction(async () => {
          const operations: AnyBulkWriteOperation<DraftDocument>[] = [];
          for (const [canonicalChatId, items] of batch) {
          const mergedDraft = mergeDraftGroup(canonicalChatId, items);
          const latestUpdatedAt = items.reduce(
            (latest, item) => item.updatedAt && item.updatedAt > latest ? item.updatedAt : latest,
            new Date(0)
          );
            operations.push({
              updateOne: {
                filter: { chatId: canonicalChatId },
                update: {
                  $set: {
                    chatId: canonicalChatId,
                    draft: mergedDraft,
                    updatedAt: latestUpdatedAt.getTime() ? latestUpdatedAt : new Date()
                  }
                },
                upsert: true
              }
            });
            const malformedIds = items
              .filter((item) => item.chatId !== canonicalChatId)
              .map((item) => item._id);
            if (malformedIds.length) {
              operations.push({
                deleteMany: {
                  filter: { _id: { $in: malformedIds } }
                }
              });
            }
          }
          if (operations.length) {
            await collection.bulkWrite(operations, { ordered: true, session });
          }
        });
        console.log(JSON.stringify({
          batch: batchIndex + 1,
          batches: batches.length,
          canonicalGroupsApplied: batch.length
        }));
      } finally {
        await session.endSession();
      }
    }
    console.log(JSON.stringify({ applied: true, backupPath }, null, 2));
  }
} finally {
  await mongoClient.close();
}

function mergeDraftGroup(canonicalChatId: string, items: DraftDocument[]) {
  const sorted = items.slice().sort((left, right) =>
    draftDate(right).localeCompare(draftDate(left))
  );
  const latest = sorted[0]?.draft ?? {};
  const merged: Record<string, unknown> = { ...latest };

  for (const item of sorted.slice(1)) {
    for (const [key, value] of Object.entries(item.draft)) {
      if (isMissingValue(merged[key]) && !isMissingValue(value)) merged[key] = value;
    }
  }

  const reservationSource = sorted.find((item) => isRecord(item.draft.lastReservation));
  if (reservationSource) {
    merged.lastReservation = reservationSource.draft.lastReservation;
    merged.agreementEverSent = true;
  }

  const statusSource = sorted
    .filter((item) => hasMeaningfulStatus(item.draft))
    .sort((left, right) => statusDate(right.draft).localeCompare(statusDate(left.draft)))[0];
  if (statusSource) {
    for (const key of [
      "agreementEverSent",
      "agreementSent",
      "catalogStatus",
      "catalogStatusAt",
      "chatStartedAt",
      "manualStatus",
      "manualStatusAt"
    ]) {
      if (key in statusSource.draft) merged[key] = statusSource.draft[key];
    }
  }

  const normalized = canonicalizeChatDraftIdentity(canonicalChatId, merged);
  return {
    ...normalized.draft,
    updatedAt: sorted.map((item) => draftDate(item)).filter(Boolean).sort().at(-1) ?? ""
  };
}

function hasMeaningfulStatus(draft: Record<string, unknown>) {
  return Boolean(
    typeof draft.manualStatus === "string" ||
    draft.agreementEverSent ||
    draft.agreementSent ||
    draft.catalogStatus ||
    draft.chatStartedAt ||
    isRecord(draft.lastReservation)
  );
}

function statusDate(draft: Record<string, unknown>) {
  return stringValue(draft.manualStatusAt) ||
    stringValue(draft.catalogStatusAt) ||
    stringValue(draft.chatStartedAt) ||
    draftDate({ draft } as DraftDocument);
}

function draftDate(document: DraftDocument) {
  return stringValue(document.draft.updatedAt) ||
    document.updatedAt?.toISOString() ||
    "";
}

function isMissingValue(value: unknown) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return isRecord(value) && Object.keys(value).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isMalformedKazakhstanPhoneChatId(chatId: string) {
  if (!chatId.startsWith("phone:")) return false;
  const digits = chatId.slice("phone:".length).replace(/\D/g, "");
  return digits.startsWith("7") && digits.length > 11;
}

function uniqueDocuments(documents: DraftDocument[]) {
  const seen = new Set<string>();
  return documents.filter((document) => {
    const id = String(document._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );
}
