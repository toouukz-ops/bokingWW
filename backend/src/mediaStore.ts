import { GridFSBucket, ObjectId } from "mongodb";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "./db.js";

const bucket = new GridFSBucket(db, { bucketName: "mediaFiles" });

export async function saveStoredMediaBuffer(publicPath: string, data: Buffer) {
  await deleteStoredMedia(publicPath);
  await pipeline(
    Readable.from(data),
    bucket.openUploadStream(publicPath, {
      contentType: getMediaContentType(publicPath),
      metadata: {
        contentType: getMediaContentType(publicPath),
        publicPath
      }
    })
  );
}

export async function saveStoredMediaFile(publicPath: string, localPath: string) {
  await deleteStoredMedia(publicPath);
  await pipeline(
    createReadStream(localPath),
    bucket.openUploadStream(publicPath, {
      contentType: getMediaContentType(publicPath),
      metadata: {
        contentType: getMediaContentType(publicPath),
        publicPath
      }
    })
  );
}

export async function saveStoredMediaFileFromDisk(publicPath: string, localPath: string) {
  const data = await readFile(localPath);
  await saveStoredMediaBuffer(publicPath, data);
}

export async function deleteStoredMedia(publicPath: string) {
  const files = await bucket.find({ filename: publicPath }).toArray();
  await Promise.all(files.map((file) => bucket.delete(file._id as ObjectId).catch(() => undefined)));
}

export async function getStoredMedia(publicPath: string) {
  return bucket.find({ filename: publicPath }).sort({ uploadDate: -1 }).next();
}

export function openStoredMediaStream(id: ObjectId) {
  return bucket.openDownloadStream(id);
}

export function getMediaContentType(publicPath: string) {
  const extension = extname(publicPath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".mp4" || extension === ".m4v") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  return "application/octet-stream";
}
