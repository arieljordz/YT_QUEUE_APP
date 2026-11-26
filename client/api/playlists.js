// Vercel serverless function: each room's personal playlists, stored in
// room_playlists, one document per playlist:
//   { _id, roomId, name, description, videoIds: [id], createdAt, updatedAt }
//
// A playlist only keeps the ids of Library videos, in playback order; the videos
// themselves stay in the library (library.js). A video removed from the library
// keeps its id here and the app shows it as unavailable.
//
// Every request needs the Personal playlists feature flag (see flags.js).
//
//   POST {}                                                  -> { playlists }
//   POST { create: { id, name, description?, videoIds? } }   -> { playlists }
//   POST { update: { id, name?, description?, videoIds? } }  -> { playlists }
//   POST { delete: { id } }                                  -> { playlists }
import { getPlaylists } from "./_db.js";
import { requireRoom } from "./_session.js";
import { getAppFlags } from "./flags.js";

export const MAX_PLAYLISTS = 200;
export const MAX_PLAYLIST_VIDEOS = 2000;
export const MAX_NAME = 80;
export const MAX_DESCRIPTION = 300;

const fail = (status, error) => ({ status, body: { error } });

// Ids are made by the browser (so a new playlist shows at once).
const validId = (id) => typeof id === "string" && /^[a-z0-9-]{6,40}$/i.test(id);
const validVideoIds = (list) =>
  Array.isArray(list) &&
  list.length <= MAX_PLAYLIST_VIDEOS &&
  list.every((id) => typeof id === "string" && id.length > 0 && id.length <= 40);

const publicPlaylist = (d) => ({
  id: d._id,
  name: d.name,
  description: d.description ?? "",
  videoIds: d.videoIds ?? [],
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

/** The fields a create or update may set. Returns { fields } or { error }. */
function readFields(input, creating) {
  const fields = {};
  if (creating || input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) return { error: "Give the playlist a name" };
    if (name.length > MAX_NAME) return { error: `Keep the name under ${MAX_NAME} characters` };
    fields.name = name;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") return { error: "Invalid description" };
    const description = input.description.trim();
    if (description.length > MAX_DESCRIPTION) {
      return { error: `Keep the description under ${MAX_DESCRIPTION} characters` };
    }
    fields.description = description;
  }
  if (input.videoIds !== undefined) {
    if (!validVideoIds(input.videoIds)) return { error: "Invalid videos" };
    fields.videoIds = [...new Set(input.videoIds)];
  }
  return { fields };
}

async function listPlaylists(playlists, roomId) {
  const docs = await playlists.find({ roomId }).sort({ updatedAt: -1 }).toArray();
  return docs.map(publicPlaylist);
}

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handlePlaylists(playlists, roomId, body, flags, now = new Date()) {
  if (!flags.personalPlaylists) {
    return { status: 403, body: { error: "Playlists are turned off", disabled: true } };
  }

  if (body?.create !== undefined) {
    const input = body.create ?? {};
    if (!validId(input.id)) return fail(400, "Invalid playlist");
    const { fields, error } = readFields(input, true);
    if (error) return fail(400, error);
    if ((await playlists.countDocuments({ roomId })) >= MAX_PLAYLISTS) {
      return fail(400, `A room can have up to ${MAX_PLAYLISTS} playlists`);
    }
    try {
      // $setOnInsert: sending the same create twice (a retry) changes nothing.
      await playlists.updateOne(
        { _id: input.id, roomId },
        {
          $setOnInsert: {
            description: "",
            videoIds: [],
            ...fields,
            roomId,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
    } catch (e) {
      // The id belongs to another room's playlist.
      if (e?.code === 11000) return fail(409, "Invalid playlist");
      throw e;
    }
  } else if (body?.update !== undefined) {
    const input = body.update ?? {};
    if (!validId(input.id)) return fail(400, "Invalid playlist");
    const { fields, error } = readFields(input, false);
    if (error) return fail(400, error);
    const result = await playlists.updateOne(
      { _id: input.id, roomId },
      { $set: { ...fields, updatedAt: now } }
    );
    if (result.matchedCount === 0) return fail(404, "This playlist no longer exists");
  } else if (body?.delete !== undefined) {
    if (!validId(body.delete?.id)) return fail(400, "Invalid playlist");
    await playlists.deleteOne({ _id: body.delete.id, roomId });
  }

  return { status: 200, body: { playlists: await listPlaylists(playlists, roomId) } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const roomId = await requireRoom(req);
    if (!roomId) return res.status(401).json({ error: "Not in a room" });
    const playlists = await getPlaylists();
    await playlists.createIndex({ roomId: 1, updatedAt: -1 });
    const result = await handlePlaylists(playlists, roomId, req.body, await getAppFlags());
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("playlists request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
