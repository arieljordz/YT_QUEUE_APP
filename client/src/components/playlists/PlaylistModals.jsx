import { useState } from "react";
import { Modal, Button } from "react-bootstrap";
import VideoPicker from "./VideoPicker";
import { plural } from "../../lib/notify";

const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;

/**
 * Create a playlist (name, description and videos picked from the Library) or,
 * with `playlist`, rename it and change its description.
 * onSave({ name, description, videoIds }) resolves to true when saved.
 */
export function PlaylistFormModal({ show, playlist, library, youtubeOnlyIds, onSave, onClose }) {
  const editing = Boolean(playlist);
  const [name, setName] = useState(playlist?.name ?? "");
  const [description, setDescription] = useState(playlist?.description ?? "");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    const ok = await onSave(
      editing ? { name: trimmed, description } : { name: trimmed, description, videoIds: [...selected] }
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal show={show} onHide={() => !busy && onClose()} centered size={editing ? undefined : "lg"} scrollable>
      <form onSubmit={submit} className="pl-form">
        <Modal.Header closeButton>
          <Modal.Title as="h5">{editing ? "Edit playlist" : "New playlist"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <label htmlFor="playlist-name" className="form-label fw-semibold">
              Name
            </label>
            <input
              id="playlist-name"
              className="form-control"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="Playlist name"
              autoFocus
              required
            />
          </div>
          <div className="mb-3">
            <label htmlFor="playlist-description" className="form-label fw-semibold">
              Description <span className="text-body-secondary fw-normal">(optional)</span>
            </label>
            <textarea
              id="playlist-description"
              className="form-control"
              rows={2}
              value={description}
              maxLength={MAX_DESCRIPTION}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {!editing && (
            <>
              <div className="form-label fw-semibold mb-1">Videos</div>
              <p className="small text-body-secondary mb-2">
                Pick videos from your library now, or add them later. They play in the order you pick them.
              </p>
              <VideoPicker
                library={library}
                selected={selected}
                onChange={setSelected}
                youtubeOnlyIds={youtubeOnlyIds}
              />
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" className="yq-btn-primary" disabled={!trimmed || busy}>
            {busy
              ? "Saving…"
              : editing
                ? "Save"
                : selected.size > 0
                  ? `Create with ${plural(selected.size, "video")}`
                  : "Create playlist"}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

/** Adds more Library videos to the end of a playlist. onAdd(videoIds) resolves to true when saved. */
export function AddVideosModal({ show, playlist, library, youtubeOnlyIds, onAdd, onClose }) {
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  // Fixed while the dialog is open.
  const [inPlaylist] = useState(() => new Set(playlist.videoIds));

  const add = async () => {
    setBusy(true);
    const ok = await onAdd([...selected]);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal show={show} onHide={() => !busy && onClose()} centered size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title as="h5">Add videos to “{playlist.name}”</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <VideoPicker
          library={library}
          selected={selected}
          onChange={setSelected}
          excludeIds={inPlaylist}
          youtubeOnlyIds={youtubeOnlyIds}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button className="yq-btn-primary" onClick={add} disabled={selected.size === 0 || busy}>
          {busy ? "Adding…" : selected.size > 0 ? `Add ${plural(selected.size, "video")}` : "Add videos"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/** Confirms deleting a playlist (its videos stay in the Library). onConfirm resolves to true when done. */
export function DeletePlaylistModal({ show, playlist, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal show={show} onHide={() => !busy && onClose()} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">Delete “{playlist.name}”?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        This deletes the playlist for everyone in this room. Its videos stay in your library and
        the queue is not changed.
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={busy}>
          {busy ? "Deleting…" : "Delete playlist"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
