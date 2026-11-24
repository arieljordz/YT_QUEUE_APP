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
  hasPin: Boolean(d.pinAuth),
  // A room without a PIN can be claimed (given a PIN) from the room screen,
  // unless it holds migrated data: then the migration script must set its PIN.
  claimable: !d.pinAuth && !d.migratedFrom,
});

/** Public list: no secrets. */
export async function listRooms(rooms) {
  await ensureDefaultRooms(rooms);
  const docs = await rooms
    .find(
      { slot: { $exists: true } },
      { projection: { name: 1, avatar: 1, slot: 1, description: 1, pinAuth: 1, migratedFrom: 1 } }
    )
    .toArray();
  return docs.sort((a, b) => a.slot - b.slot).map(publicRoom);
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

/** The IP lock alone (used where no room is involved, e.g. creating a room). */
export async function ipLocked(attempts, ip, now = Date.now()) {
  const att = await readAttempt(attempts, `ip:${ip || "unknown"}`);
  return att.lockedUntil > now ? lockedResponse(att.lockedUntil - now) : null;
}

/** Counts a failure against the IP only (e.g. trying a PIN another room uses). */
export async function addIpFail(attempts, ip, { now = Date.now(), delay = defaultDelay } = {}) {
  await delay(FAIL_DELAY_MS);
  const key = `ip:${ip || "unknown"}`;
  await addFail(attempts, key, await readAttempt(attempts, key), MAX_IP_FAILS, now);
}

/**
 * Checks a PIN against a room with the wrong-attempt limits. Returns null when
 * it matches, otherwise the { status, body } to answer with.
 */
export async function verifyPin({ attempts }, room, pin, ip, opts = {}) {
  const now = opts.now ?? Date.now();
  const delay = opts.delay ?? defaultDelay;
  const roomKey = `room:${room._id}`;
  const ipKey = `ip:${ip || "unknown"}`;
  const [roomAtt, ipAtt] = [await readAttempt(attempts, roomKey), await readAttempt(attempts, ipKey)];
  const lockedUntil = Math.max(roomAtt.lockedUntil, ipAtt.lockedUntil);
  if (lockedUntil > now) return lockedResponse(lockedUntil - now);

  if (!isValidPin(pin) || !pinMatches(pin, room.pinAuth)) {
    await delay(FAIL_DELAY_MS);
    const roomLocked = await addFail(attempts, roomKey, roomAtt, MAX_ROOM_FAILS, now);
    await addFail(attempts, ipKey, ipAtt, MAX_IP_FAILS, now);
    if (roomLocked) return lockedResponse(LOCK_MS);
    return {
      status: 401,
      body: { error: "Wrong PIN. Try again.", attemptsLeft: MAX_ROOM_FAILS - (roomAtt.fails + 1) },
    };
  }

  await attempts.updateOne({ _id: roomKey }, { $set: { fails: 0, lockedUntil: 0 } }, { upsert: true });
  return null;
}

export const missingRoom = { status: 404, body: { error: "This room no longer exists", missing: true } };

/** Verifies the PIN. Returns { status, body, token? }; token only on success. */
export async function enterRoom({ rooms, sessions, attempts }, { roomId, pin, ip }, opts = {}) {
  if (typeof roomId !== "string" || !isValidPin(pin)) {
    return { status: 400, body: { error: "Enter your 4-digit PIN" } };
  }
  const room = await rooms.findOne({ _id: roomId, slot: { $exists: true } });
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
  const room = await rooms.findOne({ _id: session.roomId, slot: { $exists: true } });
  return room ? session.roomId : null;
}

export async function leaveSession({ sessions }, token) {
  if (typeof token === "string" && token) await sessions.deleteOne({ _id: sha256(token) });
}

export function readCookie(req, name = COOKIE_NAME) {
  const header = req.headers?.cookie;
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(token, maxAgeSec = SESSION_TTL_MS / 1000) {
  const secure = process.env.NODE_ENV === "development" ? "" : "; Secure";
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`;
}

export const clientIp = (req) =>
  String(req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

export async function getSessionCollections() {
  const db = await getDb();
  const sessions = db.collection("room_sessions");
  const attempts = db.collection("room_attempts");
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return { rooms: await getRooms(), sessions, attempts };
}

/** The helper for every endpoint: request -> roomId, or null (respond 401). */
export async function requireRoom(req) {
  const token = readCookie(req);
  if (!token) return null;
  return resolveSession(await getSessionCollections(), token);
}
