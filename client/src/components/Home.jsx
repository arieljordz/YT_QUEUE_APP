import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "react-toastify";
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const searchAbortRef = useRef(null);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const handleSearch = useCallback(async (query) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    try {
      setVideos(await searchVideos(query, controller.signal));
    } catch (err) {
      if (err.name === "AbortError") return;
      if (err instanceof QuotaError) {
        toast.warning("Search quota limit reached. Please try again later.");
      } else {
        toast.error("Search failed. Please try again.");
        console.error("Search Error:", err);
      }
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

  const toggleSidebar = useCallback(
    () => setIsSidebarCollapsed((collapsed) => !collapsed),
    []
  );
  const togglePaused = useCallback(
    () => setIsPaused((paused) => !paused),
    [setIsPaused]
  );

  return (
    <div className="m-4">
      <h2 className="text-center mb-4 hide">🎬 YouTube Queueing App</h2>

      <div className="alert alert-info d-flex justify-content-between align-items-center">
        <span>
          Videos play in a separate player tab, so you can keep searching
          while they play.
        </span>
        <a
          className="btn btn-sm btn-primary"
          href="/player"
          target="_blank"
          rel="noopener"
        >
          Open player tab
        </a>
      </div>

      <div className="row">
        {!isSidebarCollapsed && (
          <div className="col-md-6 mb-4 mt-4 mb-md-0">
            <h5 className="pt-2">🔍 Search</h5>
            <SearchBar onSearch={handleSearch} />
            <VideoList videos={videos} onAdd={addToQueue} />
          </div>
        )}

        <div className={isSidebarCollapsed ? "col-12" : "col-md-6"}>
          <Queue
            queue={queue}
            onMove={handleMove}
            onRemove={handleRemove}
            onClear={handleClear}
            onPlay={handlePlay}
            isPaused={isPaused}
            onTogglePause={togglePaused}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            hasPlayedVideos={playedVideos.length > 0}
            onRequeuePlayed={handleRequeuePlayed}
          />
        </div>
      </div>
    </div>
  );
}

export default Home;
