import { useState, useMemo, memo } from "react";
import VideoList from "./VideoList";

const MAX_SHOWN = 100;

const STATUS_TEXT = {
  off: "Sync is off. Your library is only saved in this browser.",
  syncing: "Syncing…",
  synced: "Synced. Open the app on another device with the same sync code.",
  unavailable: "Sync is not available here (it only works on the deployed site).",
  error: "Sync failed. Check your connection and try again.",
};

const LIVE_TEXT = {
  connecting: "Live queue: connecting…",
  connected: "Live queue: connected. Queue changes appear on your other devices.",
  reconnecting: "Live queue: reconnecting…",
  unavailable: "Live queue: not available here (deployed site only).",
  error: "Live queue: could not connect. Check the Ably setup.",
};

function SyncPanel({ syncCode, onChangeCode, status, onRetry, liveStatus }) {
  const [draft, setDraft] = useState("");
  const tooShort = draft.trim().length < 8;

  const save = (e) => {
    e.preventDefault();
    if (!tooShort) {
      onChangeCode(draft.trim());
      setDraft("");
    }
  };

  return (
    <div className="card card-body mb-3">
      <div className="small mb-2">{STATUS_TEXT[status]}</div>
      {syncCode && LIVE_TEXT[liveStatus] && (
        <div className="small mb-2">{LIVE_TEXT[liveStatus]}</div>
      )}
      {syncCode ? (
        <div className="d-flex gap-2">
          {(status === "error" || status === "unavailable") && (
            <button className="btn btn-sm btn-outline-primary" onClick={onRetry}>
              Retry
            </button>
          )}
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onChangeCode("")}
          >
            Turn off sync on this device
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="input-group input-group-sm">
          <input
            type="password"
            className="form-control"
            placeholder="Choose a secret sync code (8+ characters)"
            aria-label="Sync code"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn btn-primary" type="submit" disabled={tooShort}>
            Turn on sync
          </button>
        </form>
      )}
      {!syncCode && (
        <div className="form-text">
          Use the same code on every device. Anyone with the code can see and add
          to your library, so keep it private.
        </div>
      )}
    </div>
  );
}

function Library({
  library,
  onAdd,
  queuedIds,
  syncCode,
  onChangeCode,
  status,
  onRetry,
  liveStatus,
}) {
  const [filter, setFilter] = useState("");

  // Newest additions first, narrowed by the filter box.
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matches = [...library]
      .reverse()
      .filter(
        (v) =>
          !needle ||
          v.snippet.title.toLowerCase().includes(needle) ||
          v.snippet.channelTitle?.toLowerCase().includes(needle)
      );
    return matches;
  }, [library, filter]);

  return (
    <div>
      <SyncPanel
        syncCode={syncCode}
        onChangeCode={onChangeCode}
        status={status}
        onRetry={onRetry}
        liveStatus={liveStatus}
      />

      <input
        type="search"
        className="form-control"
        placeholder={`Filter ${library.length} saved videos...`}
        aria-label="Filter library"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <VideoList
        videos={shown.slice(0, MAX_SHOWN)}
        queuedIds={queuedIds}
        onAdd={onAdd}
        isLoading={false}
        hasSearched
        emptyText={
          library.length === 0
            ? "Videos you add to the queue are saved here automatically."
            : "No saved videos match that filter."
        }
      />
      {shown.length > MAX_SHOWN && (
        <p className="text-muted small text-center mt-2">
          Showing the newest {MAX_SHOWN} of {shown.length}. Use the filter to find more.
        </p>
      )}
    </div>
  );
}

export default memo(Library);
