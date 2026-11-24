// Vercel serverless function: the small per-room lists that make the Library
// nicer, stored on the room document:
//   favorites - ids of the videos the user starred
//   history   - the songs that played most recently (newest first)
//
//   POST {}                                   -> { favorites: [id], history: [video] }
//   POST { favorites: { add: [id], remove: [id] } } -> same as above, after the change
//   POST { played: video }                    -> same as above, after the change
import { getRooms, slimVideo } from "./_db.js";
import { requireRoom } from "./_session.js";

export const MAX_FAVORITES = 5000;
export const MAX_HISTORY = 50;
const MAX_IDS_PER_REQUEST = 5000;

const fail = (status, error) => ({ status, body: { error } });
const validIds = (list) =>
  Array.isArray(list) &&
  list.length <= MAX_IDS_PER_REQUEST &&
  list.every((id) => typeof id === "string" && id.length > 0 && id.length <= 40);

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handleExtras(rooms, roomId, body) {
  const doc = await rooms.findOne({ _id: roomId }, { projection: { favorites: 1, history: 1 } });
  let favorites = doc?.favorites ?? [];
  let history = doc?.history ?? [];
  const set = {};

  if (body?.favorites !== undefined) {
    const add = body.favorites?.add ?? [];
    const remove = body.favorites?.remove ?? [];
    if (!validIds(add) || !validIds(remove)) return fail(400, "Invalid favorites");
    const gone = new Set(remove);
    favorites = [...new Set([...favorites, ...add])].filter((id) => !gone.has(id));
    if (favorites.length > MAX_FAVORITES) return fail(400, "Too many favorites");
    set.favorites = favorites;
  }

  if (body?.played !== undefined) {
    const video = slimVideo(body.played);
    if (!video) return fail(400, "Invalid video");
    history = [video, ...history.filter((v) => v.id.videoId !== video.id.videoId)].slice(
      0,
      MAX_HISTORY
    );
    set.history = history;
  }

  if (Object.keys(set).length > 0) {
    await rooms.updateOne({ _id: roomId }, { $set: set }, { upsert: true });
  }
  return { status: 200, body: { favorites, history } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const roomId = await requireRoom(req);
    if (!roomId) return res.status(401).json({ error: "Not in a room" });
    const result = await handleExtras(await getRooms(), roomId, req.body);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("extras request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
