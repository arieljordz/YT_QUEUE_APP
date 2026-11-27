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

/*
 * Changes are made inside the database, in one update of the stored lists (an
 * update pipeline), never by reading a list, changing it here and writing it
 * back: two devices starring songs, or two songs ending, at the same moment
 * would otherwise lose one change. Values sent by the browser go in through
 * $literal, so a title starting with "$" stays text.
 */

/** favorites = (stored - remove) + the added ids not there yet, unless that is more than MAX_FAVORITES. */
function favoritesStage(add, remove) {
  const stored = { $ifNull: ["$favorites", []] };
  const kept = { $filter: { input: stored, cond: { $not: [{ $in: ["$$this", { $literal: remove }] }] } } };
  const changed = {
    $let: {
      vars: { kept },
      in: {
        $concatArrays: [
          "$$kept",
          { $filter: { input: { $literal: add }, cond: { $not: [{ $in: ["$$this", "$$kept"] }] } } },
        ],
      },
    },
  };
  // Too many: the list stays as it was (the handler then answers 400).
  return {
    $set: {
      favorites: {
        $let: { vars: { next: changed }, in: { $cond: [{ $gt: [{ $size: "$$next" }, MAX_FAVORITES] }, stored, "$$next"] } },
      },
    },
  };
}

/** history = this video, then the others without it, newest first, at most MAX_HISTORY. */
function historyStage(video) {
  const others = {
    $filter: {
      input: { $ifNull: ["$history", []] },
      cond: { $ne: ["$$this.id.videoId", { $literal: video.id.videoId }] },
    },
  };
  return { $set: { history: { $slice: [{ $concatArrays: [[{ $literal: video }], others] }, MAX_HISTORY] } } };
}

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handleExtras(rooms, roomId, body) {
  const projection = { favorites: 1, history: 1 };
  const stages = [];
  let add = [];
  let remove = [];

  if (body?.favorites !== undefined) {
    add = body.favorites?.add ?? [];
    remove = body.favorites?.remove ?? [];
    if (!validIds(add) || !validIds(remove)) return fail(400, "Invalid favorites");
    // An id both added and removed ends up removed, as before.
    const removing = new Set(remove);
    add = [...new Set(add)].filter((id) => !removing.has(id));
    stages.push(favoritesStage(add, [...removing]));
  }

  if (body?.played !== undefined) {
    const video = slimVideo(body.played);
    if (!video) return fail(400, "Invalid video");
    stages.push(historyStage(video));
  }

  const doc =
    stages.length > 0
      ? await rooms.findOneAndUpdate({ _id: roomId }, stages, { upsert: true, returnDocument: "after", projection })
      : await rooms.findOne({ _id: roomId }, { projection });
  const favorites = doc?.favorites ?? [];
  const history = doc?.history ?? [];

  // The favorites stage leaves the list as it was when it would get too long.
  const gone = new Set(remove);
  const have = new Set(favorites);
  if (add.some((id) => !gone.has(id) && !have.has(id))) return fail(400, "Too many favorites");

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
