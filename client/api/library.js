// Vercel serverless function: the saved video library for one sync code, stored
// in MongoDB. The client sends its library; the server merges it with the
// stored one (union by video id) and returns the result.
import { getRooms, readSyncCode, roomIdFor, slimVideo } from "./_db.js";

const MAX_ITEMS = 20000;

export function mergeLibrary(stored, incoming) {
  const byId = new Map();
  for (const video of [...stored, ...incoming]) {
    const item = slimVideo(video);
    if (item && !byId.has(item.id.videoId)) byId.set(item.id.videoId, item);
  }
  return [...byId.values()].slice(0, MAX_ITEMS);
}

/**
 * Core logic, separated from the HTTP layer so it can be tested with any collection.
 *
 * The room keeps a `libraryEpoch` that goes up every time the library is
 * deleted. A device sends the epoch it last saw:
 *   - same epoch, or "join" (a device that just entered the sync code): its
 *     library is merged into the stored one;
 *   - older epoch: the library was deleted since this device last synced, so its
 *     copy is stale and is replaced by the stored one instead of being merged
 *     (otherwise deleted videos would come back from the other devices).
 */
export async function handleLibrary(rooms, roomId, body) {
  const doc = await rooms.findOne(
    { _id: roomId },
    { projection: { library: 1, libraryEpoch: 1 } }
  );
  const serverEpoch = doc?.libraryEpoch ?? 0;

  // { clear: true } empties the stored library for every device.
  if (body?.clear === true) {
    const epoch = serverEpoch + 1;
    await rooms.updateOne(
      { _id: roomId },
      { $set: { library: [], libraryEpoch: epoch } },
      { upsert: true }
    );
    return { status: 200, body: { library: [], epoch, reset: true } };
  }

  const incoming = body?.library;
  const clientEpoch = body?.epoch;
  if (
    !Array.isArray(incoming) ||
    incoming.length > MAX_ITEMS ||
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
      body: { library: doc?.library ?? [], epoch: serverEpoch, reset: true },
    };
  }

  const merged = mergeLibrary(doc?.library ?? [], incoming);
  await rooms.updateOne({ _id: roomId }, { $set: { library: merged } }, { upsert: true });
  return { status: 200, body: { library: merged, epoch: serverEpoch, reset: false } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const code = readSyncCode(req);
  if (!code) return res.status(401).json({ error: "Missing or too short sync code" });

  try {
    const result = await handleLibrary(await getRooms(), roomIdFor(code), req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("library sync failed", error);
    return res.status(500).json({ error: "Could not sync the library" });
  }
}
