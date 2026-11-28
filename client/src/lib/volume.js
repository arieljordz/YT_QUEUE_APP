// The player's volume, shared like pause and repeat: kept in localStorage (so
// the queue panel and the player tab agree) and synced to the room's devices.
export const VOLUME_KEY = "volume"; // 0-100
export const MUTED_KEY = "isMuted";
export const DEFAULT_VOLUME = 100;

export const isVolume = (v) => Number.isInteger(v) && v >= 0 && v <= 100;

/** A slider or stored value as a whole number from 0 to 100. */
export function clampVolume(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_VOLUME;
}
