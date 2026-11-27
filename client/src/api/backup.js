// Client for /api/backup (admin only): downloads the whole database as one
// JSON file, and restores one. Both go a page at a time, because a Vercel
// request or response is limited to about 4.5 MB.
export const BACKUP_TYPE = "queueup-database-backup";
const BACKUP_VERSION = 1;
// A restore upload is cut into pieces of at most this many bytes and documents.
const CHUNK_BYTES = 2_000_000;
const CHUNK_DOCS = 1000;

export class BackupError extends Error {
  constructor(message, adminRequired = false) {
    super(message);
    this.adminRequired = adminRequired;
  }
}

async function post(body) {
  const response = await fetch("/api/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (!isJson && response.status >= 500) {
    throw new BackupError(`The server did not answer in time (error ${response.status}). Try again.`);
  }
  // Local dev (plain vite) has no /api route and answers with HTML.
  if (!isJson) throw new BackupError("Backup and restore only work on the deployed site.");
  const data = await response.json();
  if (!response.ok) throw new BackupError(data.error ?? "Something went wrong.", Boolean(data.adminRequired));
  return data;
}

/** [{ name, count }] of what a backup would hold now. */
export const getBackupInfo = () => post({ action: "info" }).then((d) => d.collections);

/**
 * Reads every collection, a page at a time. onProgress(done, total) after each page.
 * Returns the backup object, ready to be saved as JSON.
 */
export async function createBackup(onProgress) {
  const info = await getBackupInfo();
  const total = info.reduce((sum, c) => sum + c.count, 0);
  const collections = {};
  let done = 0;
  onProgress?.(done, total);
  for (const { name } of info) {
    const docs = [];
    let after = null;
    do {
      const page = await post({ action: "export", collection: name, after });
      docs.push(...page.docs);
      done += page.docs.length;
      onProgress?.(done, total);
      after = page.next;
    } while (after !== null);
    collections[name] = docs;
  }
  return {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(collections).map(([n, d]) => [n, d.length])),
    collections,
  };
}

/** Reads and checks a backup file. Throws a BackupError that can be shown. */
export async function readBackupFile(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new BackupError("That file isn't a backup: it couldn't be read as JSON.");
  }
  if (backup?.type !== BACKUP_TYPE || !backup.collections || typeof backup.collections !== "object") {
    throw new BackupError("That file isn't a QueueUp database backup.");
  }
  if (backup.version > BACKUP_VERSION) {
    throw new BackupError("This backup was made by a newer version of the app.");
  }
  for (const [name, docs] of Object.entries(backup.collections)) {
    if (!Array.isArray(docs)) throw new BackupError(`The backup's "${name}" part is damaged.`);
  }
  return backup;
}

/** Splits docs into pieces small enough for one request. */
function chunks(docs) {
  const out = [];
  let current = [];
  let bytes = 0;
  for (const doc of docs) {
    const size = JSON.stringify(doc).length;
    if (current.length && (current.length >= CHUNK_DOCS || bytes + size > CHUNK_BYTES)) {
      out.push(current);
      current = [];
      bytes = 0;
    }
    current.push(doc);
    bytes += size;
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * Empties the database but keeps the rooms (names, avatars, PINs) and the
 * admin password. Returns { [part]: count } of what was cleared.
 */
export const clearDatabase = () => post({ action: "clear", confirm: "CLEAR" }).then((d) => d.cleared);

/**
 * Replaces the database with the backup. Nothing changes until every piece
 * has arrived. onProgress(done, total) after each piece. Returns { [collection]: count }.
 */
export async function restoreBackup(backup, onProgress) {
  const entries = Object.entries(backup.collections);
  const total = entries.reduce((sum, [, docs]) => sum + docs.length, 0);
  let done = 0;
  onProgress?.(done, total);
  await post({ action: "restoreStart" });
  const counts = {};
  for (const [name, docs] of entries) {
    for (const piece of chunks(docs)) {
      await post({ action: "restoreChunk", collection: name, docs: piece });
      done += piece.length;
      onProgress?.(done, total);
    }
    counts[name] = docs.length;
  }
  return (await post({ action: "restoreFinish", counts })).restored;
}
