import React, { useState, useEffect } from "react";
import SearchBar from "./SearchBar";
import VideoList from "./VideoList";
import Queue from "./Queue";
import VideoPlayer from "./VideoPlayer";

const API_KEY = "AIzaSyAzqJYAm-RGsbCpwreSsWPC0Wq2uZM2kcg";

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

  // Save current video and queue on change
  useEffect(() => {
    localStorage.setItem("videoQueue", JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem("currentVideo", JSON.stringify(currentVideo));
  }, [currentVideo]);

  useEffect(() => {
    localStorage.setItem("isPaused", JSON.stringify(isPaused));
  }, [isPaused]);

  // Fetch videos from YouTube
  const handleSearch = async (query) => {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=10&key=${API_KEY}`
      );
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
      if (!currentVideo) {
        setCurrentVideo(video);
      }
      return updated;
    });
  };

  const handleReorder = (newQueue) => {
    setQueue(newQueue);
    if (!currentVideo && newQueue.length > 0) {
      setCurrentVideo(newQueue[0]);
    }
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
      nextQueue.shift();
      setCurrentVideo(nextQueue[0] || null);
      setPlayCount((count) => count + 1); // 👈 force re-render of same video
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

  return (
    <>
      <div className="container mt-4">
        <h2 className="text-center mb-4">🎬 YouTube Queueing App</h2>
     
        <div className="row mt-4">
          <div className="col-md-4">
          <SearchBar onSearch={handleSearch} />
            <h5 className="pt-2">🔍 Search Results</h5>
            <VideoList videos={videos} onAdd={addToQueue} />
          </div>
          <div className="col-md-8">
            {/* <h5>📺 Now Playing</h5> */}
            <VideoPlayer
              video={currentVideo}
              playCount={playCount}
              onEnd={playNext}
              isPaused={isPaused}
              setIsPaused={setIsPaused}
            />

            <Queue
              queue={queue}
              onReorder={handleReorder}
              onRemove={handleRemove}
              onClear={handleClear}
              onPlay={handlePlay}
              isPaused={isPaused}
              setIsPaused={(val) => {
                setIsPaused(val);
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default Home;
