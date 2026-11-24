/* global Buffer */
// Vercel serverless function: feature flags shared by every device that uses
// the same sync code. The library API enforces them, so hiding a button is not
// the only protection.
//
// Changing a flag needs a password. The first time, the password sent is saved
// (hashed) as the room's password; after that it must match.
//
//   POST {}                         -> { flags, locked }
//   POST { flags: {...}, password } -> { flags, locked: true }   (403 on a wrong password)
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getRooms } from "./_db.js";
import { requireRoom } from "./_session.js";

export const DEFAULT_FLAGS = {
  removeButton: false,
  deleteAllButton: false,
  deleteListButton: false,
};
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 100;

/** The flags stored on a room document, with defaults for anything missing. */
export const readFlags = (doc) => ({ ...DEFAULT_FLAGS, ...(doc?.flags ?? {}) });

const hashPassword = (password, salt) => scryptSync(password, salt, 32);

function passwordMatches(password, auth) {
  const expected = Buffer.from(auth.hash, "hex");
  const actual = hashPassword(password, Buffer.from(auth.salt, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handleFlags(rooms, roomId, body) {
  const doc = await rooms.findOne({ _id: roomId }, { projection: { flags: 1, flagsAuth: 1 } });
  const flags = readFlags(doc);
  const locked = Boolean(doc?.flagsAuth);
  if (body?.flags === undefined) return { status: 200, body: { flags, locked } };

  const changes = body.flags;
  const names = changes && typeof changes === "object" ? Object.keys(changes) : [];
  if (
    names.length === 0 ||
    names.some((name) => !(name in DEFAULT_FLAGS) || typeof changes[name] !== "boolean")
  ) {
    return { status: 400, body: { error: "Invalid flags" } };
  }
  const password = body.password;
  if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return {
      status: 400,
      body: { error: `Enter a password of at least ${MIN_PASSWORD} characters` },
    };
  }

  const update = { flags: { ...flags, ...changes } };
  if (locked) {
    if (!passwordMatches(password, doc.flagsAuth)) {
      await new Promise((resolve) => setTimeout(resolve, 600)); // slows down guessing
      return { status: 403, body: { error: "Wrong password" } };
    }
  } else {
    const salt = randomBytes(16);
    update.flagsAuth = {
      salt: salt.toString("hex"),
      hash: hashPassword(password, salt).toString("hex"),
    };
  }

  await rooms.updateOne({ _id: roomId }, { $set: update }, { upsert: true });
  return { status: 200, body: { flags: update.flags, locked: true } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const roomId = await requireRoom(req);
    if (!roomId) return res.status(401).json({ error: "Not in a room" });
    const result = await handleFlags(await getRooms(), roomId, req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("flags request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
