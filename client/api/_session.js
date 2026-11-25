/* global Buffer, process */
// Room access sessions. Logic functions take collections so they can be tested
// with fakes; `requireRoom(req)` is the one helper every endpoint uses to turn a
// request into a roomId (or null -> respond 401).
//
// Collections: rooms (slot-based room docs), room_sessions (hashed tokens),
// room_attempts (failed PIN counters). The PIN is never stored or returned,
// only its scrypt hash lives in rooms.pinAuth.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, getRooms } from "./_db.js";

export const COOKIE_NAME = "yq_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ROOM_COUNT = 5;
export const MAX_ROOM_FAILS = 5;
export const MAX_IP_FAILS = 25;
export const LOCK_MS = 15 * 60 * 1000;
export const FAIL_DELAY_MS = 700;
// A device counts as connected while its queue polls keep arriving.
export const ONLINE_MS = 60 * 1000;
const PRESENCE_REFRESH_MS = 20 * 1000;
export const AVATARS = [
  "avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6", "avatar-7", "avatar-8",
];

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function hashPin(pin, salt = randomBytes(16)) {
  return { salt: salt.toString("hex"), hash: scryptSync(pin, salt, 32).toString("hex") };
}

export function pinMatches(pin, auth) {
  if (!auth) return false;
  const expected = Buffer.from(auth.hash, "hex");
  const actual = scryptSync(pin, Buffer.from(auth.salt, "hex"), 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const isValidPin = (pin) => typeof pin === "string" && /^\d{4}$/.test(pin);

export function newRoomDoc(slot, { name, avatar, description = "" }, pinAuth, now = new Date()) {
  return {
    _id: randomBytes(12).toString("hex"),
    slot,
    name,
    avatar,
    description,
    pinAuth,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Seeds Room 1..5 the first time only (idempotent, safe to call concurrently).
 * After that rooms are created and deleted from the management screen. If every
 * room gets deleted the five defaults come back, so the screen is never empty.
 */
export async function ensureDefaultRooms(rooms, now = new Date()) {
  if ((await rooms.countDocuments({ slot: { $exists: true } }, { limit: 1 })) > 0) return;
  for (let slot = 1; slot <= ROOM_COUNT; slot++) {
    await rooms.updateOne(
      { slot },
      { $setOnInsert: newRoomDoc(slot, { name: `Room ${slot}`, avatar: AVATARS[slot - 1] }, null, now) },
      { upsert: true }
    );
  }
}

/** What the browser may see about a room. Never the PIN or its hash. */
export const publicRoom = (d) => ({
  id: d._id,
  name: d.name,
  avatar: d.avatar,
  description: d.description ?? "",
  // A room without a PIN cannot be entered until the admin sets one.
  hasPin: Boolean(d.pinAuth),
});

/**
 * Marks a session's device as connected (called from the queue poll). Writes
 * at most every 20s per device: the filter only matches a stale entry, and a
 * fresh one makes the upsert collide, which is ignored.
 */
export async function touchPresence(presence, token, roomId, now = Date.now()) {
  if (typeof token !== "string" || !token) return;
  try {
    await presence.updateOne(
      { _id: sha256(token), lastSeen: { $lt: new Date(now - PRESENCE_REFRESH_MS) } },
      { $set: { roomId, lastSeen: new Date(now) } },
      { upsert: true }
    );
  } catch (e) {
    if (e?.code !== 11000) throw e;
  }
}

/** { roomId: number of devices seen in the last minute } */
export async function countOnline(presence, now = Date.now()) {
  const rows = await presence
    .aggregate([
      { $match: { lastSeen: { $gte: new Date(now - ONLINE_MS) } } },
      { $group: { _id: "$roomId", n: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

/**
 * The room fields the room screens need. A room document also holds its whole
 * library (thousands of videos, megabytes), so every read that does not need
 * the library must use this projection, or it can take longer than the
 * function's 10-second limit.
 */
export const ROOM_FIELDS = { name: 1, avatar: 1, slot: 1, description: 1, pinAuth: 1 };

/** Public list: no secrets. Connected-device counts when `presence` is given. */
export async function listRooms(rooms, presence) {
  await ensureDefaultRooms(rooms);
  const docs = await rooms
    .find({ slot: { $exists: true } }, { projection: ROOM_FIELDS })
    .toArray();
  const online = presence ? await countOnline(presence) : {};
  return docs.sort((a, b) => a.slot - b.slot).map((d) => ({ ...publicRoom(d), online: online[d._id] ?? 0 }));
}

async function readAttempt(attempts, key) {
  return (await attempts.findOne({ _id: key })) ?? { fails: 0, lockedUntil: 0 };
}

const minutesLeft = (ms) => Math.max(1, Math.ceil(ms / 60000));

const lockedResponse = (retryAfterMs) => ({
  status: 429,
  body: {
    error: `Too many wrong PINs. Try again in ${minutesLeft(retryAfterMs)} min.`,
    locked: true,
    retryAfterMs,
  },
});

const defaultDelay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Adds one failure to a counter; returns true when that failure locked it. */
async function addFail(attempts, key, current, max, now) {
  const fails = current.fails + 1;
  const locks = fails >= max;
  await attempts.updateOne(
    { _id: key },
    { $set: { fails: locks ? 0 : fails, lockedUntil: locks ? now + LOCK_MS : 0 } },
    { upsert: true }
  );
  return locks;
}

/**
 * Checks a secret with the wrong-attempt limits: `key` is the thing being
 * guessed (a room, the admin password), counted together with the caller's IP.
 * Returns null when `matches` is true, otherwise the { status, body } to answer with.
 */
export async function verifySecret({ attempts }, { key, matches, ip, wrong }, opts = {}) {
  const now = opts.now ?? Date.now();
  const delay = opts.delay ?? defaultDelay;
  const ipKey = `ip:${ip || "unknown"}`;
  const [keyAtt, ipAtt] = [await readAttempt(attempts, key), await readAttempt(attempts, ipKey)];
  const lockedUntil = Math.max(keyAtt.lockedUntil, ipAtt.lockedUntil);
  if (lockedUntil > now) return lockedResponse(lockedUntil - now);

  if (!matches()) {
    await delay(FAIL_DELAY_MS);
    const keyLocked = await addFail(attempts, key, keyAtt, MAX_ROOM_FAILS, now);
    await addFail(attempts, ipKey, ipAtt, MAX_IP_FAILS, now);
    if (keyLocked) return lockedResponse(LOCK_MS);
    return { status: 401, body: { error: wrong, attemptsLeft: MAX_ROOM_FAILS - (keyAtt.fails + 1) } };
  }

  await attempts.updateOne({ _id: key }, { $set: { fails: 0, lockedUntil: 0 } }, { upsert: true });
  return null;
}

/** Checks a room's PIN with the wrong-attempt limits (see verifySecret). */
export const verifyPin = (cols, room, pin, ip, opts = {}) =>
  verifySecret(
    cols,
    {
      key: `room:${room._id}`,
      matches: () => isValidPin(pin) && pinMatches(pin, room.pinAuth),
      ip,
      wrong: "Wrong PIN. Try again.",
    },
    opts
  );

export const missingRoom = { status: 404, body: { error: "This room no longer exists", missing: true } };

/** Verifies the PIN. Returns { status, body, token? }; token only on success. */
export async function enterRoom({ rooms, sessions, attempts }, { roomId, pin, ip }, opts = {}) {
  if (typeof roomId !== "string" || !isValidPin(pin)) {
    return { status: 400, body: { error: "Enter your 4-digit PIN" } };
  }
  const room = await rooms.findOne({ _id: roomId, slot: { $exists: true } }, { projection: ROOM_FIELDS });
  if (!room) return missingRoom;
  if (!room.pinAuth) {
    return { status: 403, body: { error: "This room has no PIN set yet" } };
  }
  const failed = await verifyPin({ attempts }, room, pin, ip, opts);
  if (failed) return failed;
  const token = await createSession(sessions, roomId, opts.now);
  return { status: 200, body: { room: publicRoom(room) }, token };
}

export async function createSession(sessions, roomId, now = Date.now()) {
  const token = randomBytes(32).toString("hex");
  await sessions.insertOne({
    _id: sha256(token),
    roomId,
    createdAt: new Date(now),
    expiresAt: new Date(now + SESSION_TTL_MS),
  });
  return token;
}

/** Resolves a raw session token to its room id, or null (unknown/expired/room deleted). */
export async function resolveSession({ rooms, sessions }, token, now = Date.now()) {
  if (typeof token !== "string" || token.length < 32) return null;
  const session = await sessions.findOne({ _id: sha256(token) });
  if (!session || new Date(session.expiresAt).getTime() <= now) return null;
  const room = await rooms.findOne({ _id: session.roomId, slot: { $exists: true } }, { projection: { _id: 1 } });
  return room ? session.roomId : null;
}

export async function leaveSession({ sessions, presence }, token) {
  if (typeof token !== "string" || !token) return;
  await sessions.deleteOne({ _id: sha256(token) });
  if (presence) await presence.deleteOne({ _id: sha256(token) });
}

export function readCookie(req, name = COOKIE_NAME) {
  const header = req.headers?.cookie;
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

export function sessionCookie(token, maxAgeSec = SESSION_TTL_MS / 1000, name = COOKIE_NAME) {
  const secure = process.env.NODE_ENV === "development" ? "" : "; Secure";
  return `${name}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

export const clientIp = (req) =>
  String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

export async function getSessionCollections() {
  const db = await getDb();
  const sessions = db.collection("room_sessions");
  const attempts = db.collection("room_attempts");
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return { rooms: await getRooms(), sessions, attempts, presence: db.collection("room_presence") };
}

/** The helper for every endpoint: request -> roomId, or null (respond 401). */
export async function requireRoom(req) {
  const token = readCookie(req);
  if (!token) return null;
  return resolveSession(await getSessionCollections(), token);
}
