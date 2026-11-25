import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import useLocalStorage from "./useLocalStorage";
import { mergeLibrary, slimVideo } from "../lib/library";
import { clearRoomData } from "../lib/roomData";

const SYNC_DELAY_MS = 2000;
// While the tab is visible, other devices' changes are picked up this often.
const POLL_MS = 60 * 1000;
// The server takes at most this many adds and removals per request; the rest
// follow in the next requests of the same sync.
const PER_REQUEST = 500;
const MAX_ROUNDS = 200;

/**
 * Applies the server's changes to a library: removals drop the video, videos
 * are added (or replaced in place). `hidden` are videos removed on this device
 * that the server has not heard about yet.
 */
function applyChanges(library, changes, hidden) {
  if (changes.length === 0) return library;
  const byId = new Map(library.map((v) => [v.id.videoId, v]));
  for (const change of changes) {
    if (change.removed) {
      byId.delete(change.id);
    } else {
      const video = slimVideo(change.video);
      if (video && !hidden.has(video.id.videoId)) byId.set(video.id.videoId, video);
    }
  }
  return [...byId.values()];
}

/**
 * The library is every video the user has ever added to the queue. It is kept
 * in localStorage and, in a room, synced with the room's copy on the server
 * (/api/library) so every device ends up with the same list.
 *
 * Only changes travel: this device sends the videos the server does not have
 * yet (`librarySyncedIds` = what the server is known to have) and its removals,
 * and gets back what changed since its last sync (`librarySince`), a page at a
 * time. A device that never synced downloads the whole library in pages.
 *
 * Merging is a union, so videos are never lost. "Delete all" empties the server
 * copy first and bumps the room's epoch, which makes every other device drop
 * its copy and download the (now empty) library again.
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
  // The last change this device has (null = never synced in this format).
  const [since, setSince] = useLocalStorage("librarySince", null);
  // Videos the server is known to have; the rest of the library is still to send.
  const [syncedIds, setSyncedIds] = useLocalStorage("librarySyncedIds", []);
  // Videos removed on this device that the server has not heard about yet.
  const [pendingRemovals, setPendingRemovals] = useLocalStorage("libraryRemovals", []);

  const libraryRef = useRef(library);
  libraryRef.current = library;
  const epochRef = useRef(epoch);
  epochRef.current = epoch;
  const sinceRef = useRef(since);
  sinceRef.current = since;
  const knownRef = useRef(null);
  const known = useMemo(() => new Set(syncedIds), [syncedIds]);
  knownRef.current = known;
  const pendingRef = useRef(pendingRemovals);
  pendingRef.current = pendingRemovals;

  const unsentCount = useMemo(
    () => library.reduce((n, v) => (known.has(v.id.videoId) ? n : n + 1), 0),
    [library, known]
  );

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
      setSince(null);
      setSyncedIds([]);
      setPendingRemovals([]);
      setSyncCodeRaw(code);
    },
    [setEpoch, setSince, setSyncedIds, setPendingRemovals, setSyncCodeRaw, setLastSyncCode]
  );
  // "off" | "syncing" | "synced" | "unavailable" | "error"
  const [status, setStatus] = useState("off");
  // True while the whole library is downloading, page by page (first sync, or
  // after Delete all on another device), for the library's loading spinner.
  const [downloading, setDownloading] = useState(false);

  // Videos saved before titles were decoded still show "&#39;" and the like:
  // clean them once on this device.
  useEffect(() => {
    const hasEntity = library.some((v) =>
      /&(#x[\da-f]+|#\d+|[a-z]+);/i.test(`${v.snippet?.title} ${v.snippet?.channelTitle}`)
    );
    if (!hasEntity) return;
    setLibrary((prev) => {
      const cleaned = mergeLibrary(prev, []);
      // An entity this decoder does not know stays as it is: do not loop on it.
      return JSON.stringify(cleaned) === JSON.stringify(prev) ? prev : cleaned;
    });
  }, [library, setLibrary]);

  const addToLibrary = useCallback(
    (videos) => setLibrary((prev) => mergeLibrary(prev, videos)),
    [setLibrary]
  );

  // Takes one video out of the library on this device and, in a room, on all.
  const removeFromLibrary = useCallback(
    (videoId) => {
      setLibrary((prev) => prev.filter((v) => v.id.videoId !== videoId));
      if (syncCode) setPendingRemovals((prev) => (prev.includes(videoId) ? prev : [...prev, videoId]));
    },
    [syncCode, setLibrary, setPendingRemovals]
  );

  // Removes several videos at once (Delete all with a search: the matches).
  const removeManyFromLibrary = useCallback(
    (videoIds) => {
      const gone = new Set(videoIds);
      if (gone.size === 0) return;
      setLibrary((prev) => prev.filter((v) => !gone.has(v.id.videoId)));
      if (syncCode) {
        setPendingRemovals((prev) => [...prev, ...[...gone].filter((id) => !prev.includes(id))]);
      }
    },
    [syncCode, setLibrary, setPendingRemovals]
  );

  // One request: send up to PER_REQUEST adds and removals, apply one page of
  // changes. Returns true when there is more to send or to download.
  const syncOnce = useCallback(
    async (signal) => {
      const knownNow = knownRef.current;
      const added = libraryRef.current.filter((v) => !knownNow.has(v.id.videoId)).slice(0, PER_REQUEST);
      const removed = pendingRef.current.slice(0, PER_REQUEST);
      const response = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v: 2, epoch: epochRef.current, since: sinceRef.current ?? 0, added, removed }),
        signal,
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      // Local dev (plain vite) has no /api route and answers with HTML or 404.
      if (!isJson || response.status === 404) throw new Error("unavailable");
      if (!response.ok) throw new Error("error");
      const data = await response.json();
      // The server only moved the room's old library this time: send it all again.
      if (data.retry) return true;
      // A reset means the whole library comes again, page by page.
      if (data.reset && data.more) setDownloading(true);

      // Removals sent are now the server's business; ones made meanwhile stay pending.
      const sentGone = new Set(removed);
      const stillPending = data.reset ? [] : pendingRef.current.filter((id) => !sentGone.has(id));
      const hidden = new Set(stillPending);

      // What the server now has: what it had, what was just sent, and the page's changes.
      const nextKnown = new Set(data.reset ? [] : knownRef.current);
      if (!data.reset) for (const v of added) nextKnown.add(v.id.videoId);
      for (const change of data.changes) {
        if (change.removed) nextKnown.delete(change.id);
        else if (change.video?.id?.videoId) nextKnown.add(change.video.id.videoId);
      }

      // A reset (the library was deleted elsewhere) drops this device's copy.
      const update = (prev) => applyChanges(data.reset ? [] : prev, data.changes, hidden);
      libraryRef.current = update(libraryRef.current);
      if (data.reset || data.changes.length > 0) setLibrary(update);

      knownRef.current = nextKnown;
      setSyncedIds([...nextKnown]);
      pendingRef.current = stillPending;
      setPendingRemovals(stillPending);
      epochRef.current = data.epoch;
      setEpoch(data.epoch);
      sinceRef.current = data.since;
      setSince(data.since);

      const unsent = libraryRef.current.some((v) => !nextKnown.has(v.id.videoId));
      return Boolean(data.more) || unsent || stillPending.length > 0;
    },
    [setLibrary, setSyncedIds, setPendingRemovals, setEpoch, setSince]
  );

  // Runs requests until everything is sent and downloaded. Only one sync runs at
  // a time; a sync asked for meanwhile runs right after.
  const runningRef = useRef(false);
  const againRef = useRef(false);
  const sync = useCallback(async () => {
    if (runningRef.current) {
      againRef.current = true;
      return;
    }
    runningRef.current = true;
    setStatus("syncing");
    // Never synced: the whole library is about to come.
    if (!sinceRef.current) setDownloading(true);
    try {
      let rounds = 0;
      let more = true;
      while ((more || againRef.current) && rounds < MAX_ROUNDS && syncCodeRef.current) {
        againRef.current = false;
        more = await syncOnce();
        rounds += 1;
      }
      setStatus("synced");
    } catch (err) {
      setStatus(err.message === "unavailable" ? "unavailable" : "error");
    } finally {
      runningRef.current = false;
      // Done, or stopped early (error, room left): no spinner left hanging. The
      // next sync carries on from the last page received.
      setDownloading(false);
    }
  }, [syncOnce]);

  // Sync on entering a room, and every minute while the tab is visible.
  useEffect(() => {
    if (!syncCode) {
      setStatus("off");
      return;
    }
    sync();
    const timer = setInterval(() => {
      if (!document.hidden) sync();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncCode, sync]);

  // Send local changes shortly after they happen.
  useEffect(() => {
    if (!syncCode || (unsentCount === 0 && pendingRemovals.length === 0)) return;
    const timer = setTimeout(sync, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [syncCode, unsentCount, pendingRemovals.length, sync]);

  // Deletes the whole library. Resolves to true on success; in a room, a
  // failed server call leaves the library untouched and resolves to false.
  const clearLibrary = useCallback(async () => {
    if (syncCode) {
      try {
        const response = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ v: 2, clear: true }),
        });
        if (!response.ok) return false;
        const { epoch: newEpoch } = await response.json();
        if (Number.isInteger(newEpoch)) {
          epochRef.current = newEpoch;
          setEpoch(newEpoch);
        }
        pendingRef.current = [];
        setPendingRemovals([]);
        knownRef.current = new Set();
        setSyncedIds([]);
      } catch {
        return false;
      }
    }
    libraryRef.current = [];
    setLibrary([]);
    return true;
  }, [syncCode, setLibrary, setEpoch, setPendingRemovals, setSyncedIds]);

  const retrySync = useCallback(() => sync(), [sync]);

  return {
    library,
    addToLibrary,
    syncCode,
    lastSyncCode,
    setSyncCode,
    status,
    downloading,
    retrySync,
    clearLibrary,
    removeFromLibrary,
    removeManyFromLibrary,
  };
}
