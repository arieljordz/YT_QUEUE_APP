// Room management: create, edit (name, avatar, description, PIN) and delete.
// Every change to an existing room needs that room's current PIN, checked with
// the same wrong-attempt limits as entering it. A room that has no PIN yet (and
// no migrated data) can be claimed by giving it one.
import { SEARCHES_LIST } from "./_db.js";
import {
  AVATARS,
  ROOM_COUNT,
  addIpFail,
  createSession,
  hashPin,
  ipLocked,
  isValidPin,
  missingRoom,
  newRoomDoc,
  pinMatches,
  publicRoom,
  verifyPin,
} from "./_session.js";

export const MAX_NAME = 30;
export const MAX_DESCRIPTION = 80;

const bad = (error) => ({ status: 400, body: { error } });

/** Validates the editable fields that are present. Returns { fields } or { error }. */
function cleanFields({ name, avatar, description }, required) {
  const fields = {};
  if (name !== undefined || required) {
    const value = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
    if (!value) return { error: "Give the room a name" };
    if (value.length > MAX_NAME) return { error: `Room names can be up to ${MAX_NAME} characters` };
    fields.name = value;
  }
  if (avatar !== undefined || required) {
    if (!AVATARS.includes(avatar)) return { error: "Choose an avatar" };
    fields.avatar = avatar;
  }
  if (description !== undefined) {
    const value = typeof description === "string" ? description.trim() : "";
    if (value.length > MAX_DESCRIPTION) return { error: `Descriptions can be up to ${MAX_DESCRIPTION} characters` };
    fields.description = value;
  }
  return { fields };
}

/** Each room has its own PIN. Checks the other rooms' hashes (at most 4). */
async function pinInUse(rooms, pin, exceptId) {
  const others = await rooms
    .find({ slot: { $exists: true }, pinAuth: { $ne: null }, _id: { $ne: exceptId } }, { projection: { pinAuth: 1 } })
    .toArray();
  return others.some((room) => pinMatches(pin, room.pinAuth));
}

// A PIN another room uses counts as a failed attempt for the IP, so this check
// cannot be used to find other rooms' PINs faster than guessing them.
async function pinTaken(attempts, ip, opts) {
  await addIpFail(attempts, ip, opts);
  return { status: 409, body: { error: "Another room already uses this PIN. Choose a different one." } };
}

/** Creates a room in the first free slot and enters it. */
export async function createRoom({ rooms, sessions, attempts }, input, opts = {}) {
  const locked = await ipLocked(attempts, input.ip, opts.now);
  if (locked) return locked;
  const { fields, error } = cleanFields(input, true);
  if (error) return bad(error);
  if (!isValidPin(input.newPin)) return bad("Choose a 4-digit PIN");

  const existing = await rooms.find({ slot: { $exists: true } }, { projection: { slot: 1 } }).toArray();
  if (existing.length >= ROOM_COUNT) {
    return { status: 409, body: { error: `There can be up to ${ROOM_COUNT} rooms. Delete one first.` } };
  }
  if (await pinInUse(rooms, input.newPin)) return pinTaken(attempts, input.ip, opts);

  const used = new Set(existing.map((r) => r.slot));
  for (let slot = 1; slot <= ROOM_COUNT; slot++) {
    if (used.has(slot)) continue;
    const doc = newRoomDoc(slot, fields, hashPin(input.newPin));
    try {
      await rooms.insertOne(doc);
    } catch (e) {
      if (e?.code === 11000) continue; // another request took this slot just now
      throw e;
    }
    const token = await createSession(sessions, doc._id, opts.now);
    return { status: 201, body: { room: publicRoom(doc) }, token };
  }
  return { status: 409, body: { error: `There can be up to ${ROOM_COUNT} rooms. Delete one first.` } };
}

/** Loads a room and checks the caller may change it. Returns { room } or { result }. */
async function authorize({ rooms, attempts }, { roomId, pin, ip }, opts) {
  if (typeof roomId !== "string") return { result: bad("Unknown room") };
  const room = await rooms.findOne({ _id: roomId, slot: { $exists: true } });
  if (!room) return { result: missingRoom };
  if (room.pinAuth) {
    const failed = await verifyPin({ attempts }, room, pin, ip, opts);
    return failed ? { result: failed } : { room };
  }
  if (room.migratedFrom) {
    return {
      result: { status: 403, body: { error: "This room's PIN must be set with the migration script." } },
    };
  }
  const locked = await ipLocked(attempts, ip, opts.now);
  return locked ? { result: locked } : { room };
}

/**
 * Edits a room. Setting a PIN on a room without one claims it and enters it.
 * Changing an existing PIN signs every device out of that room.
 */
export async function updateRoom(cols, input, opts = {}) {
  const { rooms, sessions, attempts } = cols;
  const { room, result } = await authorize(cols, input, opts);
  if (result) return result;
  const { fields, error } = cleanFields(input, false);
  if (error) return bad(error);

  const claiming = !room.pinAuth;
  const changingPin = input.newPin !== undefined && input.newPin !== "";
  if (claiming && !changingPin) return bad("Choose a 4-digit PIN for this room");
  if (changingPin) {
    if (!isValidPin(input.newPin)) return bad("The new PIN must be 4 digits");
    if (await pinInUse(rooms, input.newPin, room._id)) return pinTaken(attempts, input.ip, opts);
    fields.pinAuth = hashPin(input.newPin);
  }

  const updated = { ...room, ...fields, updatedAt: new Date() };
  // The filter repeats the PIN hash that was checked, so two edits racing each
  // other cannot both apply.
  const write = await rooms.updateOne(
    { _id: room._id, pinAuth: room.pinAuth },
    { $set: { ...fields, updatedAt: updated.updatedAt } }
  );
  if (write.matchedCount === 0) {
    return { status: 409, body: { error: "This room was just changed. Reload and try again." } };
  }
  if (claiming) {
    const token = await createSession(sessions, room._id, opts.now);
    return { status: 200, body: { room: publicRoom(updated), entered: true }, token };
  }
  if (changingPin) await sessions.deleteMany({ roomId: room._id });
  return { status: 200, body: { room: publicRoom(updated), signedOut: changingPin } };
}

/** Deletes a room, its sessions and its own searches. Shared imported lists stay. */
export async function deleteRoom(cols, input, catalog, opts = {}) {
  const { rooms, sessions, attempts } = cols;
  const { room, result } = await authorize(cols, input, opts);
  if (result) return result;
  await rooms.deleteOne({ _id: room._id });
  await sessions.deleteMany({ roomId: room._id });
  await attempts.deleteOne({ _id: `room:${room._id}` });
  await catalog.deleteMany({ owner: room._id, catalog: SEARCHES_LIST });
  return { status: 200, body: { ok: true } };
}
