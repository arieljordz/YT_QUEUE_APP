// Room selection and room sessions. The session itself lives in an HttpOnly
// cookie set by the server; JavaScript never sees the token or the PIN after it
// is sent.
async function post(body, { keepalive = false } = {}) {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

export async function listRooms() {
  const response = await fetch("/api/rooms");
  if (!response.ok) throw new Error("Could not load rooms");
  return (await response.json()).rooms;
}

export const enterRoom = (roomId, pin) => post({ action: "enter", roomId, pin });
export const currentRoom = () => post({ action: "me" });
// The room's player lease: only one device plays a room at a time. `hidden`
// says the player is in the background, where its renewals may stop until it is
// back; that one is sent with keepalive so it still goes out as the page is suspended.
export const claimPlayer = (playerId, { takeover = false, hidden = false } = {}) =>
  post({ action: "player", playerId, takeover, hidden }, { keepalive: hidden });
// Sent while the tab is closing, so it uses keepalive and ignores the answer.
export const releasePlayer = (playerId) =>
  fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "player", playerId, release: true }),
    keepalive: true,
  }).catch(() => {});
export const leaveRoomSession = () => post({ action: "leave" }).catch(() => {});

// Room management (admin only: the server checks the admin sign-in cookie).
// `newPin` sets or changes a room's PIN.
export const createRoom = (fields) => post({ action: "create", ...fields });
export const updateRoom = (roomId, fields) => post({ action: "update", roomId, ...fields });
export const deleteRoom = (roomId) => post({ action: "delete", roomId });
