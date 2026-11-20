import { useCallback } from "react";
import VideoPlayer from "./VideoPlayer";
import useLocalStorage from "../hooks/useLocalStorage";

// Player tab: shares the queue with the search tab through localStorage and is
// the only place that advances it, so playback keeps going while the user
// works in another tab.
function PlayerPage() {
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused] = useLocalStorage("isPaused", false);
  const [isRepeat] = useLocalStorage("isRepeat", false);
  const [, setPlayedVideos] = useLocalStorage("playedVideos", []);

  const currentVideo = queue[0] ?? null;

  const playNext = useCallback(() => {
    if (!currentVideo) return;
    // Only drop the head if it is still the video that finished; the user may
    // have reordered the queue from the other tab in the meantime.
    setQueue((prev) => (prev[0]?.queueId === currentVideo.queueId ? prev.slice(1) : prev));
    setPlayedVideos((prev) =>
      prev.some((v) => v.id.videoId === currentVideo.id.videoId)
        ? prev
        : [...prev, currentVideo]
    );
  }, [currentVideo, setQueue, setPlayedVideos]);

  return (
    <div className="m-4">
      <VideoPlayer
        video={currentVideo}
        onEnd={playNext}
        isPaused={isPaused}
        isRepeat={isRepeat}
      />
      {!currentVideo && (
        <p className="text-center mt-3">
          Queue is empty. Add a video from the search tab and it will start here.
        </p>
      )}
    </div>
  );
}

export default PlayerPage;
