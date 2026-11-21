import { useState, useMemo, memo } from "react";
import { Modal, Button } from "react-bootstrap";
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

const newDeleteCode = () => String(Math.floor(1000 + Math.random() * 9000));

// Deleting the whole library needs a typed code, so it cannot happen by accident.
function DeleteAllModal({ show, count, synced, onConfirm, onCancel }) {
  const [code, setCode] = useState(newDeleteCode);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTyped("");
    setCode(newDeleteCode());
    onCancel();
  };
  const confirm = async () => {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal show={show} onHide={close} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">Delete the whole library?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          This removes all {count} saved videos
          {synced ? " from this device and from your sync code" : " from this browser"}.
          It cannot be undone.
        </p>
        <label htmlFor="delete-code" className="form-label">
          Type <strong>{code}</strong> to confirm
        </label>
        <input
          id="delete-code"
          className="form-control"
          inputMode="numeric"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value.trim())}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={typed !== code || busy}>
          {busy ? "Deleting…" : "Delete all"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

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
  onAddAll,
  onClearLibrary,
  queuedIds,
  syncCode,
  onChangeCode,
  status,
  onRetry,
  liveStatus,
}) {
  const [filter, setFilter] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingQueueAll, setConfirmingQueueAll] = useState(false);

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

  // Everything the filter matches that is not already in the queue, in the order shown.
  const queueable = useMemo(
    () => shown.filter((v) => !queuedIds.has(v.id.videoId)),
    [shown, queuedIds]
  );
  // Large batches ask for confirmation first.
  const handleQueueAll = () => {
    if (queueable.length > 25) setConfirmingQueueAll(true);
    else onAddAll(queueable);
  };
  const confirmQueueAll = () => {
    setConfirmingQueueAll(false);
    onAddAll(queueable);
  };

  return (
    <div>
      <SyncPanel
        syncCode={syncCode}
        onChangeCode={onChangeCode}
        status={status}
        onRetry={onRetry}
        liveStatus={liveStatus}
      />

      <div className="d-flex flex-wrap gap-2">
        <input
          type="search"
          className="form-control flex-grow-1 w-auto"
          style={{ flexBasis: "12rem" }}
          placeholder={`Filter ${library.length} saved videos...`}
          aria-label="Filter library"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          className="btn btn-success text-nowrap"
          onClick={handleQueueAll}
          disabled={queueable.length === 0}
          title={filter.trim() ? "Add every matching video to the queue" : "Add the whole library to the queue"}
        >
          + Queue all{queueable.length > 0 ? ` (${queueable.length})` : ""}
        </button>
        <button
          className="btn btn-outline-danger text-nowrap"
          onClick={() => setConfirmingDelete(true)}
          disabled={library.length === 0}
          title="Delete every saved video"
        >
          Delete all
        </button>
      </div>
      <Modal show={confirmingQueueAll} onHide={() => setConfirmingQueueAll(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title as="h5">Add to the queue?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {filter.trim()
            ? `Add all ${queueable.length} videos matching "${filter.trim()}" to the queue?`
            : `Add all ${queueable.length} videos in your library to the queue?`}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmingQueueAll(false)}>
            Cancel
          </Button>
          <Button variant="success" onClick={confirmQueueAll}>
            Queue all ({queueable.length})
          </Button>
        </Modal.Footer>
      </Modal>
      <DeleteAllModal
        show={confirmingDelete}
        count={library.length}
        synced={Boolean(syncCode)}
        onConfirm={onClearLibrary}
        onCancel={() => setConfirmingDelete(false)}
      />

      <div className="library-scroll mt-2">
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
