import { useState, useEffect, useCallback } from "react";
import { Modal, Button } from "react-bootstrap";
import { toast } from "react-toastify";
import { QRCodeSVG } from "qrcode.react";
import { FaQrcode, FaCopy } from "react-icons/fa";
import { createInvite, getInvite, inviteLink, revokeInvite } from "../api/guest";

export default function InviteGuestsModal({ show, onHide, syncCode }) {
  const [token, setToken] = useState(undefined); // undefined = loading, null = no invite
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setToken(await getInvite(syncCode));
    } catch (err) {
      setToken(null);
      toast.error(err.message, { toastId: "invite-error" });
    }
  }, [syncCode]);

  useEffect(() => {
    if (show && syncCode) load();
  }, [show, syncCode, load]);

  const run = async (action) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => setToken(await createInvite(syncCode)));
  const stop = () =>
    run(async () => {
      await revokeInvite(syncCode);
      setToken(null);
      toast.success("The invite link no longer works");
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaQrcode aria-hidden="true" /> Invite guests
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!syncCode ? (
          <div className="alert alert-info mb-0">
            Turn on sync first, then come back to invite guests.
          </div>
        ) : token === undefined ? (
          <p className="text-muted mb-0">Loading…</p>
        ) : (
          <>
            <p className="small text-muted">
              Guests open the link (or scan the code) on their phone. They can search
              and add songs to your queue, and see what is playing. They cannot remove
              songs, change your library or use your settings.
            </p>
            {token ? (
              <div className="text-center">
                <div className="bg-white d-inline-block p-2 rounded mb-2">
                  <QRCodeSVG value={inviteLink(token)} size={176} />
                </div>
                <input
                  className="form-control form-control-sm mb-2"
                  readOnly
                  value={inviteLink(token)}
                  aria-label="Invite link"
                  onFocus={(e) => e.target.select()}
                />
                <div className="d-flex flex-wrap gap-2 justify-content-center">
                  <button className="btn btn-sm btn-primary d-flex align-items-center gap-1" onClick={copy}>
                    <FaCopy aria-hidden="true" /> Copy link
                  </button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={create} disabled={busy}>
                    New link
                  </button>
                  <button className="btn btn-sm btn-outline-danger" onClick={stop} disabled={busy}>
                    Stop sharing
                  </button>
                </div>
                <div className="form-text">
                  "New link" and "Stop sharing" make the old link and code stop working.
                </div>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={create} disabled={busy}>
                Create invite link
              </button>
            )}
          </>
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
