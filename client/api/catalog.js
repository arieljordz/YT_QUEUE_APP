/* global process */
// Vercel serverless function: video lists ("catalogs") that the user collects
// from YouTube (a channel, an artist, a search) and keeps in MongoDB, so they
// can be added to the library later without searching again.
//
// Every request needs a sync code. Imported lists are SHARED: every room sees
// the lists imported by any room and can add them to its library. Only the room
// that imported a list can delete its part of it. "My Searches" is private to
// the room that saved it.
//
//   GET    /api/catalog               -> { catalogs: [{ name, count, ids, mine }] }
//                                        (ids = the video ids in the list; mine =
//                                         this room imported part of it)
//   GET    /api/catalog?name=X&after=N -> { videos: [...], next }  (up to 1,000 videos;
//                                        next = the `after` for the next page, or null)
//   DELETE /api/catalog?name=X        -> { deleted }   (this room's part only; needs the
//                                        "deleteListButton" feature flag)
//   POST   /api/catalog { save: video } -> adds one video to the "My Searches" list
//   POST   /api/catalog               -> collects ONE page (50) of YouTube
//          { name, channel?, channelId?, title?, pageToken?, offset?, any?, noShorts?, newest? }
//          channel = only videos of that channel; title = only videos whose title
//          contains all the words of this text (at least one of the two is needed);
//          any = also keep videos that can't play embedded;
//          noShorts = skip YouTube Shorts;
//          newest = newest first (search only; a channel is always newest first)
//          -> { fetched, added, nextPageToken?, channelId?, channelTitle? }
//     With a channel, the channel's uploads playlist is read: every upload,
//     newest first, 1 quota unit per page (+1 for the details lookup). Without
//     one, YouTube search is used: 100 units per page and about 500 results at most.
//     The browser calls POST repeatedly until it has enough videos, so no
//     single request runs long.
import { getAppFlags } from "./flags.js";
import { requireAdmin } from "./_admin.js";
import { requireRoom } from "./_session.js";
import {
  SEARCHES_LIST,
  decodeEntities,
  getCatalog,
  isSearchesList,
  slimVideo,
} from "./_db.js";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";
// Shorts are up to 3 minutes long and vertical. The API has no "is a Short" flag.
const SHORT_MAX_SECONDS = 180;
const ALWAYS_SHORT_SECONDS = 60;
const MAX_VIDEOS = 8000; // the most videos one list holds
const LIST_PAGE_SIZE = 1000; // videos per GET ?name= response
const MAX_NAME = 60;
const CHANNEL_ID = /^UC[\w-]{20,}$/;
const PAGE_TOKEN = /^[\w-]{1,200}$/;

const text = (value) => (typeof value === "string" ? value.trim() : "");
const cleanName = (value) => {
  const name = text(value);
  return name && name.length <= MAX_NAME ? name : null;
};

/** True when the title contains every word of `wanted` (ignoring case). */
export function titleMatches(title, wanted) {
  const haystack = decodeEntities(title).toLowerCase();
  return wanted
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** "PT1H2M5S" -> 3725. Returns null for live streams and anything unreadable. */
function parseIsoDuration(value) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? "");
  if (!match) return null;
  const [, d = 0, h = 0, m = 0, sec = 0] = match;
  const total = Number(d) * 86400 + Number(h) * 3600 + Number(m) * 60 + Number(sec);
  return total > 0 ? total : null;
}

/** True when a videos.list item looks like a YouTube Short. */
export function looksLikeShort(item) {
  const seconds = parseIsoDuration(item?.contentDetails?.duration);
  if (seconds === null || seconds > SHORT_MAX_SECONDS) return false;
  if (seconds <= ALWAYS_SHORT_SECONDS) return true;
  const width = Number(item?.player?.embedWidth);
  const height = Number(item?.player?.embedHeight);
  return width > 0 && height > width; // vertical
}

/**
 * Looks up up to 50 videos. Costs 1 quota unit. Returns { quota: true }, or
 * { details } (a Map id -> { embeddable, short }; videos that are private or
 * deleted are missing from it), or {} when the lookup failed.
 */
async function getDetails(fetchFn, apiKey, ids) {
  if (ids.length === 0) return { details: new Map() };
  const params = new URLSearchParams({
    part: "status,contentDetails,player",
    id: ids.slice(0, 50).join(","),
    maxWidth: "200", // makes YouTube send the player's width and height
    key: apiKey,
  });
  const res = await fetchFn(`${VIDEOS_URL}?${params}`);
  if (res.status === 403) return { quota: true };
  if (!res.ok) return {};
  const data = await res.json();
  const details = new Map();
  for (const item of data.items ?? []) {
    details.set(item.id, {
      embeddable: item.status?.embeddable !== false,
      short: looksLikeShort(item),
    });
  }
  return { details };
}

/** A playlistItems.list item in the same shape as a search result. */
function fromPlaylistItem(item) {
  const snippet = item?.snippet;
  return {
    id: { videoId: snippet?.resourceId?.videoId },
    snippet: {
      title: snippet?.title,
      channelTitle: snippet?.videoOwnerChannelTitle ?? snippet?.channelTitle,
      thumbnails: snippet?.thumbnails,
    },
  };
}

const fail = (status, error) => ({ status, body: { error } });

export async function handleList(catalog, owner, query) {
  // Imported lists are visible to every room; "My Searches" only to its own room.
  const visible = { $or: [{ catalog: { $ne: SEARCHES_LIST } }, { owner }] };

  const name = cleanName(query?.name);
  if (!name) {
    const rows = await catalog
      .aggregate([
        { $match: visible },
        {
          $group: {
            _id: "$catalog",
            ids: { $addToSet: "$video.id.videoId" },
            mine: { $max: { $cond: [{ $eq: ["$owner", owner] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    return {
      status: 200,
      body: {
        catalogs: rows.map((r) => ({
          name: r._id,
          count: r.ids.length,
          ids: r.ids,
          mine: r.mine === 1,
        })),
      },
    };
  }

  // Big lists come in pages: sending thousands of videos at once takes longer
  // than a function may run. `after` = how many documents were already sent.
  const after = Number(query?.after);
  const skip = Number.isInteger(after) && after > 0 ? Math.min(after, MAX_VIDEOS) : 0;
  const limit = Math.min(LIST_PAGE_SIZE, MAX_VIDEOS - skip);
  const filter = name === SEARCHES_LIST ? { owner, catalog: name } : { catalog: name };
  const docs =
    limit > 0
      ? await catalog
          .find(filter, { projection: { _id: 0, video: 1 } })
          .sort({ order: 1, _id: 1 })
          .skip(skip)
          .limit(limit)
          .toArray()
      : [];
  // Two rooms may have imported the same video into the same list.
  const seen = new Set();
  const videos = [];
  for (const doc of docs) {
    if (!seen.has(doc.video.id.videoId)) {
      seen.add(doc.video.id.videoId);
      videos.push(doc.video);
    }
  }
  const more = docs.length === limit && skip + limit < MAX_VIDEOS;
  return { status: 200, body: { videos, next: more ? skip + docs.length : null } };
}

export async function handleDelete(catalog, owner, query, flags) {
  // Deleting a saved list needs its feature flag (see flags.js) to be on.
  if (!flags?.deleteListButton) return fail(403, "Deleting saved lists is turned off");
  const name = cleanName(query?.name);
  if (!name) return fail(400, "Missing list name");
  const result = await catalog.deleteMany({ owner, catalog: name });
  return { status: 200, body: { deleted: result.deletedCount } };
}

/** Calls a YouTube API. `fetchFn` is injectable for tests. */
async function youtubeGet(fetchFn, url, params) {
  const res = await fetchFn(`${url}?${new URLSearchParams(params)}`);
  if (res.status === 403) return { quota: true };
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { failed: true };
  return { data: await res.json() };
}
const youtubeSearch = (fetchFn, params) => youtubeGet(fetchFn, SEARCH_URL, params);

/** Saves one video the user searched for and queued into the "My Searches" list. */
export async function handleSaveSearched(catalog, owner, body) {
  const video = slimVideo(body?.save);
  if (!video) return fail(400, "Invalid video");
  await catalog.updateOne(
    { _id: `${owner}:${SEARCHES_LIST}:${video.id.videoId}` },
    {
      $set: { owner, catalog: SEARCHES_LIST, video },
      // Keeps its place if the same video is queued again.
      $setOnInsert: { order: Date.now() },
    },
    { upsert: true }
  );
  return { status: 200, body: { saved: true } };
}

export async function handleCollect(catalog, owner, body, { apiKey, fetchFn = fetch }) {
  const name = cleanName(body?.name);
  if (!name) return fail(400, `Give the list a name (up to ${MAX_NAME} characters)`);
  if (isSearchesList(name)) {
    return fail(400, `"${SEARCHES_LIST}" is reserved for videos you search and queue. Pick another name.`);
  }

  const title = text(body?.title);
  const channel = text(body?.channel);
  let channelId = CHANNEL_ID.test(text(body?.channelId)) ? text(body.channelId) : "";
  if (!title && !channel && !channelId) return fail(400, "Enter a channel, a title, or both");

  const offset = Number.isInteger(body?.offset) && body.offset >= 0 ? body.offset : 0;
  if (offset >= MAX_VIDEOS) return fail(400, "That list is full");
  const pageToken = PAGE_TOKEN.test(text(body?.pageToken)) ? text(body.pageToken) : "";
  if (!apiKey) return fail(500, "The YouTube API key is not configured on the server");

  // Turn a channel name into its id the first time (the browser passes it back after).
  let channelTitle;
  if (!channelId && channel) {
    if (CHANNEL_ID.test(channel)) {
      channelId = channel;
    } else {
      const found = await youtubeSearch(fetchFn, {
        part: "snippet",
        q: channel,
        type: "channel",
        maxResults: "1",
        key: apiKey,
      });
      if (found.quota) return fail(429, "quota");
      if (found.failed || found.notFound) return fail(502, "YouTube channel lookup failed");
      const item = found.data.items?.[0];
      if (!item) return fail(404, `No channel found for "${channel}"`);
      channelId = item.id.channelId;
      channelTitle = item.snippet.title;
    }
  }

  const embeddableOnly = body?.any !== true;
  const noShorts = body?.noShorts === true;

  let result;
  let items;
  if (channelId) {
    // Every channel's uploads playlist id is its channel id with "UU" for "UC".
    const params = {
      part: "snippet",
      playlistId: `UU${channelId.slice(2)}`,
      maxResults: "50",
      key: apiKey,
    };
    if (pageToken) params.pageToken = pageToken;
    result = await youtubeGet(fetchFn, PLAYLIST_ITEMS_URL, params);
    if (result.notFound) result = { data: {} }; // a channel with no uploads
    items = (result.data?.items ?? []).map(fromPlaylistItem);
  } else {
    const params = { part: "snippet", type: "video", maxResults: "50", key: apiKey };
    params.q = title; // helps YouTube find them; the title check below is the real filter
    if (embeddableOnly) params.videoEmbeddable = "true";
    if (body?.newest === true) params.order = "date";
    if (pageToken) params.pageToken = pageToken;
    result = await youtubeSearch(fetchFn, params);
    items = result.data?.items ?? [];
  }
  if (result.quota) return fail(429, "quota");
  if (result.failed || result.notFound) return fail(502, "YouTube request failed");

  // Search already filtered embeddable videos; the playlist did not.
  let details = null;
  if (noShorts || (channelId && embeddableOnly)) {
    const ids = items.map((item) => item?.id?.videoId).filter(Boolean);
    const lookup = await getDetails(fetchFn, apiKey, ids);
    if (lookup.quota) return fail(429, "quota");
    details = lookup.details ?? null; // a failed lookup keeps every video
  }

  const operations = [];
  items.forEach((item) => {
    const video = slimVideo(item);
    if (!video) return;
    if (details) {
      const info = details.get(video.id.videoId);
      if (!info) return; // private or deleted
      if (noShorts && info.short) return;
      if (channelId && embeddableOnly && !info.embeddable) return;
    }
    // Only videos whose own title contains the text (YouTube also matches descriptions).
    if (title && !titleMatches(video.snippet.title, title)) return;
    operations.push({
      updateOne: {
        filter: { _id: `${owner}:${name}:${video.id.videoId}` },
        update: { $set: { owner, catalog: name, video, order: offset + operations.length } },
        upsert: true,
      },
    });
  });
  if (operations.length > 0) await catalog.bulkWrite(operations);

  return {
    status: 200,
    body: {
      fetched: items.length,
      added: operations.length,
      nextPageToken: result.data.nextPageToken,
      channelId: channelId || undefined,
      channelTitle,
    },
  };
}

let indexReady = false;

export default async function handler(req, res) {
  try {
    const owner = await requireRoom(req);
    if (!owner) return res.status(401).json({ error: "Not in a room" });
    const catalog = await getCatalog();
    if (!indexReady) {
      await catalog.createIndex({ owner: 1, catalog: 1, order: 1 });
      await catalog.createIndex({ catalog: 1, order: 1 });
      indexReady = true;
    }

    // Saving a searched video is part of normal use. Everything else (listing,
    // importing and deleting lists) is in Settings and needs the admin sign-in.
    const saving = req.method === "POST" && req.body?.save !== undefined;
    if (!saving && !(await requireAdmin(req))) {
      return res.status(401).json({ error: "Sign in as admin first.", adminRequired: true });
    }

    let result;
    if (req.method === "GET") result = await handleList(catalog, owner, req.query);
    else if (req.method === "DELETE") {
      result = await handleDelete(catalog, owner, req.query, await getAppFlags());
    }
    else if (req.method === "POST") {
      const apiKey = process.env.YT_API_KEY || process.env.VITE_YT_API_KEY;
      result =
        req.body?.save !== undefined
          ? await handleSaveSearched(catalog, owner, req.body)
          : await handleCollect(catalog, owner, req.body, { apiKey });
    } else {
      res.setHeader("Allow", "GET, POST, DELETE");
      return res.status(405).json({ error: "Method not allowed" });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("catalog request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
