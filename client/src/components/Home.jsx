import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { FaExternalLinkAlt } from "react-icons/fa";
import SearchBar from "./SearchBar";
import VideoList from "./VideoList";
import Queue from "./Queue";
import Library from "./Library";
import useLocalStorage from "../hooks/useLocalStorage";
import { searchVideos, findNonEmbeddable, QuotaError } from "../api/youtube";
import { saveSearchedVideo } from "../api/catalog";

// Queue entries get their own id so the same video can appear more than once
// and still have a stable React / drag-and-drop key.
const newQueueId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const toQueueItem = (video) => ({ ...video, queueId: newQueueId() });

function Home({ libraryApi }) {
  const [videos, setVideos] = useState([]);
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused, setIsPaused] = useLocalStorage("isPaused", false);
  const [isRepeat, setIsRepeat] = useLocalStorage("isRepeat", false);
  const [playedVideos, setPlayedVideos] = useLocalStorage("playedVideos", []);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [youtubeOnlyIds, setYoutubeOnlyIds] = useState(() => new Set());
  const [tab, setTab] = useState("library");
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
      // Flag videos that cannot play in the embedded player (best effort).
      const blocked = await findNonEmbeddable(
        results.map((v) => v.id.videoId),
        controller.signal
      );
      if (searchAbortRef.current === controller) {
        setYoutubeOnlyIds((prev) => new Set([...prev, ...blocked]));
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
  }, []);

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
      if (syncCode) saveSearchedVideo(syncCode, video).catch(() => {});
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

  const handleRemove = useCallback(
    (index) => setQueue((prev) => prev.filter((_, i) => i !== index)),
    [setQueue]
  );

  const handleClear = useCallback(() => {
    setQueue([]);
    setIsPaused(false);
  }, [setQueue, setIsPaused]);

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
      <ul className="nav nav-tabs mb-3">
        {[
          ["library", `📚 Library (${library.length})`],
          ["queue", `🎵 Queue (${queue.length})`],
          ["search", "🔍 Search"],
        ].map(([key, label]) => (
          <li className="nav-item" key={key}>
            <button
              className={`nav-link ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          </li>
        ))}
        {/* Not a page of its own: it opens the player in a new browser tab. */}
        <li className="nav-item">
          <a
            className="nav-link d-flex align-items-center gap-1"
            href="/player"
            target="_blank"
            rel="noopener"
            title="Open the player in a new browser tab, so videos keep playing while you search"
          >
            📺 Player <FaExternalLinkAlt size={11} aria-hidden="true" />
          </a>
        </li>
      </ul>

      {tab === "search" && (
        <>
          <SearchBar onSearch={handleSearch} isLoading={isSearching} />
          <VideoList
            videos={videos}
            queuedIds={queuedIds}
            youtubeOnlyIds={youtubeOnlyIds}
            onAdd={addFromSearch}
            isLoading={isSearching}
            hasSearched={hasSearched}
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
          playedCount={playedVideos.length}
          onRequeuePlayed={handleRequeuePlayed}
        />
      )}
    </div>
  );
}

export default Home;
