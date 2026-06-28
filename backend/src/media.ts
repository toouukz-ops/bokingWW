import type { MultipartFile } from "@fastify/multipart";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { deleteStoredMedia, saveStoredMediaFile } from "./mediaStore.js";

const mediaModuleDir = dirname(fileURLToPath(import.meta.url));

export const uploadsRoot = resolve(mediaModuleDir, "..", "uploads");
const execFileAsync = promisify(execFile);

const allowedExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".hec",
  ".mp4",
  ".mov",
  ".m4v"
]);

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

  const normalizedExtension = mediaType === "photo" && isHeicExtension(extension)
    ? ".jpg"
    : mediaType === "video"
      ? ".mp4"
      : extension;
  const filename = `${mediaType}-${Date.now()}-${sanitizeSegment(basename(file.filename, extension))}${normalizedExtension}`;
  const destination = join(roomFolder, filename);

  if (mediaType === "photo" && isHeicExtension(extension)) {
    const originalPath = join(roomFolder, `original-${Date.now()}-${sanitizeSegment(file.filename)}`);
    await pipeline(file.file, createWriteStream(originalPath));
    try {
      await convertHeicToJpeg(originalPath, destination);
    } finally {
      await unlink(originalPath).catch(() => undefined);
    }
  } else if (mediaType === "video") {
    const originalPath = join(roomFolder, `original-${Date.now()}-${sanitizeSegment(file.filename)}`);
    await pipeline(file.file, createWriteStream(originalPath));
    try {
      await convertVideoToWhatsappMp4(originalPath, destination);
    } finally {
      await unlink(originalPath).catch(() => undefined);
    }
  } else {
    await pipeline(file.file, createWriteStream(destination));
  }

  const publicPath = `/uploads/rooms/${sanitizeSegment(roomId)}/${filename}`;
  await saveStoredMediaFile(publicPath, destination);

  return {
    mediaType,
    path: publicPath
  };
}

async function convertHeicToJpeg(sourcePath: string, destination: string) {
  try {
    await sharp(sourcePath).rotate().jpeg({ quality: 90 }).toFile(destination);
  } catch {
    await execFileAsync("sips", ["-s", "format", "jpeg", sourcePath, "--out", destination]);
  }
}

export async function ensureWhatsappVideoFile(publicPath: string) {
  const sourcePath = getLocalUploadPath(publicPath);
  if (!sourcePath) {
    throw new Error("Invalid media path");
  }

  const folder = dirname(sourcePath);
  const filename = `whatsapp-${sanitizeSegment(basename(publicPath, extname(publicPath)))}.mp4`;
  const destination = join(folder, filename);
  const publicFolder = publicPath.slice(0, publicPath.lastIndexOf("/") + 1);
  const publicDestination = `${publicFolder}${filename}`;

  if (await fileExists(destination)) {
    return publicDestination;
  }

  await convertVideoToWhatsappMp4(sourcePath, destination);
  await saveStoredMediaFile(publicDestination, destination);
  return publicDestination;
}

async function convertVideoToWhatsappMp4(sourcePath: string, destination: string) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    destination
  ]);
}

async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function cropPhotoFile(roomId: string, publicPath: string, options: CropOptions) {
  const sourcePath = getLocalUploadPath(publicPath);
  if (!sourcePath) {
    throw new Error("Invalid media path");
  }

  const source = sharp(sourcePath).rotate();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Invalid image dimensions");
  }

  const crop = calculateCrop(metadata.width, metadata.height, options.aspectRatio, options.focalX, options.focalY);
  const roomFolder = join(uploadsRoot, "rooms", sanitizeSegment(roomId));
  await mkdir(roomFolder, { recursive: true });

  const filename = `crop-${Date.now()}-${sanitizeSegment(basename(publicPath, extname(publicPath)))}.jpg`;
  const destination = join(roomFolder, filename);

  await source.extract(crop).jpeg({ quality: 90 }).toFile(destination);
  await deleteMediaFile(publicPath);
  const nextPublicPath = `/uploads/rooms/${sanitizeSegment(roomId)}/${filename}`;
  await saveStoredMediaFile(nextPublicPath, destination);

  return nextPublicPath;
}

export async function deleteMediaFile(publicPath: string) {
  const localPath = getLocalUploadPath(publicPath);
  if (!localPath) {
    return;
  }

  await unlink(localPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
  await deleteStoredMedia(publicPath);
}

interface CropOptions {
  aspectRatio: number;
  focalX: number;
  focalY: number;
}

function calculateCrop(width: number, height: number, aspectRatio: number, focalX: number, focalY: number) {
  const sourceRatio = width / height;
  const cropWidth = sourceRatio > aspectRatio ? Math.round(height * aspectRatio) : width;
  const cropHeight = sourceRatio > aspectRatio ? height : Math.round(width / aspectRatio);
  const maxLeft = width - cropWidth;
  const maxTop = height - cropHeight;

  return {
    left: Math.round(maxLeft * clamp(focalX / 100, 0, 1)),
    top: Math.round(maxTop * clamp(focalY / 100, 0, 1)),
    width: cropWidth,
    height: cropHeight
  };
}

export function getLocalUploadPath(publicPath: string) {
  if (!publicPath.startsWith("/uploads/")) {
    return null;
  }

  const localPath = resolve(publicPath.replace(/^\/uploads\//, `${uploadsRoot}/`));
  return localPath.startsWith(uploadsRoot) ? localPath : null;
}

function isHeicExtension(extension: string) {
  return extension === ".heic" || extension === ".heif" || extension === ".hec";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9а-яА-Я._-]/g, "-").slice(0, 80);
}
