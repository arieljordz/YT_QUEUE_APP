/* global process */
// Vercel serverless function: video lists ("catalogs") that the user collects
// from YouTube (a channel, an artist, a search) and keeps in MongoDB, so they
// can be added to the library later without searching again.
//
// Every request needs the sync code header; lists belong to that code only.
//
//   GET    /api/catalog               -> { catalogs: [{ name, count }] }
//   GET    /api/catalog?name=X        -> { videos: [...] }
//   DELETE /api/catalog?name=X        -> { deleted }
//   POST   /api/catalog               -> collects ONE page (50) of YouTube
//          { name, channel?, channelId?, query?, pageToken?, offset?, any? }
//          -> { fetched, added, nextPageToken?, channelId?, channelTitle? }
//     The browser calls POST repeatedly until it has enough videos, so no
//     single request runs long.
import { getCatalog, readSyncCode, roomIdFor, slimVideo } from "./_db.js";

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
const fail = (status, error) => ({ status, body: { error } });

export async function handleList(catalog, owner, query) {
  const name = cleanName(query?.name);
  if (!name) {
    const rows = await catalog
      .aggregate([
        { $match: { owner } },
        { $group: { _id: "$catalog", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    return { status: 200, body: { catalogs: rows.map((r) => ({ name: r._id, count: r.count })) } };
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

export async function handleCollect(catalog, owner, body, { apiKey, fetchFn = fetch }) {
  const name = cleanName(body?.name);
  if (!name) return fail(400, `Give the list a name (up to ${MAX_NAME} characters)`);

  const query = text(body?.query);
  const channel = text(body?.channel);
  let channelId = CHANNEL_ID.test(text(body?.channelId)) ? text(body.channelId) : "";
  if (!query && !channel && !channelId) return fail(400, "Enter a channel or some search text");

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
  if (query) params.q = query;
  if (channelId) params.channelId = channelId;
  if (body?.any !== true) params.videoEmbeddable = "true";
  if (pageToken) params.pageToken = pageToken;

  const result = await youtubeSearch(fetchFn, params);
  if (result.quota) return fail(429, "quota");
  if (result.failed) return fail(502, "YouTube search failed");

  const items = result.data.items ?? [];
  const operations = [];
  items.forEach((item, i) => {
    const video = slimVideo(item);
    if (!video) return;
    operations.push({
      updateOne: {
        filter: { _id: `${owner}:${name}:${video.id.videoId}` },
        update: { $set: { owner, catalog: name, video, order: offset + i } },
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
      result = await handleCollect(catalog, owner, req.body, { apiKey });
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
