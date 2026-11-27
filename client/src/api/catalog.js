// Client for /api/catalog: video lists collected from YouTube and kept in the
// database under the user's sync code.
export class CatalogError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // "unavailable" | "quota" | "error"
  }
}

async function request({ method = "GET", query, body } = {}) {
  const url = query ? `/api/catalog?${new URLSearchParams(query)}` : "/api/catalog";
  const headers = body ? { "Content-Type": "application/json" } : {};

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (!isJson && response.status >= 500) {
    // Vercel's own error page, for example when the function ran out of time.
    throw new CatalogError(
      `The server did not answer in time (error ${response.status}). Try again.`,
      "error"
    );
  }
  // Local dev (plain vite) has no /api route and answers with HTML. A JSON 404
  // is the server's own answer ("No channel found…") and is shown as it is.
  if (!isJson) {
    throw new CatalogError("This only works on the deployed site.", "unavailable");
  }

  const data = await response.json();
  if (!response.ok) {
    if (data.error === "quota") {
      throw new CatalogError("YouTube's daily search quota is used up. Try again tomorrow.", "quota");
    }
    throw new CatalogError(data.error ?? "Something went wrong.", "error");
  }
  return data;
}

/** The saved lists: [{ name, count, mine }]. */
export const listCatalogs = () => request().then((d) => d.catalogs);

/** The distinct video ids of one saved list. */
export const getCatalogIds = (name) =>
  request({ query: { name, ids: 1 } }).then((d) => d.ids);

/** Every video of a saved list, fetched a page at a time. */
export async function getCatalogVideos(name) {
  const videos = [];
  let after = 0;
  do {
    const page = await request({ query: { name, after } });
    videos.push(...page.videos);
    after = page.next ?? null;
  } while (after !== null);
  return videos;
}

export const deleteCatalog = (name) =>
  request({ method: "DELETE", query: { name } });

/**
 * Collects one page (50) of YouTube results into the list `body.name`. With
 * `readOnly: true` nothing is saved and the matching `videos` come back.
 */
export const collectPage = (body) => request({ method: "POST", body });

/** Saves videos read with readOnly pages into a list, in order from `offset`. */
export const saveListVideos = (name, videos, offset) =>
  request({ method: "POST", body: { name, videos, offset } });

// Videos per saveListVideos call (SAVE_BATCH on the server).
export const SAVE_BATCH = 500;

// Must match SEARCHES_LIST on the server.
export const SEARCHES_LIST = "My Searches";
export const isSearchesList = (name) =>
  name.trim().toLowerCase() === SEARCHES_LIST.toLowerCase();

/** Saves a video the user searched for and queued into the "My Searches" list. */
export const saveSearchedVideo = (video) =>
  request({ method: "POST", body: { save: video } });

/**
 * Shares (shared: true) or stops sharing this room's part of a saved list with
 * the other rooms. Matters while the "shareSavedLists" flag is off.
 */
export const shareCatalog = (name, shared) =>
  request({ method: "POST", body: { share: { name, shared } } });
