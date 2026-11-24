/* global process */
// Shared MongoDB helpers for the serverless functions. The file name starts
// with "_" so Vercel does not expose it as an endpoint.
import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";

export const MIN_CODE_LENGTH = 8;

// The saved list that holds videos the user found with Search and queued one by one.
export const SEARCHES_LIST = "My Searches";
export const isSearchesList = (name) =>
  typeof name === "string" && name.trim().toLowerCase() === SEARCHES_LIST.toLowerCase();

// Reused between invocations of a warm function instead of reconnecting each time.
let clientPromise;

async function getDb() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  clientPromise ??= new MongoClient(process.env.MONGODB_URI).connect();
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB || "yt_queue-db");
}

/** Per-sync-code state (queue, library). */
export async function getRooms() {
  return (await getDb()).collection("rooms");
}

/** Shared catalogs of videos (for example karaoke lists), one document per video. */
export async function getCatalog() {
  return (await getDb()).collection("catalog_videos");
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

// Keep only what the UI needs so documents stay small. Titles are stored as
// plain text: YouTube's HTML entities are decoded here, for every video saved.
const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  middot: "·", bull: "•",
};

/** YouTube sends titles with HTML entities (&#39; &amp; &quot;); turn them into plain characters. */
export function decodeEntities(value) {
  if (typeof value !== "string") return value;
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const num = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      try {
        return String.fromCodePoint(num);
      } catch {
        return match; // not a real character
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

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
      title: decodeEntities(snippet.title),
      channelTitle:
        typeof snippet.channelTitle === "string" ? decodeEntities(snippet.channelTitle) : "",
      thumbnails,
    },
  };
}

export function slimQueueItem(video) {
  const slim = slimVideo(video);
  if (!slim) return null;
  return typeof video.queueId === "string" ? { ...slim, queueId: video.queueId } : slim;
}
