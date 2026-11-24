import { useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { toast } from "react-toastify";
import { FaFlag } from "react-icons/fa";
import useFeatureFlags from "../hooks/useFeatureFlags";

const MIN_PASSWORD = 6;

function Flag({ id, label, description, checked, disabled, onChange }) {
  return (
    <div className="form-check form-switch mb-3">
      <input
        id={id}
        type="checkbox"
        className="form-check-input"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label className="form-check-label fw-semibold" htmlFor={id}>
        {label}
      </label>
      <div className="form-text mt-0">{description}</div>
    </div>
  );
}

export default function FeatureFlagsModal({ show, onHide, darkMode, onToggleTheme }) {
  const { flags, setFlag, locked, synced } = useFeatureFlags();
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // With sync on, the server needs the password for every change.
  const needsPassword = synced && password.length < MIN_PASSWORD;

  const change = async (name, enabled) => {
    setSaving(true);
    try {
      await setFlag(name, enabled, password);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    setPassword("");
    onHide();
  };

  return (
    <Modal show={show} onHide={close} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaFlag aria-hidden="true" /> Feature Flags
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Flag
          id="flag-appearance"
          label="Appearance: dark mode"
          description="Use the dark theme for the whole app (this device only)."
          checked={darkMode}
          onChange={onToggleTheme}
        />

        <hr />
        {synced ? (
          <div className="mb-3">
            <label className="form-label small mb-1" htmlFor="flags-password">
              {locked ? "Flags password" : "Choose a flags password"}
            </label>
            <input
              id="flags-password"
              type="password"
              className="form-control"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD} characters`}
            />
            <div className="form-text">
              {locked
                ? "Needed to change the library flags below. They apply to every device on your sync code."
                : "Needed to change the library flags below, so only you can turn deleting on. Remember it: the first one you type is saved."}
            </div>
          </div>
        ) : (
          <div className="form-text mb-3">
            Sync is off, so these flags only apply to this browser. Turn on sync to
            share them across devices and lock them with a password.
          </div>
        )}

        <Flag
          id="flag-remove"
          label="Library: Remove button"
          description="Show the Remove button on each video in the Library."
          checked={flags.removeButton}
          disabled={needsPassword || saving}
          onChange={(on) => change("removeButton", on)}
        />
        <Flag
          id="flag-delete-all"
          label="Library: Delete all button"
          description="Show the Delete all button above the Library list."
          checked={flags.deleteAllButton}
          disabled={needsPassword || saving}
          onChange={(on) => change("deleteAllButton", on)}
        />
        <Flag
          id="flag-delete-list"
          label="Add Library: Delete list button"
          description="Show the trash button on each saved list in Add Library."
          checked={flags.deleteListButton}
          disabled={needsPassword || saving}
          onChange={(on) => change("deleteListButton", on)}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={close}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
