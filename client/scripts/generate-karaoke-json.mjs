/* global process */
// Builds a JSON file of karaoke videos that the app's "Import" button accepts
// (same shape as the YouTube search results saved in /references).
//
//   node scripts/generate-karaoke-json.mjs [options]
//
//   --query "text"   search text; repeat for several (default: a built-in list)
//   --max 500        max videos per query (YouTube stops paging at about 500)
//   --out file.json  output file (default: ../references/karaoke.json)
//   --any            also include videos that cannot be embedded (default: only
//                    videos that can play in the player tab)
//
// Quota: every page of 50 results costs 100 of the 10,000 daily units, so one
// query at --max 500 costs 1,000 units. The script stops cleanly if the quota
// runs out and still saves what it has collected.
//
// The API key is read from VITE_YT_API_KEY (environment or client/.env).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  const args = { queries: [], max: 500, out: resolve(here, "../../references/karaoke.json"), any: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--query") args.queries.push(argv[++i]);
    else if (arg === "--max") args.max = Number(argv[++i]);
    else if (arg === "--out") args.out = resolve(argv[++i]);
    else if (arg === "--any") args.any = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(args.max) || args.max < 1) throw new Error("--max must be a positive number");
  if (args.queries.length === 0) args.queries = DEFAULT_QUERIES;
  return args;
}

function readApiKey() {
  if (process.env.VITE_YT_API_KEY) return process.env.VITE_YT_API_KEY;
  const envFile = resolve(here, "../.env");
  if (existsSync(envFile)) {
    const match = readFileSync(envFile, "utf8").match(/^\s*VITE_YT_API_KEY\s*=\s*(.+?)\s*$/m);
    if (match) return match[1].replace(/^["']|["']$/g, "");
  }
  throw new Error("VITE_YT_API_KEY not found (set it in client/.env).");
}

async function main() {
  const { queries, max, out, any } = parseArgs(process.argv.slice(2));
  const key = readApiKey();
  const found = new Map();
  let quotaHit = false;

  for (const query of queries) {
    let pageToken;
    let count = 0;
    while (count < max && !quotaHit) {
      const params = new URLSearchParams({
        part: "snippet",
        q: query,
        type: "video",
        maxResults: "50",
        key,
      });
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
      console.log(`"${query}": ${count} fetched, ${found.size} unique so far`);
      if (!pageToken) break;
    }
    if (quotaHit) break;
  }

  if (found.size === 0) throw new Error("Nothing collected; no file written.");
  writeFileSync(out, JSON.stringify([...found.values()], null, 2));
  console.log(`Saved ${found.size} videos to ${out}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
