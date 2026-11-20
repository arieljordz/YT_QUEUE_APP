import { useRef, useEffect, useCallback, useState } from "react";
import YouTube from "react-youtube";

const PLAYER_OPTS = { width: "100%", playerVars: { autoplay: 1 } };
const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange"];

function requestFullscreen(element) {
  const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
  // Browsers reject this without a user gesture; that is expected, not an error.
  Promise.resolve(request?.call(element)).catch(() => {});
}

const VideoPlayer = ({ video, onEnd, isPaused, isRepeat }) => {
  const playerRef = useRef(null);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const isRepeatRef = useRef(isRepeat);
  isRepeatRef.current = isRepeat;
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

  // The iframe is kept alive between videos (react-youtube loads the new id
  // into the existing player), because a freshly created iframe in a background
  // tab is blocked from autoplaying. Only a repeat of the same video id needs
  // an explicit restart, since the id prop does not change.
  const queueId = video?.queueId;
  const videoId = video?.id.videoId;
  const lastRef = useRef({ queueId, videoId });
  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = { queueId, videoId };
    const player = playerRef.current;
    if (!player || !queueId || queueId === last.queueId) return;
    if (videoId === last.videoId && !isPausedRef.current) {
      player.seekTo?.(0);
      player.playVideo?.();
    }
  }, [queueId, videoId]);

  // Fallback: if the browser still blocked the next video while the tab was in
  // the background, start it as soon as the user comes back.
  useEffect(() => {
    const resumeIfStalled = () => {
      if (document.hidden || isPausedRef.current) return;
      const player = playerRef.current;
      const state = player?.getPlayerState?.();
      // -1 unstarted, 2 paused, 5 cued
      if (state === -1 || state === 2 || state === 5) player.playVideo();
    };
    document.addEventListener("visibilitychange", resumeIfStalled);
    return () => document.removeEventListener("visibilitychange", resumeIfStalled);
  }, []);

  // With repeat on, the finished video starts over instead of moving on.
  const handleEnd = useCallback(
    (e) => {
      if (isRepeatRef.current) {
        const player = e.target;
        const { video_id: id } = player.getVideoData?.() ?? {};
        player.seekTo(0, true);
        player.playVideo();
        // Some browsers leave an ended video stuck on the end screen; if it did
        // not restart, load it again.
        setTimeout(() => {
          if (player.getPlayerState?.() === 0 && id) player.loadVideoById(id);
        }, 800);
      } else {
        onEnd(e);
      }
    },
    [onEnd]
  );

  const handleStateChange = useCallback((e) => {
    // -1 unstarted / 5 cued: the next video was loaded but not started.
    if ((e.data === -1 || e.data === 5) && !isPausedRef.current) e.target.playVideo();
  }, []);

  // One click on this page gives it the user activation the browser needs to
  // let later videos autoplay while the tab is in the background.
  const [activated, setActivated] = useState(false);
  const handleActivate = useCallback(() => {
    setActivated(true);
    if (!isPausedRef.current) playerRef.current?.playVideo?.();
  }, []);

  return (
    <div className="video-wrapper">
      <div className="video-container">
        {!activated && (
          <button className="btn btn-primary mb-3" onClick={handleActivate}>
            ▶ Click once to enable continuous playback
          </button>
        )}
        <YouTube
          videoId={videoId}
          opts={PLAYER_OPTS}
          onReady={onReady}
          onEnd={handleEnd}
          onStateChange={handleStateChange}
        />
      </div>
    </div>
  );
};

export default VideoPlayer;
