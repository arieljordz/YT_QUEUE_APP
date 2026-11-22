/* global process */
// Vercel serverless function: video lists ("catalogs") that the user collects
// from YouTube (a channel, an artist, a search) and keeps in MongoDB, so they
// can be added to the library later without searching again.
//
// Every request needs the sync code header; lists belong to that code only.
//
//   GET    /api/catalog               -> { catalogs: [{ name, count, ids }] }
//                                        (ids = the video ids in the list)
//   GET    /api/catalog?name=X        -> { videos: [...] }
//   DELETE /api/catalog?name=X        -> { deleted }
//   POST   /api/catalog { save: video } -> adds one video to the "My Searches" list
//   POST   /api/catalog               -> collects ONE page (50) of YouTube
//          { name, channel?, channelId?, title?, pageToken?, offset?, any? }
//          channel = only videos of that channel; title = only videos whose title
//          contains all the words of this text (at least one of the two is needed)
//          -> { fetched, added, nextPageToken?, channelId?, channelTitle? }
//     The browser calls POST repeatedly until it has enough videos, so no
//     single request runs long.
import {
  SEARCHES_LIST,
  getCatalog,
  isSearchesList,
  readSyncCode,
  roomIdFor,
  slimVideo,
} from "./_db.js";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const MAX_VIDEOS = 8000; // keeps one response under Vercel's 4.5 MB limit
const MAX_NAME = 60;
const CHANNEL_ID = /^UC[\w-]{20,}$/;
const PAGE_TOKEN = /^[\w-]{1,200}$/;

const text = (value) => (typeof value === "string" ? value.trim() : "");
const cleanName = (value) => {
  const name = text(value);
  return name && name.length <= MAX_NAME ? name : null;
};

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** YouTube returns titles with HTML entities (&#39;, &amp;); turn them back into characters. */
function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const num = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** True when the title contains every word of `wanted` (ignoring case). */
export function titleMatches(title, wanted) {
  const haystack = decodeEntities(title).toLowerCase();
  return wanted
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

const fail = (status, error) => ({ status, body: { error } });

export async function handleList(catalog, owner, query) {
  const name = cleanName(query?.name);
  if (!name) {
    const rows = await catalog
      .aggregate([
        { $match: { owner } },
        {
          $group: {
            _id: "$catalog",
            count: { $sum: 1 },
            ids: { $push: "$video.id.videoId" },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    return { status: 200, body: { catalogs: rows.map((r) => ({ name: r._id, count: r.count, ids: r.ids ?? [] })) } };
  }
  const docs = await catalog
    .find({ owner, catalog: name })
    .sort({ order: 1 })
    .limit(MAX_VIDEOS)
    .toArray();
  return { status: 200, body: { videos: docs.map((d) => d.video) } };
}

export async function handleDelete(catalog, owner, query) {
  const name = cleanName(query?.name);
  if (!name) return fail(400, "Missing list name");
  const result = await catalog.deleteMany({ owner, catalog: name });
  return { status: 200, body: { deleted: result.deletedCount } };
}

/** Calls the YouTube search API. `fetchFn` is injectable for tests. */
async function youtubeSearch(fetchFn, params) {
  const res = await fetchFn(`${SEARCH_URL}?${new URLSearchParams(params)}`);
  if (res.status === 403) return { quota: true };
  if (!res.ok) return { failed: true };
  return { data: await res.json() };
}

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
      if (found.failed) return fail(502, "YouTube channel lookup failed");
      const item = found.data.items?.[0];
      if (!item) return fail(404, `No channel found for "${channel}"`);
      channelId = item.id.channelId;
      channelTitle = item.snippet.title;
    }
  }

  const params = { part: "snippet", type: "video", maxResults: "50", key: apiKey };
  if (title) params.q = title; // helps YouTube find them; the title check below is the real filter
  if (channelId) params.channelId = channelId;
  if (body?.any !== true) params.videoEmbeddable = "true";
  if (pageToken) params.pageToken = pageToken;

  const result = await youtubeSearch(fetchFn, params);
  if (result.quota) return fail(429, "quota");
  if (result.failed) return fail(502, "YouTube search failed");

  const items = result.data.items ?? [];
  const operations = [];
  items.forEach((item) => {
    const video = slimVideo(item);
    if (!video) return;
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
  const code = readSyncCode(req);
  if (!code) return res.status(401).json({ error: "Turn on sync first (missing sync code)" });
  const owner = roomIdFor(code);

  try {
    const catalog = await getCatalog();
    if (!indexReady) {
      await catalog.createIndex({ owner: 1, catalog: 1, order: 1 });
      indexReady = true;
    }

    let result;
    if (req.method === "GET") result = await handleList(catalog, owner, req.query);
    else if (req.method === "DELETE") result = await handleDelete(catalog, owner, req.query);
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
