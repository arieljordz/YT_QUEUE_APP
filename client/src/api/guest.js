// Client for /api/guest: invite links that let guests look at the queue and add songs.
async function post(headers, body) {
  const response = await fetch("/api/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  // Local dev (plain vite) has no /api route and answers with HTML or 404 HTML.
  if (!isJson) throw new Error("Invites only work on the deployed site.");
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? "Something went wrong.");
    error.status = response.status;
    throw error;
  }
  return data;
}

// --- owner (needs the sync code) ---
export const getInvite = (syncCode) =>
  post({ "x-sync-code": syncCode }, { action: "status" }).then((d) => d.token);
export const createInvite = (syncCode) =>
  post({ "x-sync-code": syncCode }, { action: "create" }).then((d) => d.token);
export const revokeInvite = (syncCode) =>
  post({ "x-sync-code": syncCode }, { action: "revoke" });

// --- guest (needs the invite token) ---
export const getGuestState = (token) =>
  post({ "x-guest-code": token }, { action: "state" });
export const addGuestSong = (token, video) =>
  post({ "x-guest-code": token }, { action: "add", video });

/** The link a guest opens (the token is the only secret in it). */
export const inviteLink = (token) => `${window.location.origin}/?join=${token}`;
