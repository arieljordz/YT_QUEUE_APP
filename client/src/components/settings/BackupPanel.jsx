import { useRef, useState } from "react";
import { FaDownload, FaUpload } from "react-icons/fa";
import { notify } from "../../lib/notify";
import { createBackup, readBackupFile, restoreBackup } from "../../api/backup";

// What each part of the database is, in the app's words.
const PARTS = {
  rooms: "Rooms (names, PINs, queues)",
  library_videos: "Library videos",
  room_playlists: "Playlists",
  catalog_videos: "Saved lists (Import Videos)",
  app_settings: "App settings (feature flags)",
};
const partName = (name) => PARTS[name] ?? name;

const fileStamp = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
};

function saveFile(backup) {
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `queueup-backup-${fileStamp(new Date(backup.createdAt))}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Progress({ label, done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="small text-body-secondary mb-1">
        {label} {done} of {total} documents…
      </div>
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Settings > Backup: download the whole database as a file, and restore one.
 * Already behind the admin sign-in; the server checks it again.
 * onAdminRequired() is called when the admin sign-in has expired.
 */
export default function BackupPanel({ onAdminRequired }) {
  const [busy, setBusy] = useState(null); // "backup" | "restore" | null
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // The checked backup waiting for the admin to confirm the restore.
  const [pending, setPending] = useState(null); // { backup, fileName }
  const fileInput = useRef(null);

  const failed = (err) => {
    notify.backup.failed(err);
    if (err.adminRequired) onAdminRequired?.();
  };

  const download = async () => {
    setBusy("backup");
    try {
      const backup = await createBackup((done, total) => setProgress({ done, total }));
      saveFile(backup);
      notify.backup.saved(Object.values(backup.counts).reduce((a, b) => a + b, 0));
    } catch (err) {
      failed(err);
    } finally {
      setBusy(null);
    }
  };

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // so the same file can be picked again
    if (!file) return;
    try {
      setPending({ backup: await readBackupFile(file), fileName: file.name });
    } catch (err) {
      notify.backup.failed(err);
    }
  };

  const restore = async () => {
    setBusy("restore");
    try {
      const restored = await restoreBackup(pending.backup, (done, total) => setProgress({ done, total }));
      setPending(null);
      notify.backup.restored(Object.values(restored).reduce((a, b) => a + b, 0));
    } catch (err) {
      failed(err);
    } finally {
      setBusy(null);
    }
  };

  const created = pending && new Date(pending.backup.createdAt);

  return (
    <>
      <section className="mb-4">
        <h3 className="fs-6 text-uppercase text-body-secondary mb-2">Backup</h3>
        <p className="small text-body-secondary">
          Downloads everything in the database as one file: the rooms with their PINs and queues, every
          room&apos;s library and playlists, the saved lists and the feature flags. The admin password is not
          included. Keep the file somewhere safe: anyone with it can read the rooms&apos; data.
        </p>
        <button className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={download} disabled={busy !== null}>
          {busy === "backup" ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <FaDownload aria-hidden="true" />}
          {busy === "backup" ? "Downloading…" : "Download backup"}
        </button>
        {busy === "backup" && <Progress label="Read" {...progress} />}
      </section>

      <section>
        <h3 className="fs-6 text-uppercase text-body-secondary mb-2">Restore</h3>
        <p className="small text-body-secondary">
          Replaces everything in the database with a backup file. The admin password stays as it is.
        </p>
        <input ref={fileInput} type="file" accept=".json,application/json" className="d-none" onChange={pick} />
        {!pending && (
          <button
            className="btn btn-outline-danger d-inline-flex align-items-center gap-2"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
          >
            <FaUpload aria-hidden="true" /> Choose a backup file…
          </button>
        )}

        {pending && (
          <div className="add-library-confirm is-danger" role="alert">
            <p className="mb-2 small">
              <strong>{pending.fileName}</strong>
              {!Number.isNaN(created.getTime()) && <> made {created.toLocaleString()}</>}
            </p>
            <ul className="small mb-2 ps-3">
              {Object.entries(pending.backup.collections).map(([name, docs]) => (
                <li key={name}>
                  {partName(name)}: {docs.length}
                </li>
              ))}
            </ul>
            <p className="mb-2 small">
              Restoring <strong>deletes everything in the database now</strong> and puts this backup in its
              place, for every room and every device. It can&apos;t be undone, so download a backup first if
              you may want today&apos;s data back.
            </p>
            <div className="d-flex gap-2 flex-wrap">
              <button className="btn btn-sm btn-danger d-inline-flex align-items-center gap-2" onClick={restore} disabled={busy !== null}>
                {busy === "restore" ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : <FaUpload aria-hidden="true" />}
                {busy === "restore" ? "Restoring…" : "Replace the database"}
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setPending(null)} disabled={busy !== null}>
                Cancel
              </button>
            </div>
            {busy === "restore" && <Progress label="Uploaded" {...progress} />}
          </div>
        )}
      </section>
    </>
  );
}
