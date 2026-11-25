// Where the player is in the current video, shared with the Queue tab's
// "Now playing" card (other tabs through localStorage, other devices through
// /api/queue). The player only reports when something changes (new video,
// play/pause, a seek, a stall); in between, the card counts the seconds itself.
//
// A snapshot: { id, queueId, position, duration, playing, at }
//   position - seconds into the video at the moment `at` (this device's clock, ms)

export const PROGRESS_KEY = "playerProgress";

/** Seconds into the video now, or null when the snapshot is not for this queue entry. */
export function positionNow(snapshot, queueId, isPaused, now = Date.now()) {
  if (!snapshot || !queueId || snapshot.queueId !== queueId) return null;
  if (!(snapshot.duration > 0)) return null; // live streams and unknown lengths
  const running = snapshot.playing && !isPaused;
  const position = snapshot.position + (running ? (now - snapshot.at) / 1000 : 0);
  return Math.min(Math.max(position, 0), snapshot.duration);
}

/** 0 -> "0:00", 83 -> "1:23", 3725 -> "1:02:05". */
export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * True when a fresh reading from the player says something the last snapshot
 * would not have predicted: another video, play/pause, a new length, or a jump
 * of more than 2 seconds (a seek or a stall).
 */
export function needsNewSnapshot(last, reading, now = Date.now()) {
  if (!last) return true;
  if (last.queueId !== reading.queueId || last.playing !== reading.playing) return true;
  if (Math.abs(last.duration - reading.duration) > 1) return true;
  const expected = last.position + (last.playing ? (now - last.at) / 1000 : 0);
  return Math.abs(expected - reading.position) > 2;
}

export function makeSnapshot(reading, now = Date.now()) {
  return { id: newId(), ...reading, at: now };
}
