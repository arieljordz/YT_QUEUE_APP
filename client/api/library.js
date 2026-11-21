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

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handleLibrary(rooms, roomId, body) {
  // { clear: true } empties the stored library.
  if (body?.clear === true) {
    await rooms.updateOne({ _id: roomId }, { $set: { library: [] } }, { upsert: true });
    return { status: 200, body: { library: [] } };
  }
  const incoming = body?.library;
  if (!Array.isArray(incoming) || incoming.length > MAX_ITEMS) {
    return { status: 400, body: { error: "Body must be { library: [...] }" } };
  }

  const doc = await rooms.findOne({ _id: roomId }, { projection: { library: 1 } });
  const merged = mergeLibrary(doc?.library ?? [], incoming);
  await rooms.updateOne({ _id: roomId }, { $set: { library: merged } }, { upsert: true });
  return { status: 200, body: { library: merged } };
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
