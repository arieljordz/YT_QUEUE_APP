import { useCallback, useEffect, useState } from "react";
import { FaLightbulb, FaRegLightbulb } from "react-icons/fa";
import VideoPlayer from "./VideoPlayer";
import useLocalStorage from "../hooks/useLocalStorage";
import useWakeLock, { wakeLockSupported } from "../hooks/useWakeLock";
import { decodeHtml } from "../lib/text";

// Player tab: shares the queue with the search tab through localStorage and is
// the only place that advances it, so playback keeps going while the user
// works in another tab.
function PlayerPage() {
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused] = useLocalStorage("isPaused", false);
  const [isRepeat] = useLocalStorage("isRepeat", false);
  const [, setPlayedVideos] = useLocalStorage("playedVideos", []);

  const currentVideo = queue[0] ?? null;
  const nextVideo = queue[1] ?? null;

  // Keep the screen on while a song is playing (an option, on by default).
  const [keepAwake, setKeepAwake] = useLocalStorage("keepAwake", true);
  useWakeLock(keepAwake && Boolean(currentVideo) && !isPaused);

  // The small switch only shows for a few seconds after the pointer moves.
  const [controlsVisible, setControlsVisible] = useState(false);
  useEffect(() => {
    let timer;
    const reveal = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), 3000);
    };
    window.addEventListener("pointermove", reveal);
    window.addEventListener("keydown", reveal);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", reveal);
      window.removeEventListener("keydown", reveal);
    };
  }, []);

  // Name the browser tab after what is playing (titles may contain HTML entities).
  const title = currentVideo?.snippet.title;
  useEffect(() => {
    const decoded = title ? decodeHtml(title) : null;
    document.title = decoded ? `▶ ${decoded} · Player` : "Player · YouTube Queueing App";
    return () => {
      document.title = "YouTube Queueing App";
    };
  }, [title]);

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
    <div className="player-page">
      <VideoPlayer
        video={currentVideo}
        nextVideo={nextVideo}
        onEnd={playNext}
        isPaused={isPaused}
        isRepeat={isRepeat}
      />
      {wakeLockSupported() && (
        <button
          className={`keep-awake-toggle btn btn-sm ${keepAwake ? "btn-warning" : "btn-outline-light"} ${
            controlsVisible ? "is-visible" : ""
          }`}
          onClick={() => setKeepAwake((on) => !on)}
          aria-pressed={keepAwake}
          title={keepAwake ? "Screen stays on while playing (click to turn off)" : "Let the screen sleep (click to keep it on)"}
        >
          {keepAwake ? <FaLightbulb aria-hidden="true" /> : <FaRegLightbulb aria-hidden="true" />}{" "}
          Keep screen on
        </button>
      )}
      {!currentVideo && (
        <p className="text-center player-empty px-3">
          Queue is empty. Add a video from the search tab and it will start here.
        </p>
      )}
    </div>
  );
}

export default PlayerPage;
