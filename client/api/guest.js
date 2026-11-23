// Vercel serverless function: guest invites. The owner (sync code) creates an
// invite link; a guest with that link can ONLY look at the queue and add songs
// to it. Everything else (library, delete, import, flags, reordering) needs the
// owner's sync code, so the server refuses it for guests.
//
// Owner (header x-sync-code), POST:
//   { action: "status" }  -> { token }        (token is null when nothing is shared)
//   { action: "create" }  -> { token }        (a new token; the old link stops working)
//   { action: "revoke" }  -> { token: null }
// Guest (header x-guest-code), POST:
//   { action: "state" }               -> { queue, isPaused, rev }
//   { action: "library" }             -> { library }   (read only)
//   { action: "add", video }          -> { added, reason? }
import { randomBytes } from "node:crypto";
import { getRooms, readSyncCode, roomIdFor, slimQueueItem } from "./_db.js";

const TOKEN_PATTERN = /^[\w-]{12,64}$/;
export const MAX_GUEST_QUEUE = 300; // guests cannot grow the queue past this

const fail = (status, error) => ({ status, body: { error } });
const newQueueId = () => `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;

/** Owner side: manage the invite token stored on the room. */
export async function handleOwner(rooms, roomId, body) {
  const action = body?.action;
  if (action === "status") {
    const doc = await rooms.findOne({ _id: roomId }, { projection: { guestCode: 1 } });
    return { status: 200, body: { token: doc?.guestCode ?? null } };
  }
  if (action === "create") {
    const token = randomBytes(9).toString("base64url"); // 12 characters
    await rooms.updateOne({ _id: roomId }, { $set: { guestCode: token } }, { upsert: true });
    return { status: 200, body: { token } };
  }
  if (action === "revoke") {
    await rooms.updateOne({ _id: roomId }, { $unset: { guestCode: "" } });
    return { status: 200, body: { token: null } };
  }
  return fail(400, "Unknown action");
}

/** Guest side: read the queue or the library, or add one song to the queue. */
export async function handleGuest(rooms, token, body) {
  if (!TOKEN_PATTERN.test(token)) return fail(404, "This invite is not valid any more");
  const doc = await rooms.findOne(
    { guestCode: token },
    { projection: { queue: 1, isPaused: 1, rev: 1 } }
  );
  if (!doc) return fail(404, "This invite is not valid any more");
  const queue = doc.queue ?? [];

  if (body?.action === "state") {
    return {
      status: 200,
      body: { queue, isPaused: doc.isPaused === true, rev: doc.rev ?? 0 },
    };
  }

  if (body?.action === "library") {
    const withLibrary = await rooms.findOne(
      { _id: doc._id },
      { projection: { library: 1 } }
    );
    return { status: 200, body: { library: withLibrary?.library ?? [] } };
  }

  if (body?.action === "add") {
    const item = slimQueueItem({ ...body.video, queueId: newQueueId() });
    if (!item) return fail(400, "Invalid video");
    if (queue.some((v) => v.id.videoId === item.id.videoId)) {
      return { status: 200, body: { added: false, reason: "already" } };
    }
    if (queue.length >= MAX_GUEST_QUEUE) return fail(429, "The queue is full");
    // Appended in the database, so it does not overwrite what the owner just did.
    await rooms.updateOne({ _id: doc._id }, { $push: { queue: item }, $inc: { rev: 1 } });
    return { status: 200, body: { added: true } };
  }

  return fail(400, "Unknown action");
}

let indexReady = false;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rooms = await getRooms();
    if (!indexReady) {
      await rooms.createIndex({ guestCode: 1 }, { sparse: true });
      indexReady = true;
    }

    const ownerCode = readSyncCode(req);
    let result;
    if (ownerCode) {
      result = await handleOwner(rooms, roomIdFor(ownerCode), req.body);
    } else {
      const guestCode = req.headers["x-guest-code"];
      if (typeof guestCode !== "string") {
        return res.status(401).json({ error: "Missing code" });
      }
      result = await handleGuest(rooms, guestCode, req.body);
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("guest request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
