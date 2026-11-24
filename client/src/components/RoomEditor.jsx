import { useState } from "react";
import { Modal } from "react-bootstrap";
import { createRoom, deleteRoom, updateRoom } from "../api/rooms";
import { AVATARS } from "../lib/avatars";
import Avatar from "./RoomAvatar";

const TITLES = { create: "Add Room", edit: "Edit Room", claim: "Set up room" };

/** A 4-digit PIN field. Only digits are kept. */
function PinField({ id, label, value, onChange, hint, autoFocus }) {
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
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      />
      {hint && <div className="form-text room-muted">{hint}</div>}
    </div>
  );
}

/**
 * Create, edit, set up (claim) or delete a room. Changes to an existing room
 * need its current PIN; the server checks it. The PIN is never kept after the
 * request.
 */
export default function RoomEditor({ mode, room, onClose, onDone, onMissing }) {
  const [name, setName] = useState(room?.name ?? "");
  const [avatar, setAvatar] = useState(room?.avatar ?? "avatar-1");
  const [description, setDescription] = useState(room?.description ?? "");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const needsCurrent = mode === "edit" && room?.hasPin;
  const blockedNoPin = mode === "edit" && !room?.hasPin && !room?.claimable;
  const newPinRequired = mode !== "edit" || !room?.hasPin;

  async function run(request, onOk) {
    setBusy(true);
    setError("");
    try {
      const result = await request();
      if (result.ok) return onOk(result.data);
      if (result.data.missing) return onMissing();
      setError(result.data.error ?? "Something went wrong. Try again.");
      if (result.status === 401 || result.status === 429) setPin("");
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    if (busy) return;
    if (needsCurrent && pin.length !== 4) return setError("Enter the room's current PIN.");
    if (newPinRequired && newPin.length !== 4) return setError("Choose a 4-digit PIN.");
    if (newPin && newPin.length !== 4) return setError("The new PIN must be 4 digits.");
    if (newPin !== confirmPin) return setError("The two new PINs don't match.");

    const fields = { name, avatar, description, ...(newPin ? { newPin } : {}) };
    if (mode === "create") {
      return run(() => createRoom(fields), (data) => onDone({ entered: true, room: data.room }));
    }
    return run(
      () => updateRoom(room.id, { ...fields, pin: needsCurrent ? pin : undefined }),
      (data) =>
        onDone({
          entered: Boolean(data.entered),
          room: data.room,
          message: data.signedOut
            ? `PIN changed. Every device in ${data.room.name} was signed out.`
            : `${data.room.name} saved.`,
        })
    );
  }

  function remove() {
    if (needsCurrent && pin.length !== 4) return setError("Enter the room's current PIN to delete it.");
    return run(
      () => deleteRoom(room.id, needsCurrent ? pin : undefined),
      () => onDone({ message: `${room.name} was deleted.` })
    );
  }

  return (
    <Modal show onHide={busy ? undefined : onClose} centered className="room-modal">
      <form onSubmit={save}>
        <Modal.Header closeButton closeVariant="white">
          <Modal.Title as="h2" className="fs-5">
            {TITLES[mode]}
            {mode !== "create" && room ? `: ${room.name}` : ""}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {blockedNoPin && (
            <p className="room-notice">
              This room holds migrated data and has no PIN yet. Set its PIN with the migration script.
            </p>
          )}
          {confirmDelete ? (
            <>
              <p>
                Delete <strong>{room.name}</strong>? Its queue, library, favorites, history and guest
                invites are removed for everyone. This can&apos;t be undone.
              </p>
              {needsCurrent && (
                <PinField id="room-del-pin" label="Current PIN" value={pin} onChange={setPin} autoFocus />
              )}
            </>
          ) : (
            <fieldset disabled={busy || blockedNoPin}>
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
              {needsCurrent && (
                <PinField id="room-cur-pin" label="Current PIN (required to save)" value={pin} onChange={setPin} />
              )}
              <PinField
                id="room-new-pin"
                label={newPinRequired ? "PIN" : "New PIN"}
                value={newPin}
                onChange={setNewPin}
                hint={newPinRequired ? "4 digits, different from every other room." : "Leave blank to keep the current PIN."}
              />
              {(newPinRequired || newPin) && (
                <PinField id="room-confirm-pin" label="Repeat the PIN" value={confirmPin} onChange={setConfirmPin} />
              )}
            </fieldset>
          )}
          {error && <p className="room-notice mb-0" role="alert">{error}</p>}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          {mode === "edit" && !blockedNoPin ? (
            confirmDelete ? (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>
                {busy ? "Deleting…" : "Delete for good"}
              </button>
            ) : (
              <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => { setError(""); setConfirmDelete(true); }}>
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
              onClick={confirmDelete ? () => { setError(""); setConfirmDelete(false); } : onClose}
            >
              {confirmDelete ? "Back" : "Cancel"}
            </button>
            {!confirmDelete && !blockedNoPin && (
              <button type="submit" className="btn btn-danger" disabled={busy}>
                {busy ? "Saving…" : mode === "edit" ? "Save" : mode === "create" ? "Create & enter" : "Set PIN & enter"}
              </button>
            )}
          </div>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
