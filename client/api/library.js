// Vercel serverless function: each room's saved video library, synced between
// devices by sending changes only.
//
// Storage: one document per video in `room_library`:
//   { _id: "<roomId>:<videoId>", roomId, videoId, video, seq }        a video
//   { _id: "<roomId>:<videoId>", roomId, videoId, removed: true, seq } a removal
// Every add or removal takes the room's next sequence number (rooms.librarySeq),
// so "what changed since N" is one indexed query. Removals stay as small
// markers so devices that were offline still hear about them.
//
// POST { v: 2, epoch, since, added: [video], removed: [videoId] }
//   -> { epoch, since, reset, changes: [{ video } | { id, removed: true }], more }
//   Saves the device's adds and removals, then answers with the changes after
//   `since`, at most PAGE_SIZE at a time (`more` = ask again for the rest).
//   `since: 0` is a full download.
// POST { v: 2, clear: true } -> { epoch }   deletes the whole library
//
// Deleting everything: the room keeps a `libraryEpoch` that goes up every time
// the library is deleted. A device sends the epoch it last saw ("join" for a
// device that just entered the room). An older epoch means its copy is stale:
// its changes are dropped and it gets `reset: true` and a full download.
//
// Removing single videos: a device that has not yet heard about a removal
// (its `since` is before the removal) cannot add that video back. One that has
// heard about it can add it again normally. Removals (and Delete all) are
// refused unless their feature flag (see flags.js) is on for the room. Videos
// removed one by one are also deleted from this room's saved lists
// (saved_list_videos); deleting the whole library does not touch them.
//
// Rooms from before this format kept the library as one array in the room
// document (rooms.library). The first request moves it here inside the
// database; the old array is left untouched as a backup. Older copies of the app
// (no `v: 2`) are answered 409 { upgrade: true } and send their videos again
// once they update.
import { getAppFlags } from "./flags.js";
import { requireRoom } from "./_session.js";
import { getSavedListVideos, getRoomLibrary, getRooms, slimVideo } from "./_db.js";

export const PAGE_SIZE = 500;
export const MAX_ITEMS = 20000;
const MAX_PER_REQUEST = 500;

const docId = (roomId, videoId) => `${roomId}:${videoId}`;
const isVideoId = (id) => typeof id === "string" && id.length > 0 && id.length <= 40;

/** Copies an old-style room library (one array) into room_library, inside the database. */
export async function moveOldLibrary(rooms, videos, roomId) {
  const into = { into: videos.collectionName, on: "_id", whenMatched: "keepExisting", whenNotMatched: "insert" };
  const entry = (field, i, extra) => ({
    $project: {
      _id: { $concat: [roomId, ":", field] },
      roomId: { $literal: roomId },
      videoId: field,
      seq: i,
      ...extra,
    },
  });
  // The videos, numbered 1..n in their current order.
  await rooms
    .aggregate([
      { $match: { _id: roomId } },
      { $project: { library: 1 } },
      { $unwind: { path: "$library", includeArrayIndex: "i" } },
      { $match: { "library.id.videoId": { $type: "string", $ne: "" } } },
      entry("$library.id.videoId", { $add: ["$i", 1] }, { video: "$library" }),
      { $merge: into },
    ])
    .toArray();
  // The remembered removals, numbered after the videos.
  await rooms
    .aggregate([
      { $match: { _id: roomId } },
      { $project: { removals: 1, n: { $size: { $ifNull: ["$library", []] } } } },
      { $unwind: { path: "$removals", includeArrayIndex: "i" } },
      { $match: { "removals.id": { $type: "string", $ne: "" } } },
      entry("$removals.id", { $add: ["$n", "$i", 1] }, { removed: { $literal: true } }),
      { $merge: into },
    ])
    .toArray();
  // Only the first request to finish sets the counter (later ones match nothing).
  await rooms.updateOne({ _id: roomId, libraryMoved: { $ne: true } }, [
    {
      $set: {
        libraryMoved: true,
        librarySeq: { $add: [{ $size: { $ifNull: ["$library", []] } }, { $size: { $ifNull: ["$removals", []] } }] },
      },
    },
  ]);
}

/** Reserves `count` sequence numbers; returns the first one. */
async function reserveSeq(rooms, roomId, count) {
  const room = await rooms.findOneAndUpdate(
    { _id: roomId },
    { $inc: { librarySeq: count } },
    { upsert: true, returnDocument: "after", projection: { librarySeq: 1 } }
  );
  return room.librarySeq - count + 1;
}

/** Saves a device's adds and removals. Returns the ids actually removed. */
async function applyChanges(rooms, videos, roomId, { added, removed, since }) {
  const removedIds = [...new Set(removed)];
  const gone = new Set(removedIds);

  // Adds: skip videos already there, and videos removed after this device last synced.
  const incoming = new Map();
  for (const raw of added) {
    const video = slimVideo(raw);
    if (video && !gone.has(video.id.videoId)) incoming.set(video.id.videoId, video);
  }
  if (incoming.size > 0) {
    const existing = await videos
      .find(
        { _id: { $in: [...incoming.keys()].map((id) => docId(roomId, id)) } },
        { projection: { videoId: 1, removed: 1, seq: 1 } }
      )
      .toArray();
    for (const doc of existing) {
      if (!doc.removed || doc.seq > since) incoming.delete(doc.videoId);
    }
  }
  if (incoming.size > 0) {
    const live = await videos.countDocuments({ roomId, removed: { $ne: true } });
    const room = Math.max(0, MAX_ITEMS - live);
    if (incoming.size > room) for (const id of [...incoming.keys()].slice(room)) incoming.delete(id);
  }

  const count = incoming.size + removedIds.length;
  if (count === 0) return [];
  let seq = await reserveSeq(rooms, roomId, count);
  const ops = [];
  for (const [videoId, video] of incoming) {
    ops.push({
      replaceOne: { filter: { _id: docId(roomId, videoId) }, replacement: { roomId, videoId, video, seq: seq++ }, upsert: true },
    });
  }
  for (const videoId of removedIds) {
    ops.push({
      replaceOne: { filter: { _id: docId(roomId, videoId) }, replacement: { roomId, videoId, removed: true, seq: seq++ }, upsert: true },
    });
  }
  await videos.bulkWrite(ops, { ordered: false });
  return removedIds;
}

/** Core logic, separated from the HTTP layer so it can be tested with any collections. */
export async function handleLibrary({ rooms, videos, catalog }, roomId, body, flags) {
  if (body?.v !== 2) {
    return { status: 409, body: { error: "Reload the app to sync the library", upgrade: true } };
  }

  let room = await rooms.findOne({ _id: roomId }, { projection: { libraryEpoch: 1, libraryMoved: 1 } });
  const serverEpoch = room?.libraryEpoch ?? 0;
  if (room && !room.libraryMoved) {
    // Moving a big library takes seconds: it gets a request of its own, and the
    // device asks again (with the same changes) for the actual sync.
    await moveOldLibrary(rooms, videos, roomId);
    if (body.clear !== true) {
      const since = Number.isInteger(body.since) ? body.since : 0;
      return { status: 200, body: { epoch: serverEpoch, reset: false, since, changes: [], more: true, retry: true } };
    }
  }

  if (body.clear === true) {
    if (!flags.deleteAllButton) return { status: 403, body: { error: "Delete all is turned off" } };
    room = await rooms.findOneAndUpdate(
      { _id: roomId },
      { $inc: { libraryEpoch: 1 }, $set: { libraryMoved: true } },
      { upsert: true, returnDocument: "after", projection: { libraryEpoch: 1 } }
    );
    await videos.deleteMany({ roomId });
    return { status: 200, body: { epoch: room.libraryEpoch } };
  }

  const { epoch, since, added = [], removed = [] } = body;
  if (
    !(epoch == null || epoch === "join" || Number.isInteger(epoch)) ||
    !(Number.isInteger(since) && since >= 0) ||
    !Array.isArray(added) ||
    added.length > MAX_PER_REQUEST ||
    !Array.isArray(removed) ||
    removed.length > MAX_PER_REQUEST ||
    !removed.every(isVideoId)
  ) {
    return { status: 400, body: { error: "Invalid library sync request" } };
  }

  const isCurrent = epoch === "join" || epoch === serverEpoch || (epoch == null && serverEpoch === 0);
  const from = isCurrent ? since : 0;
  if (isCurrent) {
    // Removing only counts while the Remove, Delete all or Delete selected flag is on.
    const allowed = flags.removeButton || flags.deleteAllButton || flags.deleteSelectedButton ? removed : [];
    const removedIds = await applyChanges(rooms, videos, roomId, { added, removed: allowed, since });
    if (catalog && removedIds.length > 0) {
      await catalog.deleteMany({ owner: roomId, "video.id.videoId": { $in: removedIds } });
    }
  }

  // Removal markers come along even in a full download: a video this device
  // just sent may be one that was removed elsewhere, and the marker takes it out.
  const docs = await videos
    .find({ roomId, seq: { $gt: from } }, { projection: { _id: 0, videoId: 1, video: 1, removed: 1, seq: 1 } })
    .sort({ seq: 1 })
    .limit(PAGE_SIZE)
    .toArray();
  return {
    status: 200,
    body: {
      epoch: serverEpoch,
      reset: !isCurrent,
      since: docs.length ? docs[docs.length - 1].seq : from,
      changes: docs.map((d) => (d.removed ? { id: d.videoId, removed: true } : { video: d.video })),
      more: docs.length === PAGE_SIZE,
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
    const cols = { rooms: await getRooms(), videos: await getRoomLibrary(), catalog: await getSavedListVideos() };
    const result = await handleLibrary(cols, roomId, req.body, await getAppFlags());
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("library sync failed", error);
    return res.status(500).json({ error: "Could not sync the library" });
  }
}
