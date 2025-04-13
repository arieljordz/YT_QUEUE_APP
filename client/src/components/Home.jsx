import React, { useState, useEffect } from "react";
import SearchBar from "./SearchBar";
import VideoList from "./VideoList";
import Queue from "./Queue";
import VideoPlayer from "./VideoPlayer";
import { toast } from "react-toastify";

const API_KEY = import.meta.env.VITE_YT_API_KEY;

function Home() {
  const [videos, setVideos] = useState([]);
  const [queue, setQueue] = useState(() => {
    const saved = localStorage.getItem("videoQueue");
    return saved ? JSON.parse(saved) : [];
  });
  const [currentVideo, setCurrentVideo] = useState(() => {
    const saved = localStorage.getItem("currentVideo");
    return saved ? JSON.parse(saved) : null;
  });
  const [isPaused, setIsPaused] = useState(() => {
    const saved = localStorage.getItem("isPaused");
    return saved ? JSON.parse(saved) : false;
  });
  const [playCount, setPlayCount] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [playedVideos, setPlayedVideos] = useState(() => {
    const saved = localStorage.getItem("playedVideos");
    return saved ? JSON.parse(saved) : [];
  });

  // Sync with localStorage
  useEffect(() => {
    localStorage.setItem("videoQueue", JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem("currentVideo", JSON.stringify(currentVideo));
  }, [currentVideo]);

  useEffect(() => {
    localStorage.setItem("isPaused", JSON.stringify(isPaused));
  }, [isPaused]);

  useEffect(() => {
    localStorage.setItem("playedVideos", JSON.stringify(playedVideos));
  }, [playedVideos]);

  const handleSearch = async (query) => {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=10&key=${API_KEY}`
      );
      console.log("Search Result:", res);
      if (res.status === 403) toast.warning("Search quota limit reached. Please try again later.");
      const data = await res.json();
      if (data.items) setVideos(data.items);
      else console.error("Error fetching videos:", data);
    } catch (err) {
      console.error("Search Error:", err);
    }
  };

  const addToQueue = (video) => {
    setQueue((prev) => {
      const updated = [...prev, video];
      if (!currentVideo) setCurrentVideo(video);
      toast.success(`Added "${video.snippet.title}" to the queue`);
      return updated;
    });
  };

  const handleReorder = (newQueue) => {
    setQueue(newQueue);
    if (!currentVideo && newQueue.length > 0) setCurrentVideo(newQueue[0]);
  };

  const handleRemove = (index) => {
    setQueue((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      if (index === 0) {
        const next = updated[0] || null;
        setCurrentVideo(next);
      }
      return updated;
    });
  };

  const handleClear = () => {
    setQueue([]);
    setCurrentVideo(null);
    setIsPaused(false);
  };

  const playNext = () => {
    setQueue((prev) => {
      const nextQueue = [...prev];
      const finishedVideo = nextQueue.shift();

      setCurrentVideo(nextQueue[0] || null);
      setPlayCount((count) => count + 1);

      // Only add to playedVideos after it's been removed from the queue
      if (finishedVideo) {
        setPlayedVideos((prevPlayed) => {
          // Prevent duplicate in playedVideos
          const alreadyPlayed = prevPlayed.some(
            (v) => v.id.videoId === finishedVideo.id.videoId
          );
          return alreadyPlayed ? prevPlayed : [...prevPlayed, finishedVideo];
        });
      }

      return nextQueue;
    });
  };

  const handlePlay = (index) => {
    if (index === 0) return;
    const newQueue = [...queue];
    const [selected] = newQueue.splice(index, 1);
    newQueue.unshift(selected);
    setQueue(newQueue);
    setCurrentVideo(selected);
    setIsPaused(false);
  };

  const handleRequeuePlayed = () => {
    if (playedVideos.length === 0) return;
    setQueue((prev) => [...prev, ...playedVideos]);
    toast.success("Re-queued played videos!");
    setPlayedVideos([]);
  };

  return (
    <div className="m-4">
      <h2 className="text-center mb-4 hide">🎬 YouTube Queueing App</h2>

      <div className="row">
        <VideoPlayer
          video={currentVideo}
          playCount={playCount}
          onEnd={playNext}
          isPaused={isPaused}
          setIsPaused={setIsPaused}
        />
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
            onReorder={handleReorder}
            onRemove={handleRemove}
            onClear={handleClear}
            onPlay={handlePlay}
            isPaused={isPaused}
            setIsPaused={setIsPaused}
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSidebarCollapsed={setIsSidebarCollapsed}
            playedVideos={playedVideos}
            onRequeuePlayed={handleRequeuePlayed}
          />
        </div>
      </div>
    </div>
  );
}

export default Home;
