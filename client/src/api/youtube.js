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
  return data.items ?? [];
}

/**
 * Returns the ids (out of `ids`, max 50) whose owner disabled embedding, so they
 * can only be watched on youtube.com. Costs 1 quota unit; resolves to an empty
 * list if the lookup fails, because this is only a hint for the UI.
 */
export async function findNonEmbeddable(ids, signal) {
  if (ids.length === 0) return [];
  try {
    const params = new URLSearchParams({
      part: "status",
      id: ids.slice(0, 50).join(","),
      key: API_KEY,
    });
    const res = await fetch(`${VIDEOS_URL}?${params}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? [])
      .filter((item) => item.status?.embeddable === false)
      .map((item) => item.id);
  } catch {
    return [];
  }
}
