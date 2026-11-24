// Vercel serverless function: room selection and room sessions.
//   GET                                -> { rooms: [{ id, name, avatar, description, hasPin, online }] }   (public, no secrets)
//   POST { action: "enter", roomId, pin } -> sets the HttpOnly session cookie
//   POST { action: "me" }              -> { room } for the current session, or 401
//   POST { action: "leave" }           -> ends the session and clears the cookie
//   POST { action: "create", name, avatar, description?, newPin }       -> creates a room
//   POST { action: "update", roomId, name?, avatar?, description?, newPin? }
//   POST { action: "delete", roomId }
// Create/update/delete need the admin cookie (see admin.js).
import { getCatalog } from "./_db.js";
import { requireAdmin } from "./_admin.js";
import { createRoom, deleteRoom, updateRoom } from "./_manage.js";
import {
  publicRoom,
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
      // Old presence entries clean themselves up.
      await cols.presence.createIndex({ lastSeen: 1 }, { expireAfterSeconds: 600 });
      return res.status(200).json({ rooms: await listRooms(cols.rooms, cols.presence) });
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

    const manage = { create: createRoom, update: updateRoom, delete: deleteRoom }[action];
    if (manage) {
      if (!(await requireAdmin(req))) {
        return res.status(401).json({ error: "Sign in as admin to manage rooms.", adminRequired: true });
      }
      // One room per slot, enforced by the database when two creates race.
      await cols.rooms.createIndex(
        { slot: 1 },
        { unique: true, partialFilterExpression: { slot: { $exists: true } } }
      );
      const b = req.body;
      const input = {
        roomId: b.roomId,
        name: b.name,
        avatar: b.avatar,
        description: b.description,
        newPin: b.newPin,
      };
      const result =
        action === "delete" ? await deleteRoom(cols, input, await getCatalog()) : await manage(cols, input);
      return res.status(result.status).json(result.body);
    }

    const token = readCookie(req);
    if (action === "me") {
      const roomId = await resolveSession(cols, token);
      if (!roomId) return res.status(401).json({ error: "No session" });
      const room = await cols.rooms.findOne({ _id: roomId });
      return res.status(200).json({ room: publicRoom(room) });
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
