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
export const AVATARS = ["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5"];

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function hashPin(pin, salt = randomBytes(16)) {
  return { salt: salt.toString("hex"), hash: scryptSync(pin, salt, 32).toString("hex") };
}

function pinMatches(pin, auth) {
  const expected = Buffer.from(auth.hash, "hex");
  const actual = scryptSync(pin, Buffer.from(auth.salt, "hex"), 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const isValidPin = (pin) => typeof pin === "string" && /^\d{4}$/.test(pin);

/** Creates Room 1..5 when missing (idempotent, safe to call concurrently). */
export async function ensureDefaultRooms(rooms, now = new Date()) {
  for (let slot = 1; slot <= ROOM_COUNT; slot++) {
    await rooms.updateOne(
      { slot },
      {
        $setOnInsert: {
          _id: randomBytes(12).toString("hex"),
          slot,
          name: `Room ${slot}`,
          avatar: AVATARS[slot - 1],
          description: "",
          pinAuth: null,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }
}

/** Public list: id, name, avatar only. */
export async function listRooms(rooms) {
  await ensureDefaultRooms(rooms);
  const docs = await rooms
    .find({ slot: { $exists: true } }, { projection: { name: 1, avatar: 1, slot: 1 } })
    .toArray();
  return docs
    .sort((a, b) => a.slot - b.slot)
    .map((d) => ({ id: d._id, name: d.name, avatar: d.avatar }));
}

async function readAttempt(attempts, key) {
  return (await attempts.findOne({ _id: key })) ?? { fails: 0, lockedUntil: 0 };
}

const minutesLeft = (ms) => Math.max(1, Math.ceil(ms / 60000));

/** Verifies the PIN. Returns { status, body, token? }; token only on success. */
export async function enterRoom({ rooms, sessions, attempts }, { roomId, pin, ip }, opts = {}) {
  const now = opts.now ?? Date.now();
  const delay = opts.delay ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  if (typeof roomId !== "string" || !isValidPin(pin)) {
    return { status: 400, body: { error: "Enter your 4-digit PIN" } };
  }
  const room = await rooms.findOne({ _id: roomId, slot: { $exists: true } });
  if (!room) return { status: 404, body: { error: "This room no longer exists", missing: true } };
  if (!room.pinAuth) {
    return { status: 403, body: { error: "This room has no PIN set yet" } };
  }

  const roomKey = `room:${roomId}`;
  const ipKey = `ip:${ip || "unknown"}`;
  const [roomAtt, ipAtt] = [await readAttempt(attempts, roomKey), await readAttempt(attempts, ipKey)];
  const lockedUntil = Math.max(roomAtt.lockedUntil, ipAtt.lockedUntil);
  if (lockedUntil > now) {
    const retryAfterMs = lockedUntil - now;
    return {
      status: 429,
      body: {
        error: `Too many wrong PINs. Try again in ${minutesLeft(retryAfterMs)} min.`,
        locked: true,
        retryAfterMs,
      },
    };
  }

  if (!pinMatches(pin, room.pinAuth)) {
    await delay(FAIL_DELAY_MS);
    const roomFails = roomAtt.fails + 1;
    const ipFails = ipAtt.fails + 1;
    await attempts.updateOne(
      { _id: roomKey },
      { $set: { fails: roomFails >= MAX_ROOM_FAILS ? 0 : roomFails, lockedUntil: roomFails >= MAX_ROOM_FAILS ? now + LOCK_MS : 0 } },
      { upsert: true }
    );
    await attempts.updateOne(
      { _id: ipKey },
      { $set: { fails: ipFails >= MAX_IP_FAILS ? 0 : ipFails, lockedUntil: ipFails >= MAX_IP_FAILS ? now + LOCK_MS : 0 } },
      { upsert: true }
    );
    if (roomFails >= MAX_ROOM_FAILS) {
      return {
        status: 429,
        body: { error: `Too many wrong PINs. Try again in ${minutesLeft(LOCK_MS)} min.`, locked: true, retryAfterMs: LOCK_MS },
      };
    }
    return {
      status: 401,
      body: { error: "Wrong PIN. Try again.", attemptsLeft: MAX_ROOM_FAILS - roomFails },
    };
  }

  await attempts.updateOne({ _id: roomKey }, { $set: { fails: 0, lockedUntil: 0 } }, { upsert: true });
  const token = randomBytes(32).toString("hex");
  await sessions.insertOne({
    _id: sha256(token),
    roomId,
    createdAt: new Date(now),
    expiresAt: new Date(now + SESSION_TTL_MS),
  });
  return { status: 200, body: { room: { id: room._id, name: room.name, avatar: room.avatar } }, token };
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
