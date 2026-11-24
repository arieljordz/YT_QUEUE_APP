// Vercel serverless function: room selection and room sessions.
//   GET                                -> { rooms: [{ id, name, avatar }] }   (public, no secrets)
//   POST { action: "enter", roomId, pin } -> sets the HttpOnly session cookie
//   POST { action: "me" }              -> { room } for the current session, or 401
//   POST { action: "leave" }           -> ends the session and clears the cookie
import {
  clientIp,
  enterRoom,
  getSessionCollections,
  leaveSession,
  listRooms,
  readCookie,
  resolveSession,
  sessionCookie,
} from "./_session.js";

export default async function handler(req, res) {
  try {
    const cols = await getSessionCollections();
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ rooms: await listRooms(cols.rooms) });
    }
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    res.setHeader("Cache-Control", "no-store");
    const action = req.body?.action;

    if (action === "enter") {
      const result = await enterRoom(cols, {
        roomId: req.body.roomId,
        pin: req.body.pin,
        ip: clientIp(req),
      });
      if (result.token) res.setHeader("Set-Cookie", sessionCookie(result.token));
      return res.status(result.status).json(result.body);
    }

    const token = readCookie(req);
    if (action === "me") {
      const roomId = await resolveSession(cols, token);
      if (!roomId) return res.status(401).json({ error: "No session" });
      const room = await cols.rooms.findOne({ _id: roomId });
      return res.status(200).json({ room: { id: room._id, name: room.name, avatar: room.avatar } });
    }
    if (action === "leave") {
      await leaveSession(cols, token);
      res.setHeader("Set-Cookie", sessionCookie("", 0));
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (error) {
    console.error("rooms request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
