import { useState, useEffect, useRef, useCallback } from "react";
import useLocalStorage from "./useLocalStorage";
import { mergeLibrary } from "../lib/library";

const SYNC_DELAY_MS = 2000;

/**
 * The library is every video the user has ever added to the queue. It is kept
 * in localStorage and, when a sync code is set, merged with a copy stored on
 * the server (/api/library) so every device ends up with the same list.
 *
 * Merging is a union, so videos are never lost. Only "clear everything" is
 * supported; it empties the server copy first, because a merge would otherwise
 * bring the videos straight back. Other devices that still hold their own copy
 * will upload it again the next time they sync.
 */
export default function useLibrary() {
  const [library, setLibrary] = useLocalStorage("videoLibrary", []);
  const [syncCode, setSyncCodeRaw] = useLocalStorage("syncCode", "");
  // The deletion epoch this device last saw (null = never synced with epochs).
  const [epoch, setEpoch] = useLocalStorage("libraryEpoch", null);
  const epochRef = useRef(epoch);
  epochRef.current = epoch;

  // A device that enters a sync code adds its own videos to the shared library.
  const setSyncCode = useCallback(
    (code) => {
      setEpoch(code ? "join" : null);
      setSyncCodeRaw(code);
    },
    [setEpoch, setSyncCodeRaw]
  );
  // "off" | "syncing" | "synced" | "unavailable" | "error"
  const [status, setStatus] = useState("off");
  const syncedCountRef = useRef(-1);
  const libraryRef = useRef(library);
  libraryRef.current = library;

  const addToLibrary = useCallback(
    (videos) => setLibrary((prev) => mergeLibrary(prev, videos)),
    [setLibrary]
  );

  const sync = useCallback(
    async (signal) => {
      setStatus("syncing");
      try {
        const response = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-sync-code": syncCode },
          body: JSON.stringify({ library: libraryRef.current, epoch: epochRef.current }),
          signal,
        });
        const isJson = response.headers.get("content-type")?.includes("application/json");
        // Local dev (plain vite) has no /api route and answers with HTML or 404.
        if (!isJson || response.status === 404) return setStatus("unavailable");
        if (!response.ok) return setStatus("error");

        const { library: remote, epoch: serverEpoch, reset } = await response.json();
        if (Number.isInteger(serverEpoch)) setEpoch(serverEpoch);
        // Deleted on another device since this one last synced: take the server's copy.
        const merged = reset ? remote : mergeLibrary(libraryRef.current, remote);
        syncedCountRef.current = merged.length;
        setLibrary(merged);
        setStatus("synced");
      } catch (err) {
        if (err.name !== "AbortError") setStatus("error");
      }
    },
    [syncCode, setLibrary, setEpoch]
  );

  // Sync when a code is set, and shortly after the library changes.
  useEffect(() => {
    if (!syncCode) {
      setStatus("off");
      syncedCountRef.current = -1;
      return;
    }
    if (library.length === syncedCountRef.current) return;

    const controller = new AbortController();
    const timer = setTimeout(
      () => sync(controller.signal),
      syncedCountRef.current === -1 ? 0 : SYNC_DELAY_MS
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [syncCode, library.length, sync]);

  // Deletes the whole library. Resolves to true on success; with sync on, a
  // failed server call leaves the library untouched and resolves to false.
  const clearLibrary = useCallback(async () => {
    if (syncCode) {
      try {
        const response = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-sync-code": syncCode },
          body: JSON.stringify({ clear: true }),
        });
        if (!response.ok) return false;
        const { epoch: newEpoch } = await response.json();
        if (Number.isInteger(newEpoch)) setEpoch(newEpoch);
      } catch {
        return false;
      }
    }
    // Mark the empty list as already synced so it is not merged with the server.
    syncedCountRef.current = 0;
    setLibrary([]);
    return true;
  }, [syncCode, setLibrary, setEpoch]);

  const retrySync = useCallback(() => {
    syncedCountRef.current = -1;
    sync();
  }, [sync]);

  return { library, addToLibrary, syncCode, setSyncCode, status, retrySync, clearLibrary };
}
