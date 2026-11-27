// The admin password: one for the whole app, needed to manage rooms and to
// change feature flags. Stored only as a scrypt hash in app_settings
// ({ _id: "admin" }); it never expires and only changes when the admin changes
// it. Signing in gives a separate HttpOnly admin cookie backed by a hashed
// token in admin_sessions. The screens sign out when closed (Settings, Manage
// Rooms); the 1-hour limit only covers a tab that was closed without that.
//
// First setup: if any room still has the old feature-flags password, the new
// admin password must be that password, so nobody else can claim admin first.
import { randomBytes } from "node:crypto";
import { getDb, getRooms } from "./_db.js";
import { hashPin, pinMatches, readCookie, sessionCookie, sha256, verifySecret } from "./_session.js";

export const ADMIN_COOKIE = "yq_admin";
export const ADMIN_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD = 6;
const MAX_PASSWORD = 100;
const ADMIN_KEY = "admin";

const validPassword = (p) => typeof p === "string" && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;
const bad = (error) => ({ status: 400, body: { error } });

export async function getAdminCollections() {
  const db = await getDb();
  const adminSessions = db.collection("admin_sessions"); // TTL index: prepareDatabase in _db.js
  return {
    settings: db.collection("app_settings"),
    adminSessions,
    attempts: db.collection("room_attempts"),
    rooms: await getRooms(),
  };
}

export const adminCookie = (token, maxAgeSec = ADMIN_TTL_MS / 1000) =>
  sessionCookie(token, maxAgeSec, ADMIN_COOKIE);

async function createAdminSession(adminSessions, now) {
  const token = randomBytes(32).toString("hex");
  await adminSessions.insertOne({
    _id: sha256(token),
    createdAt: new Date(now),
    expiresAt: new Date(now + ADMIN_TTL_MS),
  });
  return token;
}

/** True when the token is a live admin session. */
export async function isAdminToken({ adminSessions }, token, now = Date.now()) {
  if (typeof token !== "string" || token.length < 32) return false;
  const session = await adminSessions.findOne({ _id: sha256(token) });
  return Boolean(session && new Date(session.expiresAt).getTime() > now);
}

/** The helper for endpoints: is this request from a signed-in admin? */
export async function requireAdmin(req) {
  const token = readCookie(req, ADMIN_COOKIE);
  if (!token) return false;
  return isAdminToken(await getAdminCollections(), token);
}

/** Old per-room feature-flags password hashes (same scrypt format as PINs). */
async function legacyFlagHashes(rooms) {
  const docs = await rooms
    .find({ flagsAuth: { $exists: true, $ne: null } }, { projection: { flagsAuth: 1 } })
    .toArray();
  return docs.map((d) => d.flagsAuth);
}

export async function adminStatus(cols, token) {
  const configured = Boolean(await cols.settings.findOne({ _id: ADMIN_KEY }, { projection: { _id: 1 } }));
  return {
    configured,
    signedIn: configured && (await isAdminToken(cols, token)),
    usesFlagsPassword: !configured && (await legacyFlagHashes(cols.rooms)).length > 0,
  };
}

/** Sets the admin password the first time, and signs in. */
export async function setupAdmin(cols, { password, ip }, opts = {}) {
  const now = opts.now ?? Date.now();
  if (await cols.settings.findOne({ _id: ADMIN_KEY })) {
    return { status: 409, body: { error: "The admin password is already set. Sign in instead.", configured: true } };
  }
  if (!validPassword(password)) return bad(`Use at least ${MIN_PASSWORD} characters`);
  const legacy = await legacyFlagHashes(cols.rooms);
  if (legacy.length > 0) {
    const failed = await verifySecret(
      cols,
      {
        key: ADMIN_KEY,
        matches: () => legacy.some((auth) => pinMatches(password, auth)),
        ip,
        wrong: "That isn't your current feature-flags password.",
      },
      opts
    );
    if (failed) return failed;
  }
  try {
    await cols.settings.insertOne({ _id: ADMIN_KEY, auth: hashPin(password), createdAt: new Date(now), updatedAt: new Date(now) });
  } catch (e) {
    if (e?.code === 11000) return { status: 409, body: { error: "The admin password was just set. Sign in instead.", configured: true } };
    throw e;
  }
  return { status: 200, body: { signedIn: true }, token: await createAdminSession(cols.adminSessions, now) };
}

export async function loginAdmin(cols, { password, ip }, opts = {}) {
  const now = opts.now ?? Date.now();
  const doc = await cols.settings.findOne({ _id: ADMIN_KEY });
  if (!doc) return { status: 409, body: { error: "Set the admin password first.", configured: false } };
  const failed = await verifySecret(
    cols,
    {
      key: ADMIN_KEY,
      matches: () => typeof password === "string" && password.length <= MAX_PASSWORD && pinMatches(password, doc.auth),
      ip,
      wrong: "Wrong admin password.",
    },
    opts
  );
  if (failed) return failed;
  return { status: 200, body: { signedIn: true }, token: await createAdminSession(cols.adminSessions, now) };
}

/** Changes the password (needs the current one too) and signs out every other admin device. */
export async function changeAdminPassword(cols, { token, password, newPassword, ip }, opts = {}) {
  const now = opts.now ?? Date.now();
  if (!(await isAdminToken(cols, token, now))) return { status: 401, body: { error: "Sign in as admin first." } };
  if (!validPassword(newPassword)) return bad(`Use at least ${MIN_PASSWORD} characters for the new password`);
  const result = await loginAdmin(cols, { password, ip }, opts);
  if (!result.token) return result;
  await cols.adminSessions.deleteOne({ _id: sha256(result.token) });
  await cols.settings.updateOne({ _id: ADMIN_KEY }, { $set: { auth: hashPin(newPassword), updatedAt: new Date(now) } });
  await cols.adminSessions.deleteMany({});
  return { status: 200, body: { signedIn: true }, token: await createAdminSession(cols.adminSessions, now) };
}

export async function logoutAdmin({ adminSessions }, token) {
  if (typeof token === "string" && token) await adminSessions.deleteOne({ _id: sha256(token) });
}
