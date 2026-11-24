import { useState } from "react";
import { FaUserShield } from "react-icons/fa";
import { changeAdminPassword, loginAdmin, setupAdmin } from "../api/admin";

const MIN_PASSWORD = 6;

/**
 * The admin password form, shared by Manage Rooms (first-time setup and
 * sign-in) and Settings (sign-in and changing the password).
 * mode: "setup" (first time), "login", or "change".
 * Calls onDone() after the server accepted it.
 */
export default function AdminSignIn({ mode, usesFlagsPassword, onDone, onStale, onCancel, purpose }) {
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const choosing = mode === "setup" || mode === "change";
  const chosen = mode === "setup" ? password : newPassword;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (password.length < MIN_PASSWORD) return setError(`The password has at least ${MIN_PASSWORD} characters.`);
    if (choosing && chosen.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (choosing && chosen !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "setup"
          ? await setupAdmin(password)
          : mode === "change"
            ? await changeAdminPassword(password, newPassword)
            : await loginAdmin(password);
      if (result.ok) return onDone();
      setError(result.data.error ?? "Something went wrong. Try again.");
      if (result.data.configured !== undefined) onStale?.(); // setup vs sign-in changed meanwhile
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = { setup: "Set the admin password", login: "Admin sign-in", change: "Change admin password" }[mode];
  const intro = {
    setup: usesFlagsPassword
      ? "Enter your current feature-flags password. It becomes the admin password for the whole app."
      : "Create the admin password. It's one password for the whole app: it manages rooms and opens Settings in every room.",
    login: purpose ?? "Enter the admin password.",
    change: "Every other device signed in as admin will be signed out.",
  }[mode];

  return (
    <form className="admin-signin" onSubmit={submit}>
      <h2 className="fs-5 d-flex align-items-center gap-2 mb-1">
        <FaUserShield aria-hidden="true" /> {title}
      </h2>
      <p className="small admin-muted mb-3">{intro}</p>
      <fieldset disabled={busy}>
        <label htmlFor="admin-pw" className="form-label small mb-1">
          {mode === "change" ? "Current password" : mode === "setup" && usesFlagsPassword ? "Feature-flags password" : "Password"}
        </label>
        <input
          id="admin-pw"
          type="password"
          className="form-control mb-2"
          autoComplete={mode === "setup" && !usesFlagsPassword ? "new-password" : "current-password"}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "change" && (
          <>
            <label htmlFor="admin-new" className="form-label small mb-1">New password</label>
            <input id="admin-new" type="password" className="form-control mb-2" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </>
        )}
        {choosing && (
          <>
            <label htmlFor="admin-confirm" className="form-label small mb-1">Repeat the {mode === "change" ? "new " : ""}password</label>
            <input id="admin-confirm" type="password" className="form-control mb-2" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </>
        )}
        {error && <p className="small text-danger mb-2" role="alert">{error}</p>}
        <div className="d-flex gap-2 mt-3">
          <button type="submit" className="btn btn-danger">
            {busy ? "Checking…" : mode === "change" ? "Change password" : mode === "setup" ? "Set password" : "Sign in"}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
