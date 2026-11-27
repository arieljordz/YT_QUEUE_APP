/* global process */
// Shared MongoDB helpers for the serverless functions. The file name starts
// with "_" so Vercel does not expose it as an endpoint.
import { MongoClient } from "mongodb";

// The saved list that holds videos the user found with Search and queued one by one.
export const SEARCHES_LIST = "My Searches";
export const isSearchesList = (name) =>
  typeof name === "string" && name.trim().toLowerCase() === SEARCHES_LIST.toLowerCase();

// Reused between invocations of a warm function instead of reconnecting each time.
let clientPromise;
let preparePromise;

export async function getDb() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
  clientPromise ??= new MongoClient(process.env.MONGODB_URI).connect();
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB || "yt_queue-db");
  preparePromise ??= prepareDatabase(db).catch((error) => {
    // Never blocks the app: the next cold start tries again.
    console.error("preparing the database failed", error);
    preparePromise = undefined;
  });
  await preparePromise;
  return db;
}

/**
 * The collections, by what they hold:
 *   rooms              one per room: name, avatar, PIN hash, favorites, history,
 *                      library counters, the player lease
 *   room_queues        one per room (_id = room id): the queue, pause/repeat, the
 *                      player position, and `rev` (goes up on every change)
 *   room_library       one per video in a room's library (see library.js)
 *   room_playlists     one per playlist (see playlists.js)
 *   saved_list_videos  one per video of a saved list, shared by every room
 *                      (Import Videos saves them, Add Library adds them; catalog.js)
 *   app_settings       feature flags, the admin password
 *   room_sessions, admin_sessions, room_presence, room_attempts: short-lived sign-in data
 */
export const COLLECTIONS = {
  rooms: "rooms",
  queues: "room_queues",
  library: "room_library",
  playlists: "room_playlists",
  savedLists: "saved_list_videos",
  settings: "app_settings",
};
// Older names of renamed collections (also the names in older backup files).
export const OLD_NAMES = { library_videos: COLLECTIONS.library, catalog_videos: COLLECTIONS.savedLists };
// The queue fields that used to live in the room document.
const QUEUE_FIELDS = ["queue", "isPaused", "isRepeat", "rev", "progress"];

/**
 * Brings a database from an older version of the app up to date. Safe to run
 * any number of times, also by two servers at once: renames the old
 * collections, and moves each room's queue out of the room document.
 */
async function migrate(db) {
  const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const [from, to] of Object.entries(OLD_NAMES)) {
    if (!names.has(from)) continue;
    try {
      // A rename keeps the documents and the indexes, in one step.
      if (!names.has(to)) {
        await db.collection(from).rename(to);
        continue;
      }
    } catch (error) {
      if (error?.code === 26) continue; // NamespaceNotFound: another server renamed it first
    }
    // Both exist (or renaming isn't allowed): copy what the new one lacks, then drop the old one.
    await db
      .collection(from)
      .aggregate([{ $merge: { into: to, on: "_id", whenMatched: "keepExisting", whenNotMatched: "insert" } }])
      .toArray();
    await db.collection(from).drop().catch(() => {});
  }
  await moveQueues(db);
}

/**
 * Moves queues still kept in room documents (older app versions, older backup
 * files) into room_queues. A queue already in room_queues is newer and stays.
 */
export async function moveQueues(db) {
  const rooms = db.collection(COLLECTIONS.rooms);
  const inRoom = { queue: { $exists: true } };
  if ((await rooms.countDocuments(inRoom, { limit: 1 })) === 0) return;
  await rooms
    .aggregate([
      { $match: inRoom },
      { $project: Object.fromEntries([...QUEUE_FIELDS, "updatedAt"].map((f) => [f, 1])) },
      { $merge: { into: COLLECTIONS.queues, on: "_id", whenMatched: "keepExisting", whenNotMatched: "insert" } },
    ])
    .toArray();
  await rooms.updateMany(inRoom, { $unset: Object.fromEntries([...QUEUE_FIELDS, "played"].map((f) => [f, ""])) });
}

/**
 * Every index the app's queries rely on, in one place. Created once per cold
 * start (creating an index that already exists is a no-op), so a collection
 * made by a restore, or emptied, always gets them back.
 *
 *   rooms              slot (unique)               room list; one room per slot
 *   room_queues        _id only                    one document per room
 *   room_library       roomId+seq                  "changes since N" (sync)
 *                      roomId+removed              counting a room's live videos
 *   room_playlists     roomId+updatedAt            a room's playlists, newest first
 *   saved_list_videos  owner+catalog+order         "My Searches" pages; deleting a room's list
 *                      catalog+order               a list's pages
 *                      catalog+videoId+owner       list overview and ids (covers both)
 *                      owner+videoId               a library removal reaching saved lists
 *   *_sessions         expiresAt (TTL)             sign-ins clean themselves up
 *   room_presence      lastSeen (TTL 10 min)
 *   room_attempts      updatedAt (TTL 1 day)       wrong-PIN counters
 */
export const CATALOG_OVERVIEW_INDEX = "catalog_video_owner";

export async function prepareDatabase(db) {
  // A failed migration is tried again on the next cold start; the indexes still get made.
  await migrate(db).catch((error) => console.error("migrating the database failed", error));
  const catalog = db.collection(COLLECTIONS.savedLists);
  const library = db.collection(COLLECTIONS.library);
  // One index that can't be made (for example two rooms in one slot) must not stop the others.
  const results = await Promise.allSettled([
    db.collection("rooms").createIndex(
      { slot: 1 },
      { unique: true, partialFilterExpression: { slot: { $exists: true } } }
    ),
    library.createIndex({ roomId: 1, seq: 1 }),
    library.createIndex({ roomId: 1, removed: 1 }),
    db.collection("room_playlists").createIndex({ roomId: 1, updatedAt: -1 }),
    catalog.createIndex({ owner: 1, catalog: 1, order: 1 }),
    catalog.createIndex({ catalog: 1, order: 1 }),
    catalog.createIndex({ catalog: 1, "video.id.videoId": 1, owner: 1 }, { name: CATALOG_OVERVIEW_INDEX }),
    catalog.createIndex({ owner: 1, "video.id.videoId": 1 }),
    db.collection("room_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("admin_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("room_presence").createIndex({ lastSeen: 1 }, { expireAfterSeconds: 600 }),
    db.collection("room_attempts").createIndex({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 }),
  ]);
  for (const r of results) if (r.status === "rejected") console.error("creating an index failed", r.reason);
  // Older versions of this file made catalog+videoId; catalog+videoId+owner replaces it.
  await catalog.dropIndex("catalog_1_video.id.videoId_1").catch(() => {});
  // Wrong-PIN counters from before they had updatedAt, and not locked now.
  await db.collection("room_attempts").deleteMany({ updatedAt: { $exists: false }, lockedUntil: { $lt: Date.now() } });
  // Rooms keep their library in room_library. The old one-array copy left in
  // the room document made every queue change rewrite megabytes.
  await db.collection("rooms").updateMany(
    { libraryMoved: true, $or: [{ library: { $exists: true } }, { removals: { $exists: true } }] },
    { $unset: { library: "", removals: "" } }
  );
}

/** The rooms: name, avatar, PIN hash, favorites, history (see COLLECTIONS above). */
export async function getRooms() {
  return (await getDb()).collection(COLLECTIONS.rooms);
}

/** Each room's queue, one document per room (see queue.js). */
export async function getRoomQueues() {
  return (await getDb()).collection(COLLECTIONS.queues);
}

/** Saved lists (Import Videos, Add Library), one document per video, shared by every room. */
export async function getSavedListVideos() {
  return (await getDb()).collection(COLLECTIONS.savedLists);
}

/** Each room's personal playlists, one document per playlist (see playlists.js). */
export async function getPlaylists() {
  return (await getDb()).collection(COLLECTIONS.playlists);
}

/** Each room's library, one document per video (see library.js). */
export async function getRoomLibrary() {
  return (await getDb()).collection(COLLECTIONS.library);
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
