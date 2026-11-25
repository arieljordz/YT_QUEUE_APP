import { useCallback, useEffect, useRef, useState } from "react";
import useLocalStorage from "./useLocalStorage";
import { getVideoDetails } from "../api/youtube";
import { notify } from "../lib/notify";

/**
 * Playback on youtube.com for a video whose owner turned embedding off.
 *
 * The video opens in a new tab by itself when the queue reaches it. Browsers
 * block that unless pop-ups are allowed for this site; then the panel's button
 * opens it (a click is always allowed). The queue moves on once the video's
 * length has passed, and the page tries to close the tab it opened. The app cannot
 * see that tab: it does not know whether the video started, was paused or
 * finished, so the time is only an estimate from the video's length.
 *
 * The session ({ queueId, videoId, endsAt }) is kept in localStorage, so a
 * reload carries on with the same deadline instead of starting over. The tab
 * itself cannot be found again after a reload.
 */
const SESSION_KEY = "externalPlayback";
const TAB_NAME = "queueup-youtube"; // the same named tab is reused, not a new one each time
// The new tab needs a moment to load before the video starts.
const LOAD_ALLOWANCE_MS = 5000;
const MAX_SECONDS = 12 * 60 * 60;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export const isValidVideoId = (id) => typeof id === "string" && VIDEO_ID.test(id);
const isValidSeconds = (s) => Number.isFinite(s) && s > 0 && s <= MAX_SECONDS;

// Lengths already looked up in this visit (1 quota unit per lookup).
const secondsCache = new Map();

/** The video's length in seconds: undefined while looking it up, null if unknown. */
function useVideoSeconds(videoId, enabled) {
  const [seconds, setSeconds] = useState(() => secondsCache.get(videoId));
  useEffect(() => {
    if (!enabled || !isValidVideoId(videoId)) {
      setSeconds(null);
      return;
    }
    if (secondsCache.has(videoId)) {
      setSeconds(secondsCache.get(videoId));
      return;
    }
    setSeconds(undefined);
    const controller = new AbortController();
    getVideoDetails([videoId], controller.signal).then((details) => {
      if (controller.signal.aborted) return;
      const value = details.get(videoId)?.seconds;
      const valid = isValidSeconds(value) ? value : null;
      secondsCache.set(videoId, valid);
      setSeconds(valid);
    });
    return () => controller.abort();
  }, [videoId, enabled]);
  return seconds;
}

/**
 * video: the queue entry at the head, when it can only play on YouTube (else null).
 * enabled: this device is the active player.
 * autoOpen: open the tab without a click when the queue reaches it (not while paused).
 * onFinished(queueId): move the queue past that entry.
 */
export default function useExternalPlayback(video, { enabled, autoOpen = true, onFinished }) {
  const queueId = video?.queueId ?? null;
  const videoId = video?.id?.videoId ?? null;
  const seconds = useVideoSeconds(videoId, enabled && Boolean(video));

  const [session, setSession] = useLocalStorage(SESSION_KEY, null);
  const [blocked, setBlocked] = useState(false);
  const tabRef = useRef(null); // { queueId, win } for the tab this page opened
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  const active = Boolean(session && queueId && session.queueId === queueId);

  /**
   * Try to close the tab this page opened. Says so when it may still be open,
   * including a tab opened before a reload, which this page can't reach anymore.
   */
  const closeTab = useCallback((hadTab) => {
    const tab = tabRef.current;
    tabRef.current = null;
    if (!tab) {
      if (hadTab) notify.external.tabMayBeOpen();
      return;
    }
    // YouTube cuts the link back to this page (its opener policy), so the handle
    // often reports "closed" while the tab is really still open. Only a tab that
    // read as open before and as closed after counts as closed.
    const wasOpen = !tab.win.closed;
    try {
      tab.win.close();
    } catch {
      // The browser refused.
    }
    setTimeout(() => {
      if (!(wasOpen && tab.win.closed)) notify.external.tabMayBeOpen();
    }, 300);
  }, []);

  /** Leave this entry: close its tab, forget the session and move the queue on. */
  const finish = useCallback(() => {
    if (!queueId) return;
    closeTab(active);
    setSession(null);
    setBlocked(false);
    finishedRef.current?.(queueId);
  }, [queueId, active, closeTab, setSession]);

  /**
   * Open the video on YouTube. From a click it always works; on its own
   * (`auto`) the browser allows it only when pop-ups are allowed for this site.
   */
  const open = useCallback((auto = false) => {
    if (!enabled || !queueId || !isValidVideoId(videoId)) return;
    const existing = tabRef.current;
    if (active) {
      // One tab per queue entry: bring the open one forward instead.
      if (existing && !existing.win.closed) existing.win.focus();
      return;
    }
    const win = window.open(`https://www.youtube.com/watch?v=${videoId}`, TAB_NAME);
    if (!win) {
      setBlocked(auto === true ? "auto" : "click");
      return;
    }
    try {
      win.opener = null; // YouTube's page gets no handle back to this one
    } catch {
      // Not allowed in this browser; YouTube's own policy cuts it anyway.
    }
    tabRef.current = { queueId, win };
    setBlocked(false);
    setSession({
      queueId,
      videoId,
      // No length, no timer: the user moves on with "Play next".
      endsAt: isValidSeconds(seconds) ? Date.now() + seconds * 1000 + LOAD_ALLOWANCE_MS : null,
    });
  }, [enabled, queueId, videoId, active, seconds, setSession]);

  // The head changed (skipped, removed, reordered, cleared): drop the old
  // session, its timer and, if possible, its tab.
  useEffect(() => {
    if (!enabled) return;
    setBlocked(false);
    if (session && session.queueId !== queueId) {
      closeTab(true);
      setSession(null);
    }
    // Only the head moving matters here, not the session being set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, enabled]);

  // Open the tab by itself once the queue reaches the video (and its length is
  // known, so the timer can start). Tried once per queue entry: a blocked
  // attempt is not repeated, the panel's button takes over.
  const autoTriedRef = useRef(null);
  useEffect(() => {
    if (!enabled || !autoOpen || !queueId || active || seconds === undefined) return;
    if (autoTriedRef.current === queueId) return;
    autoTriedRef.current = queueId;
    open(true);
  }, [enabled, autoOpen, queueId, active, seconds, open]);

  // The one timer: when the estimated time is up, move on. After a reload whose
  // deadline already passed, this moves on right away.
  const endsAt = active ? session.endsAt : null;
  useEffect(() => {
    if (!enabled || !endsAt) return;
    const timer = setTimeout(finish, Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [enabled, endsAt, finish]);

  return {
    active,
    endsAt,
    seconds, // undefined while looking up, null when unknown
    blocked, // false, "auto" (opening by itself was blocked) or "click"
    validId: isValidVideoId(videoId),
    open,
    finish,
  };
}
