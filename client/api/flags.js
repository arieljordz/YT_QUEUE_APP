// Vercel serverless function: the app's feature flags. They are app-wide (the
// same in every room) and stored in app_settings ({ _id: "flags" }). The other
// endpoints enforce them too (library, catalog), so hiding a button is not the
// only protection.
//
// Anyone can read them; changing one needs the admin sign-in (see admin.js).
//
//   POST {}                -> { flags }
//   POST { flags: {...} }  -> { flags }   (401 { adminRequired } when not signed in as admin)
import { getDb, getRooms } from "./_db.js";
import { requireAdmin } from "./_admin.js";

export const DEFAULT_FLAGS = {
  lightMode: true,
  darkMode: true,
  removeButton: false,
  deleteAllButton: false,
  deleteListButton: false,
};
const FLAGS_ID = "flags";

/** Stored values over the defaults; unknown keys are dropped. */
const withDefaults = (values) =>
  Object.fromEntries(
    Object.entries(DEFAULT_FLAGS).map(([name, def]) => [
      name,
      typeof values?.[name] === "boolean" ? values[name] : def,
    ])
  );

/**
 * The app-wide flags. The first read seeds them from the flags rooms used to
 * have (lowest room first), so switching to app-wide flags changes nothing.
 */
export async function readAppFlags(settings, rooms) {
  const doc = await settings.findOne({ _id: FLAGS_ID });
  if (doc) return withDefaults(doc.values);
  const legacy = await rooms
    .find({ slot: { $exists: true }, flags: { $exists: true } }, { projection: { flags: 1, slot: 1 } })
    .toArray();
  legacy.sort((a, b) => a.slot - b.slot);
  const values = withDefaults(legacy[0]?.flags);
  await settings.updateOne(
    { _id: FLAGS_ID },
    { $setOnInsert: { values, updatedAt: new Date() } },
    { upsert: true }
  );
  return withDefaults((await settings.findOne({ _id: FLAGS_ID }))?.values ?? values);
}

/** The flags for the other endpoints. */
export async function getAppFlags() {
  return readAppFlags((await getDb()).collection("app_settings"), await getRooms());
}

/** Core logic, separated from the HTTP layer so it can be tested with any collection. */
export async function handleFlags({ settings, rooms }, body, isAdmin) {
  const flags = await readAppFlags(settings, rooms);
  if (body?.flags === undefined) return { status: 200, body: { flags } };

  if (!isAdmin) {
    return { status: 401, body: { error: "Sign in as admin to change feature flags.", adminRequired: true } };
  }
  const changes = body.flags;
  const names = changes && typeof changes === "object" ? Object.keys(changes) : [];
  if (
    names.length === 0 ||
    names.some((name) => !(name in DEFAULT_FLAGS) || typeof changes[name] !== "boolean")
  ) {
    return { status: 400, body: { error: "Invalid flags" } };
  }
  const values = { ...flags, ...changes };
  if (!values.lightMode && !values.darkMode) {
    return { status: 400, body: { error: "Keep at least one theme (light or dark) turned on." } };
  }
  await settings.updateOne({ _id: FLAGS_ID }, { $set: { values, updatedAt: new Date() } }, { upsert: true });
  return { status: 200, body: { flags: values } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
  try {
    const isAdmin = req.body?.flags !== undefined && (await requireAdmin(req));
    const cols = { settings: (await getDb()).collection("app_settings"), rooms: await getRooms() };
    const result = await handleFlags(cols, req.body, isAdmin);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("flags request failed", error);
    return res.status(500).json({ error: "Could not reach the database" });
  }
}
