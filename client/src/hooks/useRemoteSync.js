import { useEffect, useRef, useState } from "react";
import useLocalStorage from "./useLocalStorage";
import { slimVideo } from "../lib/library";
import { PROGRESS_KEY } from "../lib/progress";
import { VOLUME_KEY, MUTED_KEY, DEFAULT_VOLUME, isVolume } from "../lib/volume";

const POLL_MS = 3000;
// A hidden tab with nothing playing has no need to follow remote changes quickly.
const IDLE_POLL_MS = 15000;
const PUSH_DELAY_MS = 400;

const slimQueueItem = (video) => {
  const slim = slimVideo(video);
  return slim && { ...slim, queueId: video.queueId };
};

function serialize({ queue, isPaused, isRepeat, volume, isMuted }) {
  return JSON.stringify({
    queue: queue.map(slimQueueItem).filter(Boolean),
    isPaused,
    isRepeat,
    volume: isVolume(volume) ? volume : DEFAULT_VOLUME,
    isMuted: isMuted === true,
  });
}

async function callQueueApi(body, signal) {
  const response = await fetch("/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  // Local dev (plain vite) has no /api route and answers with HTML or 404.
  if (!isJson || response.status === 404) throw new Error("unavailable");
  if (!response.ok) throw new Error("error");
  return response.json();
}

/**
 * Sends where the player is in the video, for the other devices' "Now playing"
 * card. Best effort: a lost update is corrected by the next one.
 */
export function pushProgress({ id, queueId, position, duration, playing }) {
  return callQueueApi({ progress: { id, queueId, position, duration, playing } }).catch(() => {});
}

/**
 * Keeps the queue, pause, repeat and volume state identical on every device that
 * uses the same sync code. The state lives in MongoDB (/api/queue): each device
 * saves its changes and polls for the other devices' changes every few
 * seconds. Mount it once, high in the tree, so it runs on every page.
 *
 * Rules: the whole state is saved on every change and the latest save wins.
 * A device that connects adopts the saved state if there is one; otherwise it
 * seeds the server with its own.
 *
 * Returns "off" | "connecting" | "connected" | "reconnecting" | "unavailable" | "error".
 */
export default function useRemoteSync() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused, setIsPaused] = useLocalStorage("isPaused", false);
  const [isRepeat, setIsRepeat] = useLocalStorage("isRepeat", false);
  const [volume, setVolume] = useLocalStorage(VOLUME_KEY, DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useLocalStorage(MUTED_KEY, false);
  const [, setProgress] = useLocalStorage(PROGRESS_KEY, null);
  const [status, setStatus] = useState("off");

  const stateRef = useRef({ queue, isPaused, isRepeat, volume, isMuted });
  stateRef.current = { queue, isPaused, isRepeat, volume, isMuted };
  // What the server is known to hold (as a string) and its revision.
  const syncedJsonRef = useRef(null);
  const revRef = useRef(-1);
  const busyRef = useRef(false); // a save is pending or in flight
  const pushNowRef = useRef(null);

  // Connect, then poll for changes made on other devices.
  useEffect(() => {
    if (!syncCode) {
      setStatus("off");
      return;
    }

    const controller = new AbortController();
    let timer;
    let cancelled = false;
    setStatus("connecting");
    revRef.current = -1;
    syncedJsonRef.current = null;

    const adopt = (state, rev) => {
      revRef.current = rev;
      syncedJsonRef.current = serialize(state);
      setQueue(state.queue);
      setIsPaused(state.isPaused);
      // An older server does not know about repeat; keep this device's setting then.
      if (typeof state.isRepeat === "boolean") setIsRepeat(state.isRepeat);
      // The same for volume (an older server does not keep it).
      if (isVolume(state.volume)) setVolume(state.volume);
      if (typeof state.isMuted === "boolean") setIsMuted(state.isMuted);
    };

    const push = async () => {
      const json = serialize(stateRef.current);
      if (json === syncedJsonRef.current) return;
      const { rev } = await callQueueApi({ push: JSON.parse(json) }, controller.signal);
      revRef.current = rev;
      syncedJsonRef.current = json;
    };
    pushNowRef.current = push;

    // The player's latest position, placed on this device's clock. A newer
    // snapshot already here (this device may be the player) is kept.
    const adoptProgress = (remote) => {
      if (!remote?.id) return;
      const at = Date.now() - (remote.age ?? 0);
      setProgress((local) =>
        local?.id === remote.id || (local && local.at >= at)
          ? local
          : {
              id: remote.id,
              queueId: remote.queueId,
              position: remote.position,
              duration: remote.duration,
              playing: remote.playing,
              at,
            }
      );
    };

    const poll = async () => {
      // Do not overwrite local changes that have not been saved yet.
      if (!busyRef.current) {
        try {
          const result = await callQueueApi({ rev: revRef.current }, controller.signal);
          if (cancelled) return;
          adoptProgress(result.progress);
          if (!result.exists) {
            // Nothing saved yet for this code: seed it with this device's state.
            await push();
          } else if (result.changed && !busyRef.current) {
            adopt(result.state, result.rev);
          } else {
            revRef.current = result.rev;
          }
          setStatus("connected");
        } catch (err) {
          if (cancelled || err.name === "AbortError") return;
          // "error" = the server answered with a failure (e.g. database not set up);
          // anything else is a network problem and is retried.
          setStatus(
            err.message === "unavailable"
              ? "unavailable"
              : err.message === "error"
                ? "error"
                : "reconnecting"
          );
          if (err.message === "unavailable") return; // nothing to retry against
        }
      }
      const hiddenAndIdle = document.hidden && stateRef.current.isPaused;
      timer = setTimeout(poll, hiddenAndIdle ? IDLE_POLL_MS : POLL_MS);
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
      pushNowRef.current = null;
    };
  }, [syncCode, setQueue, setIsPaused, setIsRepeat, setVolume, setIsMuted, setProgress]);

  // Save local changes shortly after they happen.
  useEffect(() => {
    if (status !== "connected") return;
    if (serialize({ queue, isPaused, isRepeat, volume, isMuted }) === syncedJsonRef.current) return;

    busyRef.current = true;
    const timer = setTimeout(async () => {
      try {
        await pushNowRef.current?.();
      } catch {
        // The next poll reports the connection problem; the change is retried
        // on the next local change or reconnect.
      } finally {
        busyRef.current = false;
      }
    }, PUSH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      busyRef.current = false;
    };
  }, [queue, isPaused, isRepeat, volume, isMuted, status]);

  return status;
}
