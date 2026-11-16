import { useState, useEffect, useRef, useCallback } from "react";
import useLocalStorage from "./useLocalStorage";
import { mergeLibrary } from "../lib/library";

const SYNC_DELAY_MS = 2000;

/**
 * The library is every video the user has ever added to the queue. It is kept
 * in localStorage and, when a sync code is set, merged with a copy stored on
 * the server (/api/library) so every device ends up with the same list.
 *
 * Merging is a union, so videos are never lost, but removing one from the
 * library is not supported (it would come back from another device).
 */
export default function useLibrary() {
  const [library, setLibrary] = useLocalStorage("videoLibrary", []);
  const [syncCode, setSyncCode] = useLocalStorage("syncCode", "");
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
          body: JSON.stringify({ library: libraryRef.current }),
          signal,
        });
        const isJson = response.headers.get("content-type")?.includes("application/json");
        // Local dev (plain vite) has no /api route and answers with HTML or 404.
        if (!isJson || response.status === 404) return setStatus("unavailable");
        if (!response.ok) return setStatus("error");

        const { library: remote } = await response.json();
        const merged = mergeLibrary(libraryRef.current, remote);
        syncedCountRef.current = merged.length;
        setLibrary(merged);
        setStatus("synced");
      } catch (err) {
        if (err.name !== "AbortError") setStatus("error");
      }
    },
    [syncCode, setLibrary]
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

  const retrySync = useCallback(() => {
    syncedCountRef.current = -1;
    sync();
  }, [sync]);

  return { library, addToLibrary, syncCode, setSyncCode, status, retrySync };
}
