// One active player per room. The player tab holds a short lease on its room
// ({ player: { id, seenAt, hidden } } on the room doc) and renews it while it is open.
// Another device can only start playing when the lease is free, stale (the tab
// closed without saying so), or when it explicitly takes over.
export const PLAYER_STALE_MS = 90 * 1000;
// Phones, tablets and installed apps stop running a page's timers as soon as it
// goes to the background or the screen locks, so a backgrounded player can't
// renew its lease. It says so before going quiet ({ hidden: true }) and keeps
// the lease this long, so another device still asks before taking over.
export const HIDDEN_PLAYER_STALE_MS = 12 * 60 * 60 * 1000;
const PLAYER_ID = /^[\w-]{8,64}$/;

export const isPlayerId = (id) => typeof id === "string" && PLAYER_ID.test(id);

/**
 * Claims or renews the room's player lease for this tab.
 * -> { active: true } or { active: false } when another player holds it.
 */
export async function claimPlayer(rooms, roomId, { playerId, takeover = false, hidden = false }, now = Date.now()) {
  const room = await rooms.findOne({ _id: roomId }, { projection: { player: 1 } });
  if (!room) return { status: 404, body: { error: "Room not found", missing: true } };
  const held = room.player;
  const staleAfter = held?.hidden ? HIDDEN_PLAYER_STALE_MS : PLAYER_STALE_MS;
  const free = !held?.id || held.id === playerId || now - new Date(held.seenAt).getTime() > staleAfter;
  if (!free && !takeover) return { status: 200, body: { active: false } };
  // Only replace the lease we looked at, so two devices claiming at once can't both win.
  const result = await rooms.updateOne(
    { _id: roomId, "player.id": held?.id ?? null },
    { $set: { player: { id: playerId, seenAt: new Date(now), hidden } } }
  );
  if (result.matchedCount === 0) return { status: 200, body: { active: false } };
  return { status: 200, body: { active: true } };
}

/** Gives up the lease, but only if this tab still holds it. */
export async function releasePlayer(rooms, roomId, playerId) {
  await rooms.updateOne({ _id: roomId, "player.id": playerId }, { $unset: { player: "" } });
  return { status: 200, body: { active: false } };
}
