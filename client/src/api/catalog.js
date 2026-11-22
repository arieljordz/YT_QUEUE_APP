// Client for /api/catalog: video lists collected from YouTube and kept in the
// database under the user's sync code.
export class CatalogError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // "unavailable" | "quota" | "error"
  }
}

async function request(syncCode, { method = "GET", query, body } = {}) {
  const url = query ? `/api/catalog?${new URLSearchParams(query)}` : "/api/catalog";
  const headers = { "x-sync-code": syncCode };
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  // Local dev (plain vite) has no /api route and answers with HTML or 404.
  if (!isJson || response.status === 404) {
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

export const listCatalogs = (syncCode) => request(syncCode).then((d) => d.catalogs);

export const getCatalogVideos = (syncCode, name) =>
  request(syncCode, { query: { name } }).then((d) => d.videos);

export const deleteCatalog = (syncCode, name) =>
  request(syncCode, { method: "DELETE", query: { name } });

/** Collects one page (50) of YouTube results into the list `body.name`. */
export const collectPage = (syncCode, body) => request(syncCode, { method: "POST", body });

// Must match SEARCHES_LIST on the server.
export const SEARCHES_LIST = "My Searches";
export const isSearchesList = (name) =>
  name.trim().toLowerCase() === SEARCHES_LIST.toLowerCase();

/** Saves a video the user searched for and queued into the "My Searches" list. */
export const saveSearchedVideo = (syncCode, video) =>
  request(syncCode, { method: "POST", body: { save: video } });
