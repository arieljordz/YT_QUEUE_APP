// Room selection and room sessions. The session itself lives in an HttpOnly
// cookie set by the server; JavaScript never sees the token or the PIN after it
// is sent.
async function post(body) {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
export const leaveRoomSession = () => post({ action: "leave" }).catch(() => {});

// Room management. `pin` is the room's current PIN (checked on the server with
// the same wrong-attempt limits); `newPin` sets or changes it.
export const createRoom = (fields) => post({ action: "create", ...fields });
export const updateRoom = (roomId, fields) => post({ action: "update", roomId, ...fields });
export const deleteRoom = (roomId, pin) => post({ action: "delete", roomId, pin });
