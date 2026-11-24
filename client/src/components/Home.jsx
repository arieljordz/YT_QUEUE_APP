import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import SearchBar from "./SearchBar";
import { FaSearch } from "react-icons/fa";
import AppTabs from "./AppTabs";
import useOnlineStatus from "../hooks/useOnlineStatus";
import { useEmbeddableCache } from "../hooks/useEmbeddable";
import { TAB_ICONS } from "../lib/tabIcons";
import VideoList from "./VideoList";
import Queue from "./Queue";
import Library from "./Library";
import useLocalStorage from "../hooks/useLocalStorage";
import { searchVideos, getVideoDetails, QuotaError } from "../api/youtube";
import { saveSearchedVideo } from "../api/catalog";

// Queue entries get their own id so the same video can appear more than once
// and still have a stable React / drag-and-drop key.
const newQueueId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const toQueueItem = (video) => ({ ...video, queueId: newQueueId() });

const queueKey = (video) => video.queueId ?? video.id.videoId;

/** Fisher-Yates shuffle of a copy of the list. */
function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The songs of `current` that were in `snapshot`, in the snapshot's order, then any newer ones. */
function restoreOrder(snapshot, current) {
  const byKey = new Map(current.map((video) => [queueKey(video), video]));
  const snapshotKeys = new Set(snapshot.map(queueKey));
  return [
    ...snapshot.filter((video) => byKey.has(queueKey(video))).map((video) => byKey.get(queueKey(video))),
    ...current.filter((video) => !snapshotKeys.has(queueKey(video))),
  ];
}

function Home({ libraryApi }) {
  const [videos, setVideos] = useState([]);
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused, setIsPaused] = useLocalStorage("isPaused", false);
  const [isRepeat, setIsRepeat] = useLocalStorage("isRepeat", false);
  const [playedVideos, setPlayedVideos] = useLocalStorage("playedVideos", []);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [details, setDetails] = useState(() => new Map());
  const [tab, setTab] = useState("library");
  const online = useOnlineStatus();
  const { record: recordEmbeddable, youtubeOnlyIds } = useEmbeddableCache();
  const { library, addToLibrary, syncCode, clearLibrary, removeFromLibrary } = libraryApi;
  const searchAbortRef = useRef(null);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const handleSearch = useCallback(async (query) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    try {
      const results = await searchVideos(query, controller.signal);
      setVideos(results);
      setHasSearched(true);
      setLastQuery(query);
      // Length, views and whether it can play in the player tab (best effort).
      const fresh = await getVideoDetails(
        results.map((v) => v.id.videoId),
        controller.signal
      );
      if (searchAbortRef.current === controller) {
        setDetails((prev) => new Map([...prev, ...fresh]));
        recordEmbeddable([...fresh].map(([id, detail]) => [id, detail.embeddable]));
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      if (err instanceof QuotaError) {
        toast.warning("Search quota limit reached. Please try again later.");
      } else {
        toast.error("Search failed. Please try again.");
        console.error("Search Error:", err);
      }
    } finally {
      // An aborted search was replaced by a newer one that owns the spinner.
      if (searchAbortRef.current === controller) setIsSearching(false);
    }
  }, [recordEmbeddable]);

  const addToQueue = useCallback(
    (video) => {
      setQueue((prev) => [...prev, toQueueItem(video)]);
      addToLibrary([video]);
      toast.success(`Added "${video.snippet.title}" to the queue`);
    },
    [setQueue, addToLibrary]
  );

  // From the Search tab: also remember the video in the "My Searches" saved list
  // (needs sync; a failure must not get in the way of queueing).
  const addFromSearch = useCallback(
    (video) => {
      addToQueue(video);
      if (syncCode) saveSearchedVideo(video).catch(() => {});
    },
    [addToQueue, syncCode]
  );

  const addAllToQueue = useCallback(
    (list) => {
      if (list.length === 0) return;
      setQueue((prev) => [...prev, ...list.map(toQueueItem)]);
      toast.success(`Added ${list.length} video${list.length === 1 ? "" : "s"} to the queue`);
    },
    [setQueue]
  );

  // Move an item between two positions; position 0 is the playing video and is locked.
  const handleMove = useCallback(
    (from, to) => {
      setQueue((prev) => {
        if (from < 1 || to < 1 || from >= prev.length || to >= prev.length) {
          return prev;
        }
        const next = [...prev];
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
      });
    },
    [setQueue]
  );

  // A notice with an Undo button, for changes that are easy to regret.
  const showUndo = useCallback((message, undo) => {
    toast(
      ({ closeToast }) => (
        <div className="d-flex align-items-center justify-content-between gap-3">
          <span>{message}</span>
          <button
            className="btn btn-sm btn-light"
            onClick={() => {
              undo();
              closeToast();
            }}
          >
            Undo
          </button>
        </div>
      ),
      { autoClose: 6000 }
    );
  }, []);

  const handleRemove = useCallback(
    (index) => {
      const removed = queue[index];
      if (!removed) return;
      setQueue((prev) => prev.filter((_, i) => i !== index));
      showUndo("Removed from the queue", () =>
        setQueue((prev) => {
          if (prev.some((video) => queueKey(video) === queueKey(removed))) return prev;
          // Back where it was (never in front of the song that is playing).
          const at = prev.length === 0 ? 0 : Math.min(Math.max(index, 1), prev.length);
          return [...prev.slice(0, at), removed, ...prev.slice(at)];
        })
      );
    },
    [queue, setQueue, showUndo]
  );

  const handleClear = useCallback(() => {
    const cleared = queue;
    setQueue([]);
    setIsPaused(false);
    if (cleared.length > 0) {
      showUndo(`Cleared ${cleared.length} songs`, () =>
        setQueue((prev) => {
          const clearedKeys = new Set(cleared.map(queueKey));
          return [...cleared, ...prev.filter((video) => !clearedKeys.has(queueKey(video)))];
        })
      );
    }
  }, [queue, setQueue, setIsPaused, showUndo]);

  // Mixes up what is coming next; the song that is playing stays first.
  const handleShuffle = useCallback(() => {
    if (queue.length < 3) return;
    const before = queue;
    setQueue((prev) => (prev.length < 3 ? prev : [prev[0], ...shuffled(prev.slice(1))]));
    showUndo(`Shuffled ${queue.length - 1} songs`, () =>
      setQueue((prev) => restoreOrder(before, prev))
    );
  }, [queue, setQueue, showUndo]);

  const handleSkip = useCallback(() => {
    const finished = queue[0];
    if (!finished) return;
    setQueue((prev) => prev.slice(1));
    setPlayedVideos((prev) =>
      prev.some((v) => v.id.videoId === finished.id.videoId) ? prev : [...prev, finished]
    );
  }, [queue, setQueue, setPlayedVideos]);

  const handlePlay = useCallback(
    (index) => {
      if (index === 0) return;
      setQueue((prev) => {
        if (index >= prev.length) return prev;
        const next = [...prev];
        next.unshift(next.splice(index, 1)[0]);
        return next;
      });
      setIsPaused(false);
    },
    [setQueue, setIsPaused]
  );

  const handleRequeuePlayed = useCallback(() => {
    if (playedVideos.length === 0) return;
    setQueue((prev) => [...prev, ...playedVideos.map(toQueueItem)]);
    setPlayedVideos([]);
    toast.success("Re-queued played videos!");
  }, [playedVideos, setQueue, setPlayedVideos]);

  const handleClearLibrary = useCallback(async () => {
    const ok = await clearLibrary();
    if (ok) toast.success("Library deleted");
    else toast.error("Could not delete the synced library. Please try again.");
    return ok;
  }, [clearLibrary]);

  const toggleRepeat = useCallback(() => setIsRepeat((repeat) => !repeat), [setIsRepeat]);
  const queuedIds = useMemo(() => new Set(queue.map((v) => v.id.videoId)), [queue]);
  const togglePaused = useCallback(
    () => setIsPaused((paused) => !paused),
    [setIsPaused]
  );

  return (
    <div className="container-xl py-4">
      {!online && (
        <div className="alert alert-warning py-2 small" role="status">
          You are offline. Your library and queue are still here; searching, importing
          and playing videos need a connection.
        </div>
      )}
      <AppTabs
        active={tab}
        onSelect={setTab}
        tabs={[
          { key: "library", label: "Library", icon: TAB_ICONS.library, count: library.length },
          { key: "queue", label: "Queue", icon: TAB_ICONS.queue, count: queue.length },
          { key: "search", label: "Search", icon: TAB_ICONS.search },
          {
            key: "player",
            label: "Player",
            icon: TAB_ICONS.player,
            href: "/player",
            title: "Open the player in a new browser tab, so videos keep playing while you search",
          },
        ]}
      />

      {tab === "search" && (
        <>
          <SearchBar onSearch={handleSearch} isLoading={isSearching} />
          {hasSearched && !isSearching && videos.length > 0 && (
            <p className="lib-summary" aria-live="polite">
              {videos.length} results for “{lastQuery}”
            </p>
          )}
          <VideoList
            videos={videos}
            queuedIds={queuedIds}
            details={details}
            onAdd={addFromSearch}
            isLoading={isSearching}
            hasSearched={hasSearched}
            emptyIcon={<FaSearch aria-hidden="true" />}
            emptyTitle="No results"
            emptyText={`Nothing found for “${lastQuery}”. Try other words or the artist's name.`}
          />
        </>
      )}

      {tab === "library" && (
        <Library
          library={library}
          onAdd={addToQueue}
          onAddAll={addAllToQueue}
          onClearLibrary={handleClearLibrary}
          onRemove={removeFromLibrary}
          queuedIds={queuedIds}
          youtubeOnlyIds={youtubeOnlyIds}
          syncCode={syncCode}
        />
      )}

      {tab === "queue" && (
        <Queue
          queue={queue}
          isPaused={isPaused}
          isRepeat={isRepeat}
          onToggleRepeat={toggleRepeat}
          onTogglePause={togglePaused}
          onSkip={handleSkip}
          onPlay={handlePlay}
          onMove={handleMove}
          onRemove={handleRemove}
          onClear={handleClear}
          youtubeOnlyIds={youtubeOnlyIds}
          onShuffle={handleShuffle}
          playedCount={playedVideos.length}
          onRequeuePlayed={handleRequeuePlayed}
        />
      )}
    </div>
  );
}

export default Home;
