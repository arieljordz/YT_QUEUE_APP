import { useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { FaSync } from "react-icons/fa";

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

const MIN_CODE = 8;

export default function SyncModal({
  show,
  onHide,
  syncCode,
  onChangeCode,
  status,
  onRetry,
  liveStatus,
}) {
  const [draft, setDraft] = useState("");
  const tooShort = draft.trim().length < MIN_CODE;

  const turnOn = (e) => {
    e.preventDefault();
    if (tooShort) return;
    onChangeCode(draft.trim());
    setDraft("");
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaSync aria-hidden="true" /> Sync
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {syncCode ? (
          <>
            <div className="mb-3">
              <div>{STATUS_TEXT[status]}</div>
              {LIVE_TEXT[liveStatus] && <div>{LIVE_TEXT[liveStatus]}</div>}
            </div>
            <div className="d-flex gap-2">
              {(status === "error" || status === "unavailable") && (
                <button className="btn btn-outline-primary" onClick={onRetry}>
                  Retry
                </button>
              )}
              <button className="btn btn-outline-secondary" onClick={() => onChangeCode("")}>
                Turn off sync
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={turnOn}>
            <div className="mb-2">{STATUS_TEXT[status]}</div>
            <div className="input-group">
              <input
                type="password"
                className="form-control"
                placeholder={`Choose a secret sync code (${MIN_CODE}+ characters)`}
                aria-label="Sync code"
                autoComplete="off"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={tooShort}>
                Turn on sync
              </button>
            </div>
            <div className="form-text">
              Use the same code on every device. Anyone with the code can see and add to
              your library, so keep it private.
            </div>
          </form>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
