import type { MultipartFile } from "@fastify/multipart";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

export const uploadsRoot = resolve("uploads");

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".m4v"]);

export function getMediaType(file: MultipartFile): "photo" | "video" | null {
  if (file.mimetype.startsWith("image/")) return "photo";
  if (file.mimetype.startsWith("video/")) return "video";
  return null;
}

export async function saveRoomMediaFile(roomId: string, file: MultipartFile) {
  const mediaType = getMediaType(file);
  if (!mediaType) {
    throw new Error("Unsupported media type");
  }

  const extension = extname(file.filename).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    throw new Error("Unsupported file extension");
  }

  const roomFolder = join(uploadsRoot, "rooms", sanitizeSegment(roomId));
  await mkdir(roomFolder, { recursive: true });

  const filename = `${mediaType}-${Date.now()}-${sanitizeSegment(basename(file.filename, extension))}${extension}`;
  const destination = join(roomFolder, filename);
  await pipeline(file.file, createWriteStream(destination));

  return {
    mediaType,
    path: `/uploads/rooms/${sanitizeSegment(roomId)}/${filename}`
  };
}

export async function deleteMediaFile(publicPath: string) {
  if (!publicPath.startsWith("/uploads/")) {
    return;
  }

  const localPath = resolve(publicPath.replace(/^\/uploads\//, `${uploadsRoot}/`));
  if (!localPath.startsWith(uploadsRoot)) {
    return;
  }

  await unlink(localPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, "-").slice(0, 80);
}
