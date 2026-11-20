// Vercel serverless function: the shared queue state for one sync code, stored
// in MongoDB. Devices poll it (and push changes) so they stay identical.
//
// POST body:
//   { rev }                  -> poll: { rev, exists, changed, state? }
//   { push: { queue, isPaused, played } } -> save: { rev }
import { getRooms, readSyncCode, roomIdFor, slimQueueItem, slimVideo } from "./_db.js";

const MAX_ITEMS = 5000;

function cleanState(push) {
  if (
    !Array.isArray(push?.queue) ||
    push.queue.length > MAX_ITEMS ||
    typeof push.isPaused !== "boolean" ||
    (push.isRepeat !== undefined && typeof push.isRepeat !== "boolean") ||
    !Array.isArray(push.played) ||
    push.played.length > MAX_ITEMS
  ) {
    return null;
  }
  return {
    queue: push.queue.map(slimQueueItem).filter(Boolean),
    isPaused: push.isPaused,
    isRepeat: push.isRepeat === true,
    played: push.played.map(slimVideo).filter(Boolean),
  };
}

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handleQueue(rooms, roomId, body) {
  if (body?.push !== undefined) {
    const state = cleanState(body.push);
    if (!state) return { status: 400, body: { error: "Invalid queue state" } };

    const result = await rooms.findOneAndUpdate(
      { _id: roomId },
      { $set: { ...state, updatedAt: new Date() }, $inc: { rev: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    return { status: 200, body: { rev: result?.rev ?? 1 } };
  }

  const known = Number.isInteger(body?.rev) ? body.rev : -1;
  const doc = await rooms.findOne(
    { _id: roomId },
    { projection: { queue: 1, isPaused: 1, isRepeat: 1, played: 1, rev: 1 } }
  );
  if (!doc || doc.queue === undefined) {
    return { status: 200, body: { exists: false, changed: false, rev: 0 } };
  }
  if (doc.rev === known) {
    return { status: 200, body: { exists: true, changed: false, rev: doc.rev } };
  }
  return {
    status: 200,
    body: {
      exists: true,
      changed: true,
      rev: doc.rev,
      state: {
        queue: doc.queue,
        isPaused: doc.isPaused,
        isRepeat: doc.isRepeat === true,
        played: doc.played ?? [],
      },
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = readSyncCode(req);
  if (!code) return res.status(401).json({ error: "Missing or too short sync code" });

  try {
    const result = await handleQueue(await getRooms(), roomIdFor(code), req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("queue sync failed", error);
    return res.status(500).json({ error: "Could not sync the queue" });
  }
}
