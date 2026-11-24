// The small windows of the user menu: Invite, Appearance and Leave Room.
import { useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "react-toastify";
import { FaCopy, FaDoorOpen, FaMoon, FaPalette, FaQrcode, FaShareAlt, FaSun } from "react-icons/fa";

/** Invite: a QR code of the app's address (not a room or guest link). */
export function InviteModal({ show, onHide }) {
  const url = `${window.location.origin}/`;
  const canShare = typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it.");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: "YouTube Queueing App", url });
    } catch {
      // cancelled by the user
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaQrcode aria-hidden="true" /> Invite
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center">
        <p className="mb-3">Scan to open the app, then pick a room and enter its PIN.</p>
        <div className="invite-qr mx-auto mb-3">
          <QRCodeSVG value={url} size={220} marginSize={2} title="QR code of the app link" />
        </div>
        <input className="form-control text-center mb-3" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="App link" />
        <div className="d-flex justify-content-center gap-2 flex-wrap">
          <Button variant="primary" onClick={copy} className="d-flex align-items-center gap-2">
            <FaCopy aria-hidden="true" /> Copy link
          </Button>
          {canShare && (
            <Button variant="outline-primary" onClick={share} className="d-flex align-items-center gap-2">
              <FaShareAlt aria-hidden="true" /> Share
            </Button>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
}

const THEMES = {
  light: { label: "Light mode", Icon: FaSun },
  dark: { label: "Dark mode", Icon: FaMoon },
};

/** Appearance: only the themes the admin left on. */
export function AppearanceModal({ show, onHide, theme, setTheme, options }) {
  return (
    <Modal show={show} onHide={onHide} centered size="sm">
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaPalette aria-hidden="true" /> Appearance
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {options.length < 2 ? (
          <p className="mb-0">
            The app uses <strong>{THEMES[theme].label.toLowerCase()}</strong>. It&apos;s the only theme turned on.
          </p>
        ) : (
          <div className="d-grid gap-2" role="radiogroup" aria-label="Theme">
            {options.map((t) => {
              const { label, Icon } = THEMES[t];
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  className={`btn d-flex align-items-center gap-2 ${theme === t ? "btn-primary" : "btn-outline-secondary"}`}
                  onClick={() => setTheme(t)}
                >
                  <Icon aria-hidden="true" /> {label}
                </button>
              );
            })}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}

/** Leave Room: back to room selection. The room and its data stay. */
export function LeaveRoomModal({ show, onHide, roomName, onLeave }) {
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    setBusy(true);
    try {
      await onLeave();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaDoorOpen aria-hidden="true" /> Leave {roomName || "room"}?
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        You&apos;ll go back to the room screen. The room, its queue and its library stay as they are. You&apos;ll need
        the room&apos;s PIN to come back.
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={busy}>
          Stay
        </Button>
        <Button variant="danger" onClick={leave} disabled={busy}>
          Leave room
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
