// Client for /api/playlists: the room's personal playlists, shared by every
// device in the room.
export class PlaylistError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // "unavailable" | "error"
  }
}

export async function postPlaylists(body) {
  const response = await fetch("/api/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  // Local dev (plain vite) has no /api route and answers with HTML or 404.
  if (!isJson) {
    throw new PlaylistError("Playlists are only saved on the deployed site.", "unavailable");
  }
  const data = await response.json();
  if (!response.ok) throw new PlaylistError(data.error ?? "Could not save the playlist.", "error");
  return data;
}
