import { useState, useMemo, memo } from "react";
import VideoList from "./VideoList";

const MAX_SHOWN = 100;

const STATUS_TEXT = {
  off: "Sync is off. Your library is only saved in this browser.",
  syncing: "Syncing library…",
  synced: "Library synced across your devices.",
  unavailable: "Sync is not available here (it only works on the deployed site).",
  error: "Sync failed. Check your connection and try again.",
};

const LIVE_TEXT = {
  connecting: "Live queue: connecting…",
  connected: "Live queue connected.",
  reconnecting: "Live queue: connection lost, retrying…",
  unavailable: "Live queue: not available here (deployed site only).",
  error: "Live queue: the server could not reach the database. Check MONGODB_URI.",
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

  // With sync on, show a compact one-row card: status text on the left, buttons on the right.
  if (syncCode) {
    return (
      <div className="card card-body py-2 px-3 mb-2 flex-row flex-wrap align-items-center gap-2">
        <div className="small flex-grow-1">
          <div>{STATUS_TEXT[status]}</div>
          {LIVE_TEXT[liveStatus] && <div>{LIVE_TEXT[liveStatus]}</div>}
        </div>
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
            Turn off sync
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card card-body py-2 px-3 mb-2">
      <div className="small mb-2">{STATUS_TEXT[status]}</div>
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
      <div className="form-text">
        Use the same code on every device. Anyone with the code can see and add to
        your library, so keep it private.
      </div>
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

      <div className="library-scroll">
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
      </div>
      {shown.length > MAX_SHOWN && (
        <p className="text-muted small text-center mt-2">
          Showing the newest {MAX_SHOWN} of {shown.length}. Use the filter to find more.
        </p>
      )}
    </div>
  );
}

export default memo(Library);
