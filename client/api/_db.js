/* global process */
// Shared MongoDB helpers for the serverless functions. The file name starts
// with "_" so Vercel does not expose it as an endpoint.
import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";

export const MIN_CODE_LENGTH = 8;

// Reused between invocations of a warm function instead of reconnecting each time.
let clientPromise;

export async function getRooms() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  clientPromise ??= new MongoClient(process.env.MONGODB_URI).connect();
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "yt_queue").collection("rooms");
}

/** Room id = hash of the sync code, so the code itself is never stored. */
export function roomIdFor(code) {
  return createHash("sha256").update(code).digest("hex");
}

/** Returns the sync code from the request, or null if it is missing or too short. */
export function readSyncCode(req) {
  const code = req.headers["x-sync-code"];
  return typeof code === "string" && code.length >= MIN_CODE_LENGTH ? code : null;
}

// Keep only what the UI needs so documents stay small.
export function slimVideo(video) {
  const id = video?.id?.videoId;
  const snippet = video?.snippet;
  if (typeof id !== "string" || !id || typeof snippet?.title !== "string") return null;
  const thumbs = snippet.thumbnails ?? {};
  const thumbnails = {};
  if (typeof thumbs.default?.url === "string") thumbnails.default = { url: thumbs.default.url };
  if (typeof thumbs.medium?.url === "string") thumbnails.medium = { url: thumbs.medium.url };
  if (!thumbnails.default && !thumbnails.medium) return null;
  return {
    id: { videoId: id },
    snippet: {
      title: snippet.title,
      channelTitle: typeof snippet.channelTitle === "string" ? snippet.channelTitle : "",
      thumbnails,
    },
  };
}

export function slimQueueItem(video) {
  const slim = slimVideo(video);
  if (!slim) return null;
  return typeof video.queueId === "string" ? { ...slim, queueId: video.queueId } : slim;
}
