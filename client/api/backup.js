// Vercel serverless function: backing up and restoring the database (admin
// only, unless the "settingsPassword" feature flag is off).
//
// A backup is the app's data collections, read a page at a time and put
// together in the browser (a Vercel response is limited to about 4.5 MB):
//   POST { action: "info" }                        -> { collections: [{ name, count }] }
//   POST { action: "export", collection, after }   -> { docs, next }   (docs in Extended JSON)
//
// A restore uploads the file a page at a time into staging collections, and
// only swaps them in at the end, so a failed or interrupted upload changes
// nothing:
//   POST { action: "restoreStart" }                                  -> { ok }
//   POST { action: "restoreChunk", collection, docs }                -> { ok }
//   POST { action: "restoreFinish", counts: { [collection]: n } }    -> { restored: { [collection]: n } }
//
// Clearing the database (to try a restore, or start over) keeps the rooms
// themselves (name, avatar, description, PIN) and the admin password, and
// deletes everything else. The body must say confirm: "CLEAR".
//   POST { action: "clear", confirm: "CLEAR" }   -> { cleared: { [what]: n } }
//
// Not backed up: sign-ins, PIN attempts and presence (they only matter right
// now), and the admin password, which a restore keeps as it is, so restoring
// an old backup never locks the admin out.
import { BSON } from "mongodb";
import { getDb } from "./_db.js";
import { requireSettingsAccess } from "./flags.js";

const { EJSON } = BSON;
export const BACKUP_COLLECTIONS = ["rooms", "library_videos", "room_playlists", "catalog_videos", "app_settings"];
const ADMIN_DOC = "admin"; // in app_settings
const PAGE_SIZE = 1000;
// A page also stops at about this many bytes, well under the response limit.
const PAGE_BYTES = 2_500_000;
const MAX_CHUNK = 1000;
const STAGING = (name) => `restore_staging_${name}`;

const bad = (error) => ({ status: 400, body: { error } });
const known = (name) => BACKUP_COLLECTIONS.includes(name);
/** What the backup leaves out of a collection. */
const skipFilter = (name) => (name === "app_settings" ? { _id: { $ne: ADMIN_DOC } } : {});

async function collectionNames(db) {
  return new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
}

async function info(db) {
  const collections = [];
  for (const name of BACKUP_COLLECTIONS) {
    collections.push({ name, count: await db.collection(name).countDocuments(skipFilter(name)) });
  }
  return { status: 200, body: { collections } };
}

async function exportPage(db, { collection, after }) {
  if (!known(collection)) return bad("Unknown collection");
  const filter = { ...skipFilter(collection) };
  // `after` is the last _id of the previous page, in Extended JSON.
  if (after !== undefined && after !== null) {
    const lastId = EJSON.deserialize({ v: after }).v;
    filter._id = { ...(filter._id ?? {}), $gt: lastId };
  }
  const cursor = db.collection(collection).find(filter).sort({ _id: 1 }).limit(PAGE_SIZE + 1);
  const docs = [];
  let bytes = 0;
  let more = false;
  for await (const doc of cursor) {
    const out = EJSON.serialize(doc);
    const size = JSON.stringify(out).length;
    if (docs.length === PAGE_SIZE || (docs.length > 0 && bytes + size > PAGE_BYTES)) {
      more = true;
      break;
    }
    docs.push({ out, id: doc._id });
    bytes += size;
  }
  await cursor.close();
  const next = more ? EJSON.serialize({ v: docs.at(-1).id }).v : null;
  return { status: 200, body: { docs: docs.map((d) => d.out), next } };
}

async function dropStaging(db) {
  const existing = await collectionNames(db);
  for (const name of BACKUP_COLLECTIONS) {
    if (existing.has(STAGING(name))) await db.collection(STAGING(name)).drop();
  }
}

async function restoreStart(db) {
  await dropStaging(db);
  for (const name of BACKUP_COLLECTIONS) await db.createCollection(STAGING(name));
  return { status: 200, body: { ok: true } };
}

async function restoreChunk(db, { collection, docs }) {
  if (!known(collection)) return bad("Unknown collection");
  if (!Array.isArray(docs) || docs.length === 0 || docs.length > MAX_CHUNK) return bad("Invalid documents");
  let parsed;
  try {
    parsed = EJSON.deserialize(docs);
  } catch {
    return bad("The backup file has a document that can't be read.");
  }
  if (parsed.some((d) => !d || typeof d !== "object" || d._id === undefined)) {
    return bad("The backup file has a document without an _id.");
  }
  if (collection === "app_settings") parsed = parsed.filter((d) => d._id !== ADMIN_DOC);
  if (!(await collectionNames(db)).has(STAGING(collection))) {
    return { status: 409, body: { error: "The restore was interrupted. Start it again." } };
  }
  if (parsed.length) await db.collection(STAGING(collection)).insertMany(parsed, { ordered: false });
  return { status: 200, body: { ok: true } };
}

async function restoreFinish(db, { counts }) {
  if (!counts || typeof counts !== "object") return bad("Invalid counts");
  const existing = await collectionNames(db);
  if (BACKUP_COLLECTIONS.some((name) => !existing.has(STAGING(name)))) {
    return { status: 409, body: { error: "The restore was interrupted. Start it again." } };
  }
  // Every page must have arrived before anything is replaced.
  const restored = {};
  for (const name of BACKUP_COLLECTIONS) {
    const staged = await db.collection(STAGING(name)).countDocuments(skipFilter(name));
    const expected = Number(counts[name] ?? 0);
    if (staged !== expected) {
      await dropStaging(db);
      return { status: 409, body: { error: `Only ${staged} of ${expected} ${name} documents arrived. Nothing was changed; try again.` } };
    }
    restored[name] = staged;
  }
  // Keep the current admin password.
  const admin = await db.collection("app_settings").findOne({ _id: ADMIN_DOC });
  if (admin) await db.collection(STAGING("app_settings")).replaceOne({ _id: ADMIN_DOC }, admin, { upsert: true });
  // The rooms' sync counters (queue rev, library epoch) as the devices know them now.
  const before = new Map(
    (await db.collection("rooms").find({}, { projection: { rev: 1, libraryEpoch: 1 } }).toArray()).map((r) => [String(r._id), r])
  );
  // $out swaps each collection in one step and keeps the indexes it already has.
  for (const name of BACKUP_COLLECTIONS) {
    await db.collection(STAGING(name)).aggregate([{ $out: name }]).toArray();
  }
  // Put each room's counters above both the old and the current values, so
  // every device takes the restored queue and library instead of keeping (or
  // sending back) its own.
  const rooms = db.collection("rooms");
  for (const room of await rooms.find({}, { projection: { rev: 1, libraryEpoch: 1 } }).toArray()) {
    const now = before.get(String(room._id));
    const above = (field) => Math.max(Number(room[field]) || 0, Number(now?.[field]) || 0) + 1;
    await rooms.updateOne({ _id: room._id }, { $set: { rev: above("rev"), libraryEpoch: above("libraryEpoch") } });
  }
  await dropStaging(db);
  return { status: 200, body: { restored } };
}

/**
 * Deletes everything but the rooms and the admin password. Each room loses its
 * queue, player position, favorites and history, and its library epoch goes up
 * (like Delete all in library.js), so devices drop their copy of the library
 * instead of sending it back. Feature flags go back to their defaults.
 */
async function clearDatabase(db, { confirm }) {
  if (confirm !== "CLEAR") return bad('Type CLEAR to confirm.');
  const now = new Date();
  const rooms = await db.collection("rooms").updateMany(
    { slot: { $exists: true } },
    {
      $set: { queue: [], isPaused: true, isRepeat: false, favorites: [], history: [], libraryMoved: true, updatedAt: now },
      $inc: { rev: 1, libraryEpoch: 1 },
      // library/removals: the old one-array library; flags: the old per-room flags.
      $unset: { progress: "", played: "", library: "", removals: "", flags: "" },
    }
  );
  const count = async (name, filter = {}) => (await db.collection(name).deleteMany(filter)).deletedCount;
  const cleared = {
    rooms: rooms.modifiedCount,
    library_videos: await count("library_videos"),
    room_playlists: await count("room_playlists"),
    catalog_videos: await count("catalog_videos"),
    app_settings: await count("app_settings", skipFilter("app_settings")),
  };
  return { status: 200, body: { cleared } };
}

/** Core logic, separated from the HTTP layer. */
export async function handleBackup(db, body) {
  const { action } = body ?? {};
  if (action === "clear") return clearDatabase(db, body);
  if (action === "info") return info(db);
  if (action === "export") return exportPage(db, body);
  if (action === "restoreStart") return restoreStart(db);
  if (action === "restoreChunk") return restoreChunk(db, body);
  if (action === "restoreFinish") return restoreFinish(db, body);
  return bad("Unknown action");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!(await requireSettingsAccess(req))) {
      return res.status(401).json({ error: "Sign in as admin to back up or restore.", adminRequired: true });
    }
    const result = await handleBackup(await getDb(), req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("backup request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
