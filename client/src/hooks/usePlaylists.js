import { useCallback, useEffect, useRef } from "react";
import useLocalStorage from "./useLocalStorage";
import useFeatureFlags from "./useFeatureFlags";
import { postPlaylists } from "../api/playlists";
import { notify } from "../lib/notify";

const REFRESH_MS = 30000;

/**
 * Personal playlists: [{ id, name, description, videoIds, createdAt, updatedAt }],
 * newest change first. A playlist holds only the ids of Library videos, in
 * playback order, never copies of the videos.
 *
 * Kept in this browser and, in a room, on the server (/api/playlists) so every
 * device in the room has the same playlists. Changes show here at once and the
 * server's answer (the room's whole list) then replaces the local copy.
 */

const newPlaylistId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const byUpdated = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt));

/** Mount once, high in the tree: pulls the room's playlists now and then. */
export function usePlaylistsSync() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [, setPlaylists] = useLocalStorage("playlists", []);
  const { flags } = useFeatureFlags();
  const enabled = flags.personalPlaylists;

  useEffect(() => {
    if (!syncCode || !enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await postPlaylists({});
        if (!cancelled) setPlaylists(data.playlists);
      } catch {
        // Offline, not deployed, or the flag was just switched off: keep what this device has.
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [syncCode, enabled, setPlaylists]);
}

export default function usePlaylists() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [playlists, setPlaylists] = useLocalStorage("playlists", []);
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;

  /** Applies `change` here, then sends `body` to the room. Resolves to true when saved. */
  const commit = useCallback(
    async (change, body) => {
      const before = playlistsRef.current;
      setPlaylists((prev) => change(prev).sort(byUpdated));
      if (!syncCode) return true;
      try {
        const data = await postPlaylists(body);
        setPlaylists(data.playlists);
        return true;
      } catch (err) {
        // Not deployed (plain vite): the change stays in this browser only.
        if (err.code === "unavailable") return true;
        setPlaylists(before);
        notify.playlists.saveFailed(err);
        return false;
      }
    },
    [syncCode, setPlaylists]
  );

  /** Resolves to the new playlist's id, or null when it could not be saved. */
  const createPlaylist = useCallback(
    async ({ name, description = "", videoIds = [] }) => {
      const now = new Date().toISOString();
      const playlist = {
        id: newPlaylistId(),
        name: name.trim(),
        description: description.trim(),
        videoIds: [...new Set(videoIds)],
        createdAt: now,
        updatedAt: now,
      };
      const ok = await commit((prev) => [playlist, ...prev], {
        create: { id: playlist.id, name: playlist.name, description: playlist.description, videoIds: playlist.videoIds },
      });
      return ok ? playlist.id : null;
    },
    [commit]
  );

  /** changes: any of { name, description, videoIds }. */
  const updatePlaylist = useCallback(
    (id, changes) => {
      const fields = { ...changes };
      if (fields.name !== undefined) fields.name = fields.name.trim();
      if (fields.description !== undefined) fields.description = fields.description.trim();
      if (fields.videoIds !== undefined) fields.videoIds = [...new Set(fields.videoIds)];
      const updatedAt = new Date().toISOString();
      return commit(
        (prev) => prev.map((p) => (p.id === id ? { ...p, ...fields, updatedAt } : p)),
        { update: { id, ...fields } }
      );
    },
    [commit]
  );

  const deletePlaylist = useCallback(
    (id) => commit((prev) => prev.filter((p) => p.id !== id), { delete: { id } }),
    [commit]
  );

  return { playlists, createPlaylist, updatePlaylist, deletePlaylist };
}
