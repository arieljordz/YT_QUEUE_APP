import { LOCAL_CHANGE_EVENT } from "../hooks/useLocalStorage";

// Everything this browser keeps that belongs to one sync room (one shared
// library, queue and set of flags). Settings like the theme are not included.
const ROOM_DATA = {
  videoLibrary: [],
  videoQueue: [],
  playedVideos: [],
  isPaused: false,
  featureFlags: {},
  favoriteIds: [],
  recentlyPlayed: [],
};

/**
 * Empties this device's copy of a room's data, so it cannot leak into another
 * room. Components that show the data are told through the same-tab event.
 */
export function clearRoomData() {
  for (const [key, empty] of Object.entries(ROOM_DATA)) {
    localStorage.setItem(key, JSON.stringify(empty));
    window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, { detail: key }));
  }
}
