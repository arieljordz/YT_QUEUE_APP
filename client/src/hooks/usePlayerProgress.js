import { useCallback, useEffect, useRef, useState } from "react";
import useLocalStorage from "./useLocalStorage";
import { pushProgress } from "./useRemoteSync";
import { PROGRESS_KEY, makeSnapshot, needsNewSnapshot, positionNow } from "../lib/progress";

/**
 * For the player: returns report(reading), to call with what the YouTube player
 * says ({ queueId, position, duration, playing }) as often as you like. Only
 * readings that change the picture are saved (this device) and sent (other devices).
 */
export function useProgressReporter() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [, setProgress] = useLocalStorage(PROGRESS_KEY, null);
  const syncRef = useRef(syncCode);
  syncRef.current = syncCode;
  const lastRef = useRef(null);
  const pendingRef = useRef(null);
  const sendingRef = useRef(false);

  // One request at a time; while one is out, only the newest snapshot waits.
  const send = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    while (pendingRef.current) {
      const snapshot = pendingRef.current;
      pendingRef.current = null;
      await pushProgress(snapshot);
    }
    sendingRef.current = false;
  }, []);

  const publish = useCallback(
    (reading, now = Date.now()) => {
      const snapshot = makeSnapshot(reading, now);
      lastRef.current = snapshot;
      setProgress(snapshot);
      if (syncRef.current) {
        pendingRef.current = snapshot;
        send();
      }
    },
    [setProgress, send]
  );

  const report = useCallback(
    (reading) => {
      const now = Date.now();
      if (needsNewSnapshot(lastRef.current, reading, now)) publish(reading, now);
    },
    [publish]
  );

  // The player goes away (tab closed, room left): the card stops counting.
  useEffect(
    () => () => {
      const last = lastRef.current;
      if (!last?.playing) return;
      const now = Date.now();
      const position = Math.min(last.position + (now - last.at) / 1000, last.duration);
      publish({ queueId: last.queueId, position, duration: last.duration, playing: false }, now);
    },
    [publish]
  );

  return report;
}

/**
 * For the "Now playing" card: { position, duration } in seconds for the given
 * queue entry, counting up once a second while it plays; null when unknown.
 */
export function useNowPosition(queueId, isPaused) {
  const [snapshot] = useLocalStorage(PROGRESS_KEY, null);
  const [now, setNow] = useState(Date.now);
  const running = Boolean(snapshot?.playing) && snapshot?.queueId === queueId && !isPaused;

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, snapshot]);

  const position = positionNow(snapshot, queueId, isPaused, now);
  return position === null ? null : { position, duration: snapshot.duration };
}
