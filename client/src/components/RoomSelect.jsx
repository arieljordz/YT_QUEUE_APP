import { useCallback, useEffect, useState } from "react";
import { FaLock, FaPencilAlt, FaPlus } from "react-icons/fa";
import AppLogo from "./AppLogo";
import { listRooms } from "../api/rooms";
import { MAX_ROOMS } from "../lib/avatars";
import Avatar from "./RoomAvatar";
import RoomEditor from "./RoomEditor";
import AdminSignIn from "./AdminSignIn";
import useAdmin from "../hooks/useAdmin";

/**
 * "Who's Watching?" screen: always shows every room the server returns.
 * "Manage Rooms" asks for the admin password, then switches to edit mode, where
 * rooms can be added, edited and deleted. It is also the only place where the
 * admin password is set the first time. Leaving it signs the admin out.
 */
export default function RoomSelect({ onSelect, notice }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState("");
  const [managing, setManaging] = useState(false);
  // { mode: "create" | "edit", room? } while the editor is open.
  const [editor, setEditor] = useState(null);
  const [info, setInfo] = useState("");
  const admin = useAdmin(managing);
  // Edit mode only once the server confirmed the admin sign-in.
  const editing = managing && admin.signedIn;

  const load = useCallback(async () => {
    try {
      setRooms(await listRooms());
      setError("");
    } catch {
      setError("Could not load the rooms. Check your connection and refresh.");
    }
  }, []);

  // Refresh every 20s while the screen is visible, so connected counts stay current.
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(timer);
  }, [load]);

  function pick(room) {
    setInfo("");
    if (editing) return setEditor({ mode: "edit", room });
    if (!room.hasPin) return setInfo(`${room.name} isn't set up yet. The admin sets its PIN in Manage Rooms.`);
    onSelect(room);
  }

  function onDone(message) {
    setEditor(null);
    setInfo(message);
    load();
  }

  function stopManaging() {
    setInfo("");
    setManaging(false);
    // This screen is often on a shared device: never leave the admin signed in.
    if (admin.signedIn) admin.signOut();
  }

  const showSignIn = managing && admin.status && !admin.signedIn;

  const canAdd = rooms && rooms.length < MAX_ROOMS;

  return (
    <main className="room-screen">
      <header className="room-brand">
        <AppLogo size={48} />
        <span>YT Queue</span>
      </header>
      <h1 className="room-heading">{managing ? "Manage Rooms" : "Who's Watching?"}</h1>
      {notice && !managing && <p className="room-notice" role="alert">{notice}</p>}
      {info && <p className="room-info" role="status">{info}</p>}
      {error && <p className="room-notice" role="alert">{error}</p>}
      {!rooms && !error && <p className="room-muted">Loading rooms…</p>}
      {managing && admin.error && <p className="room-notice" role="alert">{admin.error}</p>}
      {managing && !admin.status && !admin.error && <p className="room-muted">Checking admin sign-in…</p>}
      {showSignIn && (
        <div className="admin-panel">
          <AdminSignIn
            mode={admin.status.configured ? "login" : "setup"}
            usesFlagsPassword={admin.status.usesFlagsPassword}
            purpose="Only the admin can add, edit or delete rooms."
            onDone={admin.refresh}
            onStale={admin.refresh}
            onCancel={stopManaging}
          />
        </div>
      )}
      {(!managing || editing) && (
      <div className={`room-grid${editing ? " managing" : ""}`}>
        {rooms?.map((room, index) => (
          <button
            key={room.id}
            type="button"
            className="room-card"
            style={{ animationDelay: `${index * 60}ms` }}
            onClick={() => pick(room)}
            aria-label={editing ? `Edit ${room.name}` : room.name}
          >
            <span className="room-avatar-wrap">
              <Avatar avatar={room.avatar} />
              {editing && (
                <span className="room-edit-overlay" aria-hidden="true">
                  <FaPencilAlt />
                </span>
              )}
              {!room.hasPin && (
                <span className="room-badge" title="No PIN set yet">
                  <FaLock aria-hidden="true" /> Not set up
                </span>
              )}
            </span>
            <span className="room-name">{room.name}</span>
            {room.description && <span className="room-desc">{room.description}</span>}
            {!managing && room.online > 0 && (
              <span className="room-online">
                <span className="room-online-dot" aria-hidden="true" />
                {room.online} {room.online === 1 ? "device" : "devices"} connected
              </span>
            )}
          </button>
        ))}
        {editing && canAdd && (
          <button type="button" className="room-card" onClick={() => setEditor({ mode: "create" })}>
            <span className="room-avatar room-add" aria-hidden="true">
              <FaPlus />
            </span>
            <span className="room-name">Add Room</span>
          </button>
        )}
      </div>
      )}
      {editing && (
        <p className="room-muted small mt-3 mb-0 text-center">
          Signed in as admin. Done signs you out. Change the admin password in a room&apos;s Settings.
        </p>
      )}
      {rooms && !showSignIn && (
        <button
          type="button"
          className={`btn room-manage-btn ${managing ? "btn-light" : "btn-outline-secondary"}`}
          onClick={() => {
            if (managing) return stopManaging();
            setInfo("");
            setManaging(true);
          }}
        >
          {managing ? "Done" : "Manage Rooms"}
        </button>
      )}
      {editor && (
        <RoomEditor
          mode={editor.mode}
          room={editor.room}
          onClose={() => setEditor(null)}
          onDone={onDone}
          onAdminRequired={() => {
            setEditor(null);
            setInfo("Your admin sign-in expired. Sign in again.");
            admin.refresh();
          }}
          onMissing={() => {
            setEditor(null);
            setInfo("That room no longer exists.");
            load();
          }}
        />
      )}
    </main>
  );
}
