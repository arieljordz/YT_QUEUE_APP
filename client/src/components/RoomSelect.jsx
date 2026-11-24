import { useEffect, useState } from "react";
import { FaYoutube, FaUserCircle, FaUserAstronaut, FaUserNinja, FaUserSecret, FaUserTie } from "react-icons/fa";
import { listRooms } from "../api/rooms";

const AVATARS = {
  "avatar-1": { Icon: FaUserCircle, color: "#e50914" },
  "avatar-2": { Icon: FaUserAstronaut, color: "#2d8cff" },
  "avatar-3": { Icon: FaUserNinja, color: "#f5a623" },
  "avatar-4": { Icon: FaUserSecret, color: "#2ecc71" },
  "avatar-5": { Icon: FaUserTie, color: "#b45cff" },
};

export function Avatar({ avatar, size = 72 }) {
  const { Icon, color } = AVATARS[avatar] ?? AVATARS["avatar-1"];
  return (
    <span className="room-avatar" style={{ background: color }}>
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}

/** "Who's Watching?" screen: always shows every room the server returns. */
export default function RoomSelect({ onSelect, notice }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listRooms()
      .then((list) => alive && setRooms(list))
      .catch(() => alive && setError("Could not load the rooms. Check your connection and refresh."));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="room-screen">
      <header className="room-brand">
        <FaYoutube size={36} color="#e50914" aria-hidden="true" />
        <span>YT Queue</span>
      </header>
      <h1 className="room-heading">Who&apos;s Watching?</h1>
      {notice && <p className="room-notice" role="alert">{notice}</p>}
      {error && <p className="room-notice" role="alert">{error}</p>}
      {!rooms && !error && <p className="room-muted">Loading rooms…</p>}
      <div className="room-grid">
        {rooms?.map((room) => (
          <button key={room.id} type="button" className="room-card" onClick={() => onSelect(room)}>
            <Avatar avatar={room.avatar} />
            <span className="room-name">{room.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
