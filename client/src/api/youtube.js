import { decodeEntities } from "../lib/text";

const API_KEY = import.meta.env.VITE_YT_API_KEY;
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";

export class QuotaError extends Error {}

/** Search YouTube videos. Resolves to the list of result items. */
export async function searchVideos(query, signal) {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "10",
    key: API_KEY,
  });

  const res = await fetch(`${SEARCH_URL}?${params}`, { signal });
  if (res.status === 403) throw new QuotaError("Search quota limit reached");
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);

  const data = await res.json();
  // Show titles as plain text: YouTube sends them with HTML entities (&#39; &amp;).
  return (data.items ?? []).map((item) => ({
    ...item,
    snippet: {
      ...item.snippet,
      title: decodeEntities(item.snippet?.title ?? ""),
      channelTitle: decodeEntities(item.snippet?.channelTitle ?? ""),
    },
  }));
}

/** "PT1H2M5S" -> 3725. Returns null for live streams and anything unreadable. */
function parseIsoDuration(value) {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? "");
  if (!match) return null;
  const [, d = 0, h = 0, m = 0, sec = 0] = match;
  const total = Number(d) * 86400 + Number(h) * 3600 + Number(m) * 60 + Number(sec);
  return total > 0 ? total : null;
}

/**
 * Looks up up to 50 videos at once and returns a Map: id -> { embeddable,
 * seconds, views }. Costs 1 quota unit. Resolves to an empty Map if the lookup
 * fails, because this only adds hints to the search results.
 */
export async function getVideoDetails(ids, signal) {
  const details = new Map();
  if (ids.length === 0) return details;
  try {
    const params = new URLSearchParams({
      part: "status,contentDetails,statistics",
      id: ids.slice(0, 50).join(","),
      key: API_KEY,
    });
    const res = await fetch(`${VIDEOS_URL}?${params}`, { signal });
    if (!res.ok) return details;
    const data = await res.json();
    for (const item of data.items ?? []) {
      const views = item.statistics?.viewCount;
      details.set(item.id, {
        embeddable: item.status?.embeddable !== false,
        seconds: parseIsoDuration(item.contentDetails?.duration),
        views: views === undefined ? null : Number(views),
      });
    }
  } catch {
    // Keep what was read so far (nothing).
  }
  return details;
}
