// One-time, non-destructive migration of an old sync-code room into a new room.
// Copies the room data and the imported lists; the old documents are kept.
// The only change to the old room document is renaming its guest invite token
// (guestCode -> guestCodeLegacy) so the invite link resolves to the new room.
const COPY_FIELDS = [
  "queue", "isPaused", "isRepeat", "played", "rev", "updatedAt", "library", "libraryEpoch",
  "removals", "removalSeq", "flags", "flagsAuth", "favorites", "history", "guestCode",
];

export async function migrateRoom({ rooms, catalog }, oldId, newId) {
  const old = await rooms.findOne({ _id: oldId });
  if (!old) return { ok: false, reason: "Old room not found (wrong sync code?)" };
  const target = await rooms.findOne({ _id: newId, slot: { $exists: true } });
  if (!target) return { ok: false, reason: "New room not found" };

  const set = {};
  for (const field of COPY_FIELDS) if (old[field] !== undefined) set[field] = old[field];
  set.migratedFrom = oldId;
  await rooms.updateOne({ _id: newId }, { $set: set });
  if (old.guestCode !== undefined) {
    await rooms.updateOne({ _id: oldId }, { $set: { guestCodeLegacy: old.guestCode }, $unset: { guestCode: "" } });
  }

  const docs = await catalog.find({ owner: oldId }).toArray();
  const prefix = `${oldId}:`;
  const ops = docs.map((doc) => ({
    updateOne: {
      filter: { _id: `${newId}:${String(doc._id).startsWith(prefix) ? String(doc._id).slice(prefix.length) : doc._id}` },
      update: { $set: { ...Object.fromEntries(Object.entries(doc).filter(([k]) => k !== "_id")), owner: newId } },
      upsert: true,
    },
  }));
  if (ops.length > 0) await catalog.bulkWrite(ops);
  return { ok: true, copiedCatalogDocs: ops.length };
}
