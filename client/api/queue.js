// Vercel serverless function: the shared queue state of one room, stored in
// room_queues (one document per room, _id = the room id). Devices poll it (and
// push changes) so they stay identical.
//
// POST body:
//   { rev }                  -> poll: { rev, exists, changed, state? }
//   { push: { queue, isPaused, isRepeat, volume?, isMuted? } } -> save: { rev }
//     volume (0-100) and isMuted are optional: older copies of the app leave
//     the saved values as they are.
//   { progress: { id, queueId, position, duration, playing } } -> { ok }
//     Where the player is in the current video. Saved apart from the queue
//     (no new rev), and sent back with every poll as "progress", with "age"
//     = how many ms ago it was saved, so each device can place it on its own clock.
// Older copies of the app also send and expect a "played" list (the removed
// re-queue feature): it is ignored on save and always answered as empty.
import { getDb, getRoomQueues, slimQueueItem } from "./_db.js";
import { readCookie, requireRoom, touchPresence } from "./_session.js";

const MAX_ITEMS = 5000;
const isVolume = (v) => Number.isInteger(v) && v >= 0 && v <= 100;

function cleanState(push) {
  if (
    !Array.isArray(push?.queue) ||
    push.queue.length > MAX_ITEMS ||
    typeof push.isPaused !== "boolean" ||
    (push.isRepeat !== undefined && typeof push.isRepeat !== "boolean") ||
    (push.volume !== undefined && !isVolume(push.volume)) ||
    (push.isMuted !== undefined && typeof push.isMuted !== "boolean")
  ) {
    return null;
  }
  return {
    queue: push.queue.map(slimQueueItem).filter(Boolean),
    isPaused: push.isPaused,
    isRepeat: push.isRepeat === true,
    ...(push.volume !== undefined && { volume: push.volume }),
    ...(push.isMuted !== undefined && { isMuted: push.isMuted }),
  };
}

const MAX_SECONDS = 24 * 60 * 60;
const isSeconds = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_SECONDS;
const isShortId = (v) => typeof v === "string" && v.length > 0 && v.length <= 64;

function cleanProgress(p) {
  if (!isShortId(p?.id) || !isShortId(p.queueId) || !isSeconds(p.position) || !isSeconds(p.duration) || typeof p.playing !== "boolean") {
    return null;
  }
  return { id: p.id, queueId: p.queueId, position: p.position, duration: p.duration, playing: p.playing };
}

/** The saved progress as sent to devices, or undefined when there is none. */
function progressOut(saved, now) {
  if (!saved?.savedAt) return undefined;
  const { savedAt, ...rest } = saved;
  return { ...rest, age: Math.max(0, now - new Date(savedAt).getTime()) };
}

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handleQueue(queues, roomId, body, now = Date.now()) {
  if (body?.progress !== undefined) {
    const progress = cleanProgress(body.progress);
    if (!progress) return { status: 400, body: { error: "Invalid progress" } };
    await queues.updateOne({ _id: roomId }, { $set: { progress: { ...progress, savedAt: new Date(now) } } });
    return { status: 200, body: { ok: true } };
  }

  if (body?.push !== undefined) {
    const state = cleanState(body.push);
    if (!state) return { status: 400, body: { error: "Invalid queue state" } };

    const result = await queues.findOneAndUpdate(
      { _id: roomId },
      { $set: { ...state, updatedAt: new Date() }, $unset: { played: "" }, $inc: { rev: 1 } },
      // Only the new rev comes back, not the whole queue.
      { upsert: true, returnDocument: "after", projection: { rev: 1 } }
    );
    return { status: 200, body: { rev: result?.rev ?? 1 } };
  }

  const known = Number.isInteger(body?.rev) ? body.rev : -1;
  const doc = await queues.findOne(
    { _id: roomId },
    { projection: { queue: 1, isPaused: 1, isRepeat: 1, volume: 1, isMuted: 1, rev: 1, progress: 1 } }
  );
  if (!doc || doc.queue === undefined) {
    return { status: 200, body: { exists: false, changed: false, rev: 0 } };
  }
  const progress = progressOut(doc.progress, now);
  if (doc.rev === known) {
    return { status: 200, body: { exists: true, changed: false, rev: doc.rev, progress } };
  }
  return {
    status: 200,
    body: {
      exists: true,
      changed: true,
      rev: doc.rev,
      progress,
      state: {
        queue: doc.queue,
        isPaused: doc.isPaused,
        isRepeat: doc.isRepeat === true,
        // Missing until a device that knows about volume saves it.
        ...(isVolume(doc.volume) && { volume: doc.volume }),
        ...(typeof doc.isMuted === "boolean" && { isMuted: doc.isMuted }),
        played: [], // for older copies of the app, which still read it
      },
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const roomId = await requireRoom(req);
    if (!roomId) return res.status(401).json({ error: "Not in a room" });
    const result = await handleQueue(await getRoomQueues(), roomId, req.body);
    // Counts this device as connected to the room (shown on the room screen).
    try {
      await touchPresence((await getDb()).collection("room_presence"), readCookie(req), roomId);
    } catch (error) {
      console.error("presence update failed", error);
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("queue sync failed", error);
    return res.status(500).json({ error: "Could not sync the queue" });
  }
}
