// Vercel serverless function: stores one JSON file per sync code in a PRIVATE
// Vercel Blob store. No database. Requires the BLOB_READ_WRITE_TOKEN env var,
// which Vercel adds automatically when a Blob store is connected to the project.
import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";

const MAX_BODY_BYTES = 4 * 1024 * 1024; // Vercel functions cap request bodies at ~4.5 MB.
const MAX_ITEMS = 20000;
const MIN_CODE_LENGTH = 8;

// Keep only what the UI needs so the stored file stays small.
function slim(video) {
  const id = video?.id?.videoId;
  const snippet = video?.snippet;
  if (typeof id !== "string" || !id || typeof snippet?.title !== "string") return null;
  const thumbs = snippet.thumbnails ?? {};
  const pick = (t) => (typeof t?.url === "string" ? { url: t.url } : undefined);
  const thumbnails = { default: pick(thumbs.default), medium: pick(thumbs.medium) };
  if (!thumbnails.default && !thumbnails.medium) return null;
  return {
    id: { videoId: id },
    snippet: {
      title: snippet.title,
      channelTitle: typeof snippet.channelTitle === "string" ? snippet.channelTitle : "",
      thumbnails,
    },
  };
}

function merge(stored, incoming) {
  const byId = new Map();
  for (const video of [...stored, ...incoming]) {
    const item = slim(video);
    if (item && !byId.has(item.id.videoId)) byId.set(item.id.videoId, item);
  }
  return [...byId.values()].slice(0, MAX_ITEMS);
}

async function readStored(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return [];
  const data = JSON.parse(await new Response(result.stream).text());
  return Array.isArray(data) ? data : [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const code = req.headers["x-sync-code"];
  if (typeof code !== "string" || code.length < MIN_CODE_LENGTH) {
    return res.status(401).json({ error: "Missing or too short sync code" });
  }

  const incoming = req.body?.library;
  if (!Array.isArray(incoming) || incoming.length > MAX_ITEMS) {
    return res.status(400).json({ error: "Body must be { library: [...] }" });
  }
  if (Number(req.headers["content-length"] ?? 0) > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Library too large" });
  }

  // Only a hash of the code is used, so the code itself is never stored.
  const pathname = `library/${createHash("sha256").update(code).digest("hex")}.json`;

  try {
    const merged = merge(await readStored(pathname), incoming);
    await put(pathname, JSON.stringify(merged), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.status(200).json({ library: merged });
  } catch (error) {
    console.error("library sync failed", error);
    return res.status(500).json({ error: "Could not sync the library" });
  }
}
