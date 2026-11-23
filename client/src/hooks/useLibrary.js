import { useState, useEffect, useRef, useCallback } from "react";
import useLocalStorage from "./useLocalStorage";
import { mergeLibrary } from "../lib/library";
import { clearRoomData } from "../lib/roomData";

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
  // The room this device's data belongs to. It outlives "Turn off sync", so a
  // different code can be recognised as a different room.
  const [lastSyncCode, setLastSyncCode] = useLocalStorage("lastSyncCode", "");
  const lastSyncCodeRef = useRef(lastSyncCode);
  lastSyncCodeRef.current = lastSyncCode;
  const syncCodeRef = useRef(syncCode);
  syncCodeRef.current = syncCode;
  // Devices that were already syncing before this was added: remember their room.
  useEffect(() => {
    if (syncCode && !lastSyncCode) setLastSyncCode(syncCode);
  }, [syncCode, lastSyncCode, setLastSyncCode]);
  // The deletion epoch this device last saw (null = never synced with epochs).
  const [epoch, setEpoch] = useLocalStorage("libraryEpoch", null);
  const epochRef = useRef(epoch);
  epochRef.current = epoch;
  // Number of single-video removals this device has seen, and removals not yet
  // reported to the server.
  const [removalSeq, setRemovalSeq] = useLocalStorage("libraryRemovalSeq", 0);
  const [pendingRemovals, setPendingRemovals] = useLocalStorage("libraryRemovals", []);
  const removalSeqRef = useRef(removalSeq);
  removalSeqRef.current = removalSeq;
  const pendingRef = useRef(pendingRemovals);
  pendingRef.current = pendingRemovals;

  // A device that enters the code of the room it already belongs to (or its first
  // code) adds its own videos to the shared library. Entering a different room's
  // code first empties this device's data, so one room's library, queue and
  // flags are never copied into another.
  const setSyncCode = useCallback(
    (code) => {
      if (code) {
        const previous = lastSyncCodeRef.current;
        if (previous && previous !== code) clearRoomData();
        setLastSyncCode(code);
      } else if (syncCodeRef.current) {
        setLastSyncCode(syncCodeRef.current);
      }
      setEpoch(code ? "join" : null);
      setRemovalSeq(0);
      setPendingRemovals([]);
      setSyncCodeRaw(code);
    },
    [setEpoch, setRemovalSeq, setPendingRemovals, setSyncCodeRaw, setLastSyncCode]
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

  // Takes one video out of the library on this device and, with sync on, on all.
  const removeFromLibrary = useCallback(
    (videoId) => {
      setLibrary((prev) => prev.filter((v) => v.id.videoId !== videoId));
      if (syncCode) setPendingRemovals((prev) => (prev.includes(videoId) ? prev : [...prev, videoId]));
    },
    [syncCode, setLibrary, setPendingRemovals]
  );

  const sync = useCallback(
    async (signal) => {
      setStatus("syncing");
      const sentLibrary = libraryRef.current;
      const sentRemovals = pendingRef.current;
      try {
        const response = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-sync-code": syncCode },
          body: JSON.stringify({
            library: sentLibrary,
            epoch: epochRef.current,
            removalSeq: removalSeqRef.current,
            removed: sentRemovals,
          }),
          signal,
        });
        const isJson = response.headers.get("content-type")?.includes("application/json");
        // Local dev (plain vite) has no /api route and answers with HTML or 404.
        if (!isJson || response.status === 404) return setStatus("unavailable");
        if (!response.ok) return setStatus("error");

        const { library: remote, epoch: serverEpoch, removalSeq: serverSeq, reset } =
          await response.json();
        if (Number.isInteger(serverEpoch)) setEpoch(serverEpoch);
        if (Number.isInteger(serverSeq)) setRemovalSeq(serverSeq);

        // The server's copy is the truth (it already has the removals applied).
        // Changes made on this device while the request was running are kept.
        const sentIds = new Set(sentLibrary.map((v) => v.id.videoId));
        const added = libraryRef.current.filter((v) => !sentIds.has(v.id.videoId));
        const sentGone = new Set(sentRemovals);
        const stillPending = pendingRef.current.filter((id) => !sentGone.has(id));
        setPendingRemovals(stillPending);
        const hidden = new Set(stillPending);
        const merged = mergeLibrary(
          remote.filter((v) => !hidden.has(v.id.videoId)),
          reset ? [] : added
        );
        syncedCountRef.current = merged.length;
        setLibrary(merged);
        setStatus("synced");
      } catch (err) {
        if (err.name !== "AbortError") setStatus("error");
      }
    },
    [syncCode, setLibrary, setEpoch, setRemovalSeq, setPendingRemovals]
  );

  // Sync when a code is set, and shortly after the library changes.
  useEffect(() => {
    if (!syncCode) {
      setStatus("off");
      syncedCountRef.current = -1;
      return;
    }
    if (library.length === syncedCountRef.current && pendingRemovals.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(
      () => sync(controller.signal),
      syncedCountRef.current === -1 ? 0 : SYNC_DELAY_MS
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [syncCode, library.length, pendingRemovals.length, sync]);

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
        setPendingRemovals([]);
      } catch {
        return false;
      }
    }
    // Mark the empty list as already synced so it is not merged with the server.
    syncedCountRef.current = 0;
    setLibrary([]);
    return true;
  }, [syncCode, setLibrary, setEpoch, setPendingRemovals]);

  const retrySync = useCallback(() => {
    syncedCountRef.current = -1;
    sync();
  }, [sync]);

  return {
    library,
    addToLibrary,
    syncCode,
    lastSyncCode,
    setSyncCode,
    status,
    retrySync,
    clearLibrary,
    removeFromLibrary,
  };
}
