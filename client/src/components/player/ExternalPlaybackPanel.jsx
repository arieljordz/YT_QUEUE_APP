import { useEffect, useState } from "react";
import { FaYoutube } from "react-icons/fa";
import { decodeHtml } from "../../lib/text";
import { formatDuration } from "../../lib/format";
import { formatClock } from "../../lib/progress";
import YoutubeOnlyBadge from "../videos/YoutubeOnlyBadge";

/** Seconds left until `endsAt` (ms), counted down once a second. */
function useSecondsLeft(endsAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);
  return endsAt ? Math.max(0, (endsAt - now) / 1000) : null;
}

/**
 * Covers the player while the queue is at a video that only plays on youtube.com.
 * `playback` comes from useExternalPlayback.
 */
export default function ExternalPlaybackPanel({ video, playback }) {
  const { active, endsAt, seconds, blocked, validId, open, finish } = playback;
  const secondsLeft = useSecondsLeft(endsAt);
  const title = decodeHtml(video.snippet?.title ?? "");
  const length = formatDuration(seconds);

  let text;
  if (!validId) {
    text = "This video has no valid YouTube link, so it can't be opened. Skip to the next video.";
  } else if (active && endsAt) {
    text = `Opened on YouTube. The queue moves on in about ${formatClock(secondsLeft)}, going by the video's length. This page can't see the YouTube tab, so it can't tell whether the video is really playing.`;
  } else if (active) {
    text = "Opened on YouTube. This video's length is unknown, so press Play next when you're done.";
  } else if (seconds === undefined) {
    text = "The owner only allows this video on youtube.com. Looking up its length…";
  } else if (length) {
    text = `The owner only allows this video on youtube.com. Open it there, and the queue moves on after its length (${length}).`;
  } else {
    text = "The owner only allows this video on youtube.com. Its length is unknown, so after watching press Play next.";
  }

  return (
    <div className="external-panel" role="status">
      <YoutubeOnlyBadge />
      <h2 className="external-title text-truncate-2" title={title}>
        {title}
      </h2>
      <p className="external-text">{text}</p>
      {blocked && (
        <p className="external-warning" role="alert">
          {blocked === "auto"
            ? "Your browser stopped the YouTube tab from opening by itself. Allow pop-ups for this site so these videos open automatically, or press Watch on YouTube."
            : "Your browser blocked the new tab. Allow pop-ups for this site, then try again."}
        </p>
      )}
      <div className="external-actions">
        {validId && !active && (
          <button type="button" className="btn player-notice-btn d-inline-flex align-items-center gap-2" onClick={() => open()}>
            <FaYoutube aria-hidden="true" /> Watch on YouTube
          </button>
        )}
        <button type="button" className="btn btn-outline-light" onClick={finish}>
          {active ? "Play next now" : "Skip"}
        </button>
      </div>
    </div>
  );
}
