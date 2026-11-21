const API_KEY = import.meta.env.VITE_YT_API_KEY;
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

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
