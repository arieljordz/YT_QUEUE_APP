import { useEffect, useRef } from "react";
import { decodeHtml } from "../lib/text";

const supported = () => typeof navigator !== "undefined" && "mediaSession" in navigator;
const ACTIONS = ["play", "pause", "nexttrack"];

/**
 * Lock-screen and notification controls for the player (Media Session API).
 *
 * A phone pauses the YouTube player when the screen locks or the app is
 * switched; the page can't prevent that. These controls let the user resume
 * (or skip) from the lock screen without opening the app again, on the
 * browsers that show them for this page.
 *
 * video: the song playing now (null: nothing to show).
 * handlers: { play, pause, nexttrack } — nexttrack only offered when `hasNext`.
 */
export default function useMediaSession(video, { isPaused, hasNext, handlers }) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // What is playing: title, channel and thumbnail.
  const title = video?.snippet?.title;
  const channel = video?.snippet?.channelTitle;
  const thumbs = video?.snippet?.thumbnails;
  const artworkUrl = (thumbs?.high ?? thumbs?.medium ?? thumbs?.default)?.url;
  useEffect(() => {
    if (!supported()) return;
    try {
      navigator.mediaSession.metadata =
        title && typeof MediaMetadata !== "undefined"
          ? new MediaMetadata({
              title: decodeHtml(title),
              artist: channel ? decodeHtml(channel) : "",
              artwork: artworkUrl ? [{ src: artworkUrl }] : [],
            })
          : null;
    } catch {
      // An older browser without full Media Session support.
    }
  }, [title, channel, artworkUrl]);

  useEffect(() => {
    if (!supported()) return;
    navigator.mediaSession.playbackState = !video ? "none" : isPaused ? "paused" : "playing";
  }, [video, isPaused]);

  // The buttons. They call through a ref, so they always use the latest handlers.
  useEffect(() => {
    if (!supported()) return;
    const set = (action, enabled) => {
      try {
        navigator.mediaSession.setActionHandler(
          action,
          enabled ? () => handlersRef.current?.[action]?.() : null
        );
      } catch {
        // This browser doesn't know the action.
      }
    };
    set("play", Boolean(video));
    set("pause", Boolean(video));
    set("nexttrack", Boolean(video) && hasNext);
    return () => ACTIONS.forEach((action) => set(action, false));
  }, [video, hasNext]);

  // Gone with the player: clear what the lock screen shows.
  useEffect(
    () => () => {
      if (!supported()) return;
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
      } catch {
        // ignore
      }
    },
    []
  );
}
