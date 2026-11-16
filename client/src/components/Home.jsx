import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { FaExternalLinkAlt } from "react-icons/fa";
import SearchBar from "./SearchBar";
import VideoList from "./VideoList";
import Queue from "./Queue";
import useLocalStorage from "../hooks/useLocalStorage";
import { searchVideos, QuotaError } from "../api/youtube";

// Queue entries get their own id so the same video can appear more than once
// and still have a stable React / drag-and-drop key.
const newQueueId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const toQueueItem = (video) => ({ ...video, queueId: newQueueId() });

function Home() {
  const [videos, setVideos] = useState([]);
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused, setIsPaused] = useLocalStorage("isPaused", false);
  const [playedVideos, setPlayedVideos] = useLocalStorage("playedVideos", []);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchAbortRef = useRef(null);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const handleSearch = useCallback(async (query) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    try {
      setVideos(await searchVideos(query, controller.signal));
      setHasSearched(true);
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
      toast.success(`Added "${video.snippet.title}" to the queue`);
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

  const handleImport = useCallback(
    (imported, skipped) => {
      setQueue((prev) => [...prev, ...imported.map(toQueueItem)]);
      const count = `${imported.length} video${imported.length === 1 ? "" : "s"}`;
      toast.success(
        skipped > 0
          ? `Imported ${count} (skipped ${skipped} invalid)`
          : `Imported ${count}`
      );
    },
    [setQueue]
  );
  const handleImportError = useCallback((message) => toast.error(message), []);

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

  const queuedIds = useMemo(() => new Set(queue.map((v) => v.id.videoId)), [queue]);
  const togglePaused = useCallback(
    () => setIsPaused((paused) => !paused),
    [setIsPaused]
  );

  return (
    <div className="container-xl py-4">
      <div className="alert alert-info d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span>
          Videos play in a separate player tab, so you can keep searching while
          they play.
        </span>
        <a
          className="btn btn-sm btn-primary d-flex align-items-center gap-1"
          href="/player"
          target="_blank"
          rel="noopener"
        >
          <FaExternalLinkAlt /> Open player tab
        </a>
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          <h5 className="mb-3">🔍 Search</h5>
          <SearchBar onSearch={handleSearch} isLoading={isSearching} />
          <VideoList
            videos={videos}
            queuedIds={queuedIds}
            onAdd={addToQueue}
            isLoading={isSearching}
            hasSearched={hasSearched}
          />
        </div>

        <div className="col-lg-6">
          <Queue
            queue={queue}
            isPaused={isPaused}
            onTogglePause={togglePaused}
            onSkip={handleSkip}
            onPlay={handlePlay}
            onMove={handleMove}
            onRemove={handleRemove}
            onClear={handleClear}
            playedCount={playedVideos.length}
            onRequeuePlayed={handleRequeuePlayed}
            onImport={handleImport}
            onImportError={handleImportError}
          />
        </div>
      </div>
    </div>
  );
}

export default Home;
