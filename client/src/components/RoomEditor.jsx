import { useState } from "react";
import { Modal } from "react-bootstrap";
import { createRoom, deleteRoom, updateRoom } from "../api/rooms";
import { AVATARS } from "../lib/avatars";
import Avatar from "./RoomAvatar";

/** A 4-digit PIN field. Only digits are kept. */
function PinField({ id, label, value, onChange, hint }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label small mb-1">{label}</label>
      <input
        id={id}
        className="form-control room-pin-field"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="••••"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      />
      {hint && <div className="form-text room-muted">{hint}</div>}
    </div>
  );
}

/**
 * Create, edit or delete a room (admin only: the server checks the admin
 * sign-in). mode: "create" | "edit". onAdminRequired() is called when the
 * admin sign-in expired.
 */
export default function RoomEditor({ mode, room, onClose, onDone, onMissing, onAdminRequired }) {
  const [name, setName] = useState(room?.name ?? "");
  const [avatar, setAvatar] = useState(room?.avatar ?? "avatar-1");
  const [description, setDescription] = useState(room?.description ?? "");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // A new room, or one that never got a PIN, must be given one.
  const pinRequired = mode === "create" || !room?.hasPin;

  async function run(request, onOk) {
    setBusy(true);
    setError("");
    try {
      const result = await request();
      if (result.ok) return onOk(result.data);
      if (result.data.adminRequired) return onAdminRequired();
      if (result.data.missing) return onMissing();
      setError(result.data.error ?? "Something went wrong. Try again.");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    if (busy) return;
    if (pinRequired && newPin.length !== 4) return setError("Choose a 4-digit PIN.");
    if (newPin && newPin.length !== 4) return setError("The new PIN must be 4 digits.");
    if (newPin !== confirmPin) return setError("The two PINs don't match.");

    const fields = { name, avatar, description, ...(newPin ? { newPin } : {}) };
    if (mode === "create") {
      return run(() => createRoom(fields), (data) => onDone(`${data.room.name} was added.`));
    }
    return run(
      () => updateRoom(room.id, fields),
      (data) =>
        onDone(
          data.signedOut
            ? `PIN changed. Every device in ${data.room.name} was signed out.`
            : `${data.room.name} saved.`
        )
    );
  }

  function remove() {
    return run(() => deleteRoom(room.id), () => onDone(`${room.name} was deleted.`));
  }

  return (
    <Modal show onHide={busy ? undefined : onClose} centered className="room-modal">
      <form onSubmit={save}>
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title as="h2" className="fs-5">
            {mode === "create" ? "Add Room" : `Edit Room: ${room.name}`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {confirmDelete ? (
            <p>
              Delete <strong>{room.name}</strong>? Its queue, library, favorites and history are
              removed for everyone. This can&apos;t be undone.
            </p>
          ) : (
            <fieldset disabled={busy}>
              <div className="d-flex justify-content-center mb-3">
                <span className="room-editor-preview">
                  <Avatar avatar={avatar} />
                </span>
              </div>
              <div className="mb-3">
                <label htmlFor="room-name" className="form-label small mb-1">Name</label>
                <input
                  id="room-name"
                  className="form-control"
                  maxLength={30}
                  required
                  value={name}
                  autoFocus={mode === "create"}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="mb-3">
                <span className="form-label small mb-1 d-block">Avatar</span>
                <div className="room-avatar-picker" role="radiogroup" aria-label="Avatar">
                  {Object.keys(AVATARS).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={avatar === key}
                      aria-label={key.replace("-", " ")}
                      className={`room-avatar-option${avatar === key ? " selected" : ""}`}
                      onClick={() => setAvatar(key)}
                    >
                      <Avatar avatar={key} size={24} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label htmlFor="room-desc" className="form-label small mb-1">
                  Description <span className="room-muted">(optional)</span>
                </label>
                <input
                  id="room-desc"
                  className="form-control"
                  maxLength={80}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <PinField
                id="room-new-pin"
                label={pinRequired ? "PIN" : "New PIN"}
                value={newPin}
                onChange={setNewPin}
                hint={
                  pinRequired
                    ? "4 digits, different from every other room."
                    : "Leave blank to keep the current PIN. A new PIN signs everyone out of this room."
                }
              />
              {(pinRequired || newPin) && (
                <PinField id="room-confirm-pin" label="Repeat the PIN" value={confirmPin} onChange={setConfirmPin} />
              )}
            </fieldset>
          )}
          {error && <p className="room-notice mb-0" role="alert">{error}</p>}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          {mode === "edit" ? (
            confirmDelete ? (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
                {busy ? "Deleting…" : "Delete for good"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline-danger"
                disabled={busy}
                onClick={() => {
                  setError("");
                  setConfirmDelete(true);
                }}
              >
                Delete room
              </button>
            )
          ) : (
            <span />
          )}
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-outline-light"
              disabled={busy}
              onClick={
                confirmDelete
                  ? () => {
                      setError("");
                      setConfirmDelete(false);
                    }
                  : onClose
              }
            >
              {confirmDelete ? "Back" : "Cancel"}
            </button>
            {!confirmDelete && (
              <button type="submit" className="btn btn-danger" disabled={busy}>
                {busy ? "Saving…" : mode === "create" ? "Add room" : "Save"}
              </button>
            )}
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
