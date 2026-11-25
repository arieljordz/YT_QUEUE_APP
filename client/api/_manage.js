// Room management: create, edit (name, avatar, description, PIN) and delete.
// Only the admin can do any of it: the endpoint checks the admin session
// (see _admin.js) before calling these. Room PINs only let people into a room.
import { SEARCHES_LIST } from "./_db.js";
import { AVATARS, ROOM_COUNT, ROOM_FIELDS, hashPin, isValidPin, missingRoom, newRoomDoc, pinMatches, publicRoom } from "./_session.js";

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

const pinTaken = { status: 409, body: { error: "Another room already uses this PIN. Choose a different one." } };
const full = { status: 409, body: { error: `There can be up to ${ROOM_COUNT} rooms. Delete one first.` } };

/** Creates a room in the first free slot. */
export async function createRoom({ rooms }, input) {
  const { fields, error } = cleanFields(input, true);
  if (error) return bad(error);
  if (!isValidPin(input.newPin)) return bad("Choose a 4-digit PIN");

  const existing = await rooms.find({ slot: { $exists: true } }, { projection: { slot: 1 } }).toArray();
  if (existing.length >= ROOM_COUNT) return full;
  if (await pinInUse(rooms, input.newPin)) return pinTaken;

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
    return { status: 201, body: { room: publicRoom(doc) } };
  }
  return full;
}

async function findRoom(rooms, roomId) {
  if (typeof roomId !== "string") return null;
  return rooms.findOne({ _id: roomId, slot: { $exists: true } }, { projection: ROOM_FIELDS });
}

/** Edits a room. A new PIN signs every device out of that room. */
export async function updateRoom({ rooms, sessions, presence }, input) {
  const room = await findRoom(rooms, input.roomId);
  if (!room) return missingRoom;
  const { fields, error } = cleanFields(input, false);
  if (error) return bad(error);

  const hadPin = Boolean(room.pinAuth);
  const changingPin = input.newPin !== undefined && input.newPin !== "";
  if (!hadPin && !changingPin) return bad("Choose a 4-digit PIN for this room");
  if (changingPin) {
    if (!isValidPin(input.newPin)) return bad("The new PIN must be 4 digits");
    if (await pinInUse(rooms, input.newPin, room._id)) return pinTaken;
    fields.pinAuth = hashPin(input.newPin);
  }
  fields.updatedAt = new Date();
  await rooms.updateOne({ _id: room._id }, { $set: fields });
  const signedOut = changingPin && hadPin;
  if (changingPin) {
    await sessions.deleteMany({ roomId: room._id });
    if (presence) await presence.deleteMany({ roomId: room._id });
  }
  return { status: 200, body: { room: publicRoom({ ...room, ...fields }), signedOut } };
}

/** Deletes a room, its sessions, library and own searches. Shared imported lists stay. */
export async function deleteRoom({ rooms, sessions, attempts, presence }, input, catalog, libraryVideos) {
  const room = await findRoom(rooms, input.roomId);
  if (!room) return missingRoom;
  await rooms.deleteOne({ _id: room._id });
  await sessions.deleteMany({ roomId: room._id });
  if (presence) await presence.deleteMany({ roomId: room._id });
  await attempts.deleteOne({ _id: `room:${room._id}` });
  await catalog.deleteMany({ owner: room._id, catalog: SEARCHES_LIST });
  if (libraryVideos) await libraryVideos.deleteMany({ roomId: room._id });
  return { status: 200, body: { ok: true } };
}
