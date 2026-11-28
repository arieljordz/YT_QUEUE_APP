import { useCallback, useEffect } from "react";
import VideoPlayer from "./VideoPlayer";
import useLocalStorage from "../../hooks/useLocalStorage";
import { useProgressReporter } from "../../hooks/usePlayerProgress";
import useWakeLock from "../../hooks/useWakeLock";
import { useRecordPlayed } from "../../hooks/useExtras";
import { useEmbeddableCache } from "../../hooks/useEmbeddable";
import usePlayerLease from "../../hooks/usePlayerLease";
import { decodeHtml } from "../../lib/text";
import { notify } from "../../lib/notify";
import PlayerNotice from "./PlayerNotice";
import ExternalPlaybackPanel from "./ExternalPlaybackPanel";
import useExternalPlayback from "../../hooks/useExternalPlayback";

// Player tab: shares the queue with the search tab through localStorage and is
// the only place that advances it, so playback keeps going while the user
// works in another tab.
// `inBackground`: the in-app player is hidden behind another tab of the page.
function PlayerPage({ roomName, onSignedOut, inBackground = false }) {
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused, setIsPaused] = useLocalStorage("isPaused", false);
  const [isRepeat] = useLocalStorage("isRepeat", false);

  const reportProgress = useProgressReporter();

  const currentVideo = queue[0] ?? null;
  const nextVideo = queue[1] ?? null;

  // Only one device plays a room at a time; the others wait or take over.
  const { status, takeOver } = usePlayerLease(onSignedOut);
  const active = status === "active";

  // Hidden behind another tab, the "moved" notice below can't be seen: say it in a toast.
  const moved = status === "moved";
  useEffect(() => {
    if (moved && inBackground) notify.player.moved();
    // Only when it moves, not when the user later switches tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moved]);

  // The screen stays on while a song is playing.
  useWakeLock(active && Boolean(currentVideo) && !isPaused);

  // Remember each song that starts playing, for "Recently played" in the Library.
  const recordPlayed = useRecordPlayed();
  const { record: recordEmbeddable, youtubeOnlyIds } = useEmbeddableCache();
  const currentQueueId = currentVideo?.queueId;
  useEffect(() => {
    if (active && currentVideo && !isPaused) recordPlayed(currentVideo);
    // Once per song: only a new queue entry (or leaving pause) records it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQueueId, isPaused, active]);

  // Name the browser tab after the room and what is playing (titles may contain HTML entities).
  const title = active ? currentVideo?.snippet.title : null;
  const room = roomName || "Player";
  useEffect(() => {
    const decoded = title ? decodeHtml(title) : null;
    document.title = decoded ? `▶ ${decoded} · ${room}` : `${room} · Player`;
    return () => {
      document.title = "QueueUp";
    };
  }, [title, room]);

  // Only drop the head if it is still the video that finished; the user may
  // have reordered the queue from the other tab in the meantime.
  const advancePast = useCallback(
    (queueId) => setQueue((prev) => (prev[0]?.queueId === queueId ? prev.slice(1) : prev)),
    [setQueue]
  );
  const playNext = useCallback(() => {
    if (currentVideo) advancePast(currentVideo.queueId);
  }, [currentVideo, advancePast]);

  // A video whose owner turned embedding off is not loaded into the player: it
  // opens on youtube.com in a new tab instead, and the queue moves on after its length.
  const isExternal = Boolean(currentVideo && youtubeOnlyIds.has(currentVideo.id.videoId));
  const external = useExternalPlayback(isExternal ? currentVideo : null, {
    enabled: active && isExternal,
    autoOpen: !isPaused,
    onFinished: advancePast,
  });

  if (status === "checking") return <div className="player-page player-checking" aria-busy="true" />;
  if (!active) {
    const where = roomName || "This room";
    return status === "moved" ? (
      <PlayerNotice title="Playback moved to another device" action="Play here instead" onAction={takeOver}>
        {where} is now playing somewhere else, so this player stopped.
      </PlayerNotice>
    ) : (
      <PlayerNotice
        title={`${where} is already playing on another device`}
        action="Play here instead"
        onAction={takeOver}
      >
        Only one device plays a room at a time. Playing here stops the other device.
      </PlayerNotice>
    );
  }

  return (
    <div className="player-page">
      {/* The player stays mounted (it is the one iframe of the session), paused
          and covered while the video plays on YouTube. */}
      <VideoPlayer
        video={isExternal ? null : currentVideo}
        nextVideo={nextVideo}
        onEnd={playNext}
        onNext={playNext}
        isPaused={isPaused || isExternal}
        isRepeat={isRepeat}
        onPlayerPause={() => setIsPaused(true)}
        onPlayerPlay={() => setIsPaused(false)}
        onEmbedBlocked={(id) => recordEmbeddable([[id, false]])}
        onProgress={reportProgress}
      />
      {isExternal && <ExternalPlaybackPanel video={currentVideo} playback={external} />}
      {!currentVideo && (
        <p className="text-center player-empty px-3">
          Queue is empty. Add a video from the search tab and it will start here.
        </p>
      )}
    </div>
  );
}

export default PlayerPage;
