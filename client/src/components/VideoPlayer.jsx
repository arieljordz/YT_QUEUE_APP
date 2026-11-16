import { useRef, useEffect, useCallback } from "react";
import YouTube from "react-youtube";

const PLAYER_OPTS = { width: "100%", playerVars: { autoplay: 1 } };
const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange"];

function requestFullscreen(element) {
  const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
  // Browsers reject this without a user gesture; that is expected, not an error.
  Promise.resolve(request?.call(element)).catch(() => {});
}

const VideoPlayer = ({ video, onEnd, isPaused, playCount }) => {
  const playerRef = useRef(null);
  const wantsFullscreenRef = useRef(localStorage.getItem("isFullscreen") === "true");

  const onReady = useCallback(
    (event) => {
      playerRef.current = event.target;

      if (isPaused) event.target.pauseVideo();
      else event.target.playVideo();

      // Restore fullscreen if the user was in it for the previous video.
      if (wantsFullscreenRef.current) requestFullscreen(event.target.getIframe());
    },
    [isPaused]
  );

  // Remember whether the player iframe is fullscreen.
  useEffect(() => {
    const handleFullscreenChange = () => {
      const iframe = playerRef.current?.getIframe?.();
      // When the iframe is swapped for the next video the browser leaves
      // fullscreen; that must not be recorded as the user opting out.
      if (!iframe?.isConnected) return;

      const isFull =
        (document.fullscreenElement ?? document.webkitFullscreenElement) === iframe;
      wantsFullscreenRef.current = isFull;
      localStorage.setItem("isFullscreen", String(isFull));
    };

    FULLSCREEN_EVENTS.forEach((name) =>
      document.addEventListener(name, handleFullscreenChange)
    );
    return () =>
      FULLSCREEN_EVENTS.forEach((name) =>
        document.removeEventListener(name, handleFullscreenChange)
      );
  }, []);

  // Apply play/pause changes made from the queue controls.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (isPaused) player.pauseVideo?.();
    else player.playVideo?.();
  }, [isPaused]);

  if (!video) return <div>No video selected</div>;

  return (
    <div className="video-wrapper">
      <div className="video-container">
        <YouTube
          key={`${video.id.videoId}-${playCount}`}
          videoId={video.id.videoId}
          opts={PLAYER_OPTS}
          onReady={onReady}
          onEnd={onEnd}
        />
      </div>
    </div>
  );
};

export default VideoPlayer;
