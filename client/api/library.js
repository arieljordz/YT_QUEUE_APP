// Vercel serverless function: the saved video library for one sync code, stored
// in MongoDB. The client sends its library; the server merges it with the
// stored one (union by video id) and returns the result.
import { getAppFlags } from "./flags.js";
import { requireRoom } from "./_session.js";
import {
  getCatalog,
  getRooms,
  slimVideo,
} from "./_db.js";

const MAX_ITEMS = 20000;

export function mergeLibrary(stored, incoming) {
  const byId = new Map();
  for (const video of [...stored, ...incoming]) {
    const item = slimVideo(video);
    if (item && !byId.has(item.id.videoId)) byId.set(item.id.videoId, item);
  }
  return [...byId.values()].slice(0, MAX_ITEMS);
}

const MAX_REMOVALS = 5000;
const MAX_REMOVED_PER_REQUEST = 500;

/**
 * Core logic, separated from the HTTP layer so it can be tested with any collection.
 *
 * Deleting everything: the room keeps a `libraryEpoch` that goes up every time
 * the library is deleted. A device sends the epoch it last saw:
 *   - same epoch, or "join" (a device that just entered the sync code): its
 *     library is merged into the stored one;
 *   - older epoch: the library was deleted since this device last synced, so its
 *     copy is stale and is replaced by the stored one instead of being merged.
 *
 * Removing single videos: each removal gets a sequence number (`removalSeq`) and
 * is remembered in `removals`. A device sends the sequence it last saw; videos
 * removed after that are dropped from its uploaded copy, so they cannot come
 * back from a device that has not heard about the removal yet. A video added
 * again later by a device that already saw the removal is kept normally.
 *
 * Both kinds of deletion are refused unless their feature flag (see flags.js) is
 * on for the room.
 *
 * Videos removed one by one are also deleted from the saved lists
 * (`catalog`, the catalog_videos collection) of this room. Deleting the whole
 * library does not touch them.
 *
 * The response always holds the full library the device should end up with.
 */
export async function handleLibrary(rooms, roomId, body, catalog, flags) {
  const doc = await rooms.findOne(
    { _id: roomId },
    { projection: { library: 1, libraryEpoch: 1, removals: 1, removalSeq: 1 } }
  );
  const serverEpoch = doc?.libraryEpoch ?? 0;
  const serverSeq = doc?.removalSeq ?? 0;

  // { clear: true } empties the stored library for every device.
  if (body?.clear === true) {
    if (!flags.deleteAllButton) {
      return { status: 403, body: { error: "Delete all is turned off" } };
    }
    const epoch = serverEpoch + 1;
    await rooms.updateOne(
      { _id: roomId },
      { $set: { library: [], libraryEpoch: epoch, removals: [] } },
      { upsert: true }
    );
    return { status: 200, body: { library: [], epoch, removalSeq: serverSeq, reset: true } };
  }

  const incoming = body?.library;
  const clientEpoch = body?.epoch;
  const clientSeq = Number.isInteger(body?.removalSeq) && body.removalSeq >= 0 ? body.removalSeq : 0;
  // Removing videos only counts while the Remove or Delete all flag is on (Delete
  // all removes the videos matching the search); otherwise the request is
  // treated as if nothing had been removed (the videos stay).
  const removedNow = Array.isArray(body?.removed) && (flags.removeButton || flags.deleteAllButton)
    ? [...new Set(body.removed.filter((id) => typeof id === "string" && id && id.length <= 40))]
    : [];
  if (
    !Array.isArray(incoming) ||
    incoming.length > MAX_ITEMS ||
    removedNow.length > MAX_REMOVED_PER_REQUEST ||
    !(clientEpoch == null || clientEpoch === "join" || Number.isInteger(clientEpoch))
  ) {
    return { status: 400, body: { error: "Body must be { library: [...] }" } };
  }

  const isCurrent =
    clientEpoch === "join" ||
    clientEpoch === serverEpoch ||
    (clientEpoch == null && serverEpoch === 0);
  if (!isCurrent) {
    return {
      status: 200,
      body: { library: doc?.library ?? [], epoch: serverEpoch, removalSeq: serverSeq, reset: true },
    };
  }

  // Record this device's removals under a new sequence number.
  let removals = doc?.removals ?? [];
  let seq = serverSeq;
  if (removedNow.length > 0) {
    seq += 1;
    const gone = new Set(removedNow);
    removals = [
      ...removals.filter((r) => !gone.has(r.id)),
      ...removedNow.map((id) => ({ id, seq })),
    ].slice(-MAX_REMOVALS);
  }

  // Videos this device has not heard are removed must not be uploaded again.
  const blocked = new Set(removals.filter((r) => r.seq > clientSeq).map((r) => r.id));
  const keep = (video) => !blocked.has(video?.id?.videoId);
  const merged = mergeLibrary((doc?.library ?? []).filter(keep), incoming.filter(keep));

  await rooms.updateOne(
    { _id: roomId },
    { $set: { library: merged, removals, removalSeq: seq } },
    { upsert: true }
  );
  // The catalog documents use the same room id as their owner. The video is
  // removed from every saved list, "My Searches" included.
  if (catalog && removedNow.length > 0) {
    await catalog.deleteMany({ owner: roomId, "video.id.videoId": { $in: removedNow } });
  }
  return {
    status: 200,
    body: { library: merged, epoch: serverEpoch, removalSeq: seq, reset: false },
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
    const result = await handleLibrary(
      await getRooms(),
      roomId,
      req.body,
      await getCatalog(),
      await getAppFlags()
    );
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("library sync failed", error);
    return res.status(500).json({ error: "Could not sync the library" });
  }
}
