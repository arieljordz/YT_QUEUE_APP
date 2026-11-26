import { useEffect, useState } from "react";
import PlayerPage from "./PlayerPage";
import PlayerNotice from "./PlayerNotice";

// The room this player tab belongs to, per tab (sessionStorage).
const PIN_KEY = "playerRoom";
const readPinned = () => {
  try {
    return JSON.parse(sessionStorage.getItem(PIN_KEY)) ?? null;
  } catch {
    return null;
  }
};
const writePinned = (room) => {
  try {
    sessionStorage.setItem(PIN_KEY, JSON.stringify(room));
  } catch {
    // storage blocked: the pin just won't survive a reload
  }
};

const goChooseRoom = () => window.location.assign("/");

/**
 * The player stays with the room it was opened for. If this browser leaves
 * the room or switches to another one, playback stops instead of quietly
 * playing the other room's queue.
 */
export default function PlayerGate({ roomId, roomName, onSignedOut }) {
  const [pinned, setPinned] = useState(() => readPinned() ?? (roomId ? { id: roomId, name: roomName } : null));

  // Learn the room's name once it is known.
  if (pinned && pinned.id === roomId && roomName && pinned.name !== roomName) {
    setPinned({ id: roomId, name: roomName });
  }
  useEffect(() => {
    if (pinned) writePinned(pinned);
  }, [pinned]);

  if (!roomId) {
    return (
      <PlayerNotice title="Player stopped" action="Choose a room" onAction={goChooseRoom}>
        This browser left {pinned?.name || "the room"}, so this player stopped.
      </PlayerNotice>
    );
  }
  if (pinned && pinned.id !== roomId) {
    return (
      <PlayerNotice
        title={`This player was for ${pinned.name || "another room"}`}
        action={roomName ? `Play ${roomName} here` : "Play this room here"}
        onAction={() => setPinned({ id: roomId, name: roomName })}
      >
        This browser switched to {roomName || "another room"}, so playback stopped.
      </PlayerNotice>
    );
  }
  return <PlayerPage key={roomId} roomName={roomName} onSignedOut={onSignedOut} />;
}
