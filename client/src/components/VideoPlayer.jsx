import { useRef, useEffect, useCallback, useState } from "react";
import YouTube from "react-youtube";
import { decodeHtml } from "../lib/text";

const PLAYER_OPTS = { width: "100%", playerVars: { autoplay: 1 } };
// The "Next:" banner shows during the last seconds of a song.
const NEXT_BANNER_SECONDS = 15;
// How often the watchdog checks that the queue is really playing, and how many
// checks in a row may fail before it steps in.
const WATCHDOG_MS = 2000;
const WATCHDOG_STRIKES = 2;
// State changes this soon after one of our own commands are not the user's doing.
const OWN_COMMAND_MS = 3000;
const FULLSCREEN_EVENTS = ["fullscreenchange", "webkitfullscreenchange"];

function requestFullscreen(element) {
  const request = element.requestFullscreen ?? element.webkitRequestFullscreen;
  // Browsers reject this without a user gesture; that is expected, not an error.
  Promise.resolve(request?.call(element)).catch(() => {});
}

/**
 * The one YouTube player of the player tab. It plays the queue from the first
 * song to the last by itself, in the foreground or the background, and stops
 * only when the user pauses it (here in the player, or from the queue tab).
 *
 * How it keeps going in a background tab:
 *  - one iframe lives for the whole session and loads each song through the
 *    player API (a new iframe in a background tab would be blocked);
 *  - when a song ends, the next one is loaded right inside that "ended" event,
 *    not later from a React render, which is when browsers allow it;
 *  - a watchdog notices a stuck player (missed event, blocked autoplay) and
 *    starts it again.
 */
const VideoPlayer = ({
  video,
  nextVideo,
  onEnd,
  isPaused,
  isRepeat,
  onPlayerPause,
  onPlayerPlay,
  onEmbedBlocked,
}) => {
  const queueId = video?.queueId;
  const videoId = video?.id.videoId;

  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const isRepeatRef = useRef(isRepeat);
  isRepeatRef.current = isRepeat;
  const nextRef = useRef(nextVideo);
  nextRef.current = nextVideo;
  const pauseCallbackRef = useRef(onPlayerPause);
  pauseCallbackRef.current = onPlayerPause;
  const playCallbackRef = useRef(onPlayerPlay);
  playCallbackRef.current = onPlayerPlay;
  const blockedCallbackRef = useRef(onEmbedBlocked);
  blockedCallbackRef.current = onEmbedBlocked;
  const wantsFullscreenRef = useRef(localStorage.getItem("isFullscreen") === "true");

  // The iframe is created once, with the song that is first in the queue. Every
  // later song is loaded by hand (below), so React never swaps the player.
  const initialVideoIdRef = useRef(videoId);
  const loadedIdRef = useRef(videoId); // the song the player currently holds
  const shownQueueIdRef = useRef(queueId); // the queue entry that song belongs to
  const lastCommandRef = useRef(0);

  /** Run a player command and remember when, so its echo is not mistaken for the user. */
  const command = useCallback((run) => {
    lastCommandRef.current = Date.now();
    try {
      run(playerRef.current);
    } catch {
      // The YouTube player was destroyed or replaced (its iframe is gone); the
      // new one applies the current state itself when it is ready.
    }
  }, []);

  const onReady = useCallback(
    (event) => {
      playerRef.current = event.target;
      setReady(true);

      lastCommandRef.current = Date.now();
      if (isPausedRef.current) event.target.pauseVideo();
      else event.target.playVideo();

      // Restore fullscreen if the user was in it for the previous video.
      if (wantsFullscreenRef.current) requestFullscreen(event.target.getIframe());
    },
    []
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
    if (!ready) return;
    command((player) => (isPaused ? player.pauseVideo?.() : player.playVideo?.()));
  }, [isPaused, ready, command]);

  // Follow the queue: load the song that is now first. (When a song ended by
  // itself, the end handler already loaded it and these refs match.)
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !videoId) return;

    if (loadedIdRef.current !== videoId) {
      loadedIdRef.current = videoId;
      command((p) =>
        isPausedRef.current ? p.cueVideoById(videoId) : p.loadVideoById(videoId)
      );
    } else if (shownQueueIdRef.current !== queueId && !isPausedRef.current) {
      // The same song again (a repeat in the queue): play it from the start.
      command((p) => {
        p.seekTo?.(0);
        p.playVideo?.();
      });
    }
    shownQueueIdRef.current = queueId;
  }, [ready, queueId, videoId, command]);

  // A pause made with the player's own controls must be a real pause: the user
  // is looking at this page and has clicked inside the player (so the iframe has
  // the focus). Those are the only pauses treated as the user's.
  const userIsInPlayer = () => {
    const iframe = playerRef.current?.getIframe?.();
    return (
      document.visibilityState === "visible" &&
      Boolean(iframe) &&
      document.activeElement === iframe &&
      Date.now() - lastCommandRef.current > OWN_COMMAND_MS
    );
  };

  /** Start the player if it should be playing but is not (never against a user pause). */
  const startIfStalled = useCallback(() => {
    const player = playerRef.current;
    if (!player || isPausedRef.current) return;
    const state = player.getPlayerState?.();
    // 1 playing, 3 buffering: fine. 2 paused after the user clicked in the player: leave it.
    if (state === 1 || state === 3) return;
    if (state === 2 && document.activeElement === player.getIframe?.()) return;
    command((p) => p.playVideo?.());
  }, [command]);

  // Playback ends: with repeat on the song starts over, otherwise the next song
  // is loaded right here, inside the event, and then the queue is advanced.
  const handleEnd = useCallback(
    (e) => {
      const player = e.target;
      if (isRepeatRef.current) {
        const { video_id: id } = player.getVideoData?.() ?? {};
        command((p) => {
          p.seekTo(0, true);
          p.playVideo();
        });
        // Some browsers leave an ended video stuck on the end screen; if it did
        // not restart, load it again.
        setTimeout(() => {
          if (player.getPlayerState?.() === 0 && id) player.loadVideoById(id);
        }, 800);
        return;
      }

      const next = nextRef.current;
      if (next) {
        loadedIdRef.current = next.id.videoId;
        shownQueueIdRef.current = next.queueId;
        command((p) =>
          isPausedRef.current ? p.cueVideoById(next.id.videoId) : p.loadVideoById(next.id.videoId)
        );
      }
      onEnd(e);
    },
    [onEnd, command]
  );
  const handleEndRef = useRef(handleEnd);
  handleEndRef.current = handleEnd;

  // YouTube error 101 / 150: the owner does not allow this video outside youtube.com.
  const handleError = useCallback((e) => {
    if (e.data === 101 || e.data === 150) blockedCallbackRef.current?.(loadedIdRef.current);
  }, []);

  const [playing, setPlaying] = useState(false);
  const handleStateChange = useCallback(
    (e) => {
      setPlaying(e.data === 1);

      if (e.data === 2 && !isPausedRef.current && userIsInPlayer()) {
        pauseCallbackRef.current?.(); // paused in the player: the queue is paused too
      } else if (e.data === 1 && isPausedRef.current && userIsInPlayer()) {
        playCallbackRef.current?.(); // resumed in the player
      }
      // -1 unstarted / 5 cued: the next video was loaded but not started.
      if ((e.data === -1 || e.data === 5) && !isPausedRef.current) {
        command((p) => p.playVideo());
      }
    },
    [command]
  );

  // Watchdog: if the player has not been playing for a few checks in a row
  // (a missed "ended" event, autoplay blocked in the background...), step in.
  useEffect(() => {
    if (!ready || !videoId) return;
    let strikes = 0;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player || isPausedRef.current) {
        strikes = 0;
        return;
      }
      const state = player.getPlayerState?.();
      if (state === 1 || state === 3) {
        strikes = 0;
        return;
      }
      if (state === 2 && document.activeElement === player.getIframe?.()) {
        strikes = 0; // the user paused in the player
        return;
      }
      strikes += 1;
      if (strikes < WATCHDOG_STRIKES) return;
      strikes = 0;
      if (state === 0) handleEndRef.current({ target: player }); // ended but never advanced
      else startIfStalled();
    }, WATCHDOG_MS);
    return () => clearInterval(timer);
  }, [ready, videoId, startIfStalled]);

  // Coming back to the tab (or the first click or key press anywhere on the page,
  // which also gives the page the activation browsers want) restarts a player
  // that was blocked in the background.
  useEffect(() => {
    const nudge = () => {
      if (document.visibilityState === "visible") startIfStalled();
    };
    document.addEventListener("visibilitychange", nudge);
    document.addEventListener("pointerdown", nudge);
    document.addEventListener("keydown", nudge);
    return () => {
      document.removeEventListener("visibilitychange", nudge);
      document.removeEventListener("pointerdown", nudge);
      document.removeEventListener("keydown", nudge);
    };
  }, [startIfStalled]);

  // Show "Next: ..." while the current song is about to finish.
  const [endingSoon, setEndingSoon] = useState(false);
  useEffect(() => {
    setEndingSoon(false);
    const timer = setInterval(() => {
      const player = playerRef.current;
      const duration = player?.getDuration?.() ?? 0;
      const remaining = duration - (player?.getCurrentTime?.() ?? 0);
      setEndingSoon(duration > 0 && remaining > 0 && remaining <= NEXT_BANNER_SECONDS);
    }, 1000);
    return () => clearInterval(timer);
  }, [queueId]);
  const nextLabel = nextVideo ? decodeHtml(nextVideo.snippet.title) : null;

  // Only when the browser really blocked playback: say how to start it.
  const [needsTap, setNeedsTap] = useState(false);
  useEffect(() => {
    if (playing || !videoId || isPaused) {
      setNeedsTap(false);
      return;
    }
    const timer = setTimeout(() => setNeedsTap(true), 3000);
    return () => clearTimeout(timer);
  }, [playing, videoId, isPaused]);

  return (
    <div className="video-wrapper">
      <div className="video-container">
        {needsTap && <div className="tap-hint">Click anywhere to start playback</div>}
        {endingSoon && !isRepeat && (
          <div className="next-up-banner" role="status">
            <span className="next-up-label">{nextLabel ? "Next" : "Last song"}</span>
            {nextLabel && <span className="next-up-title">{nextLabel}</span>}
          </div>
        )}
        <YouTube
          videoId={initialVideoIdRef.current}
          opts={PLAYER_OPTS}
          onReady={onReady}
          onEnd={handleEnd}
          onStateChange={handleStateChange}
          onError={handleError}
        />
      </div>
    </div>
  );
};

export default VideoPlayer;
