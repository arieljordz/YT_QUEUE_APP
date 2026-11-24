import { useCallback, useEffect, useState } from "react";
import { FaLock, FaPencilAlt, FaPlus, FaYoutube } from "react-icons/fa";
import { listRooms } from "../api/rooms";
import { MAX_ROOMS } from "../lib/avatars";
import Avatar from "./RoomAvatar";
import RoomEditor from "./RoomEditor";

/**
 * "Who's Watching?" screen: always shows every room the server returns.
 * "Manage Rooms" switches to edit mode, where rooms can be added, edited and deleted.
 */
export default function RoomSelect({ onSelect, onEntered, notice }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState("");
  const [managing, setManaging] = useState(false);
  // { mode: "create" | "edit" | "claim", room? } while the editor is open.
  const [editor, setEditor] = useState(null);
  const [info, setInfo] = useState("");

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
    if (managing) return setEditor({ mode: "edit", room });
    // A room nobody has set up yet: set its PIN first, then enter.
    if (!room.hasPin && room.claimable) return setEditor({ mode: "claim", room });
    onSelect(room);
  }

  function onDone(result) {
    setEditor(null);
    if (result.entered) return onEntered(result.room);
    if (result.message) setInfo(result.message);
    load();
  }

  const canAdd = rooms && rooms.length < MAX_ROOMS;

  return (
    <main className="room-screen">
      <header className="room-brand">
        <FaYoutube size={36} color="#e50914" aria-hidden="true" />
        <span>YT Queue</span>
      </header>
      <h1 className="room-heading">{managing ? "Manage Rooms" : "Who's Watching?"}</h1>
      {notice && !managing && <p className="room-notice" role="alert">{notice}</p>}
      {info && <p className="room-info" role="status">{info}</p>}
      {error && <p className="room-notice" role="alert">{error}</p>}
      {!rooms && !error && <p className="room-muted">Loading rooms…</p>}
      <div className={`room-grid${managing ? " managing" : ""}`}>
        {rooms?.map((room, index) => (
          <button
            key={room.id}
            type="button"
            className="room-card"
            style={{ animationDelay: `${index * 60}ms` }}
            onClick={() => pick(room)}
            aria-label={managing ? `Edit ${room.name}` : room.name}
          >
            <span className="room-avatar-wrap">
              <Avatar avatar={room.avatar} />
              {managing && (
                <span className="room-edit-overlay" aria-hidden="true">
                  <FaPencilAlt />
                </span>
              )}
              {!managing && !room.hasPin && (
                <span className="room-badge" title="No PIN set yet">
                  <FaLock aria-hidden="true" /> Set up
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
        {managing && canAdd && (
          <button type="button" className="room-card" onClick={() => setEditor({ mode: "create" })}>
            <span className="room-avatar room-add" aria-hidden="true">
              <FaPlus />
            </span>
            <span className="room-name">Add Room</span>
          </button>
        )}
      </div>
      {rooms && (
        <button
          type="button"
          className={`btn room-manage-btn ${managing ? "btn-light" : "btn-outline-secondary"}`}
          onClick={() => {
            setInfo("");
            setManaging((m) => !m);
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
