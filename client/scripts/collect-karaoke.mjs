/* global process */
// Collects karaoke videos from YouTube and saves them in your MongoDB database
// (collection "catalog_videos"), where the app's "Import from database" button
// reads them.
//
//   node scripts/collect-karaoke.mjs [options]
//
//   --channel "name" only videos from this YouTube channel (e.g. "Atomic Karaoke");
//                    a channel id (starts with UC) is used as is. Without
//                    --query it lists the channel's videos.
//   --query "text"   search text; repeat for several (default: a built-in list)
//   --max 500        max videos per query (YouTube stops paging at about 500)
//   --catalog name   name of the list in the database (default: the channel name,
//                    or "karaoke")
//   --from-file f    upload an existing JSON file (such as references/karaoke.json)
//                    instead of searching YouTube; costs no YouTube quota
//   --any            also include videos that cannot be embedded (default: only
//                    videos that can play in the player tab)
//
// Quota: every page of 50 results costs 100 of the 10,000 daily units, so one
// query at --max 500 costs 1,000 units. The script stops cleanly if the quota
// runs out and still saves what it has collected.
//
// Secrets (never commit them): the YouTube key is read from VITE_YT_API_KEY
// (environment or client/.env) and the database address from MONGODB_URI
// (environment or client/.env.local, which git ignores).
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getCatalog, slimVideo } from "../api/_db.js";

const here = dirname(fileURLToPath(import.meta.url));
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

const DEFAULT_QUERIES = [
  "karaoke with lyrics",
  "karaoke version instrumental",
  "OPM karaoke",
  "pop karaoke hits",
  "rock karaoke songs",
];

function parseArgs(argv) {
  const args = { queries: [], channel: null, max: 500, catalog: null, fromFile: null, any: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--query") args.queries.push(argv[++i]);
    else if (arg === "--channel") args.channel = argv[++i];
    else if (arg === "--max") args.max = Number(argv[++i]);
    else if (arg === "--catalog") args.catalog = argv[++i];
    else if (arg === "--from-file") args.fromFile = resolve(argv[++i]);
    else if (arg === "--any") args.any = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(args.max) || args.max < 1) throw new Error("--max must be a positive number");
  if (args.queries.length === 0) args.queries = args.channel ? [""] : DEFAULT_QUERIES;
  args.catalog ??= args.channel
    ? args.channel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "karaoke";
  return args;
}

/** Reads NAME from the environment or from a simple KEY=value file. */
function readSecret(name, fileName) {
  if (process.env[name]) return process.env[name];
  const file = resolve(here, "..", fileName);
  if (existsSync(file)) {
    const match = readFileSync(file, "utf8").match(new RegExp(String.raw`^\s*${name}\s*=\s*(.+?)\s*$`, "m"));
    if (match) return match[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

function readApiKey() {
  const key = readSecret("VITE_YT_API_KEY", ".env");
  if (!key) throw new Error("VITE_YT_API_KEY not found (set it in client/.env).");
  return key;
}

/** Turns a channel name into its id (costs 100 quota units). */
async function resolveChannel(name, key) {
  if (/^UC[\w-]{20,}$/.test(name)) return name;
  const params = new URLSearchParams({ part: "snippet", q: name, type: "channel", maxResults: "1", key });
  const res = await fetch(`${SEARCH_URL}?${params}`);
  if (!res.ok) throw new Error(`Channel lookup failed (${res.status})`);
  const channel = (await res.json()).items?.[0];
  if (!channel) throw new Error(`No channel found for "${name}"`);
  console.log(`Using channel "${channel.snippet.title}" (${channel.id.channelId})`);
  return channel.id.channelId;
}

/** Searches YouTube and returns the collected search results. */
async function collectFromYouTube({ queries, channel, max, any }) {
  const key = readApiKey();
  const channelId = channel ? await resolveChannel(channel, key) : null;
  const found = new Map();
  let quotaHit = false;

  for (const query of queries) {
    let pageToken;
    let count = 0;
    while (count < max && !quotaHit) {
      const params = new URLSearchParams({
        part: "snippet",
        type: "video",
        maxResults: "50",
        key,
      });
      if (query) params.set("q", query);
      if (channelId) params.set("channelId", channelId);
      if (!any) params.set("videoEmbeddable", "true");
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`${SEARCH_URL}?${params}`);
      if (res.status === 403) {
        console.warn("Quota reached (or key rejected); saving what was collected.");
        quotaHit = true;
        break;
      }
      if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);

      const data = await res.json();
      for (const item of data.items ?? []) {
        if (item.id?.videoId) found.set(item.id.videoId, item);
      }
      count += data.items?.length ?? 0;
      pageToken = data.nextPageToken;
      console.log(`"${query || channel}": ${count} fetched, ${found.size} unique so far`);
      if (!pageToken) break;
    }
    if (quotaHit) break;
  }
  return [...found.values()];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const uri = readSecret("MONGODB_URI", ".env.local");
  if (!uri) {
    throw new Error("MONGODB_URI not found (set it in your terminal or in client/.env.local).");
  }
  process.env.MONGODB_URI = uri;

  const items = options.fromFile
    ? JSON.parse(readFileSync(options.fromFile, "utf8"))
    : await collectFromYouTube(options);

  // Same slim shape the app uses, de-duplicated, in the order they were found.
  const videos = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const video = slimVideo(item);
    if (video && !seen.has(video.id.videoId)) {
      seen.add(video.id.videoId);
      videos.push(video);
    }
  }
  if (videos.length === 0) throw new Error("Nothing usable collected; the database was not changed.");

  const catalog = await getCatalog();
  await catalog.createIndex({ catalog: 1, order: 1 });
  const name = options.catalog;
  await catalog.bulkWrite(
    videos.map((video, order) => ({
      updateOne: {
        filter: { _id: `${name}:${video.id.videoId}` },
        update: { $set: { catalog: name, video, order } },
        upsert: true,
      },
    }))
  );
  console.log(`Saved ${videos.length} videos to the database as "${name}".`);
}

main()
  .then(() => process.exit(0)) // closes the database connection
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
