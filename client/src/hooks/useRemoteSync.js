import { useEffect, useRef, useState } from "react";
import useLocalStorage from "./useLocalStorage";
import { slimVideo } from "../lib/library";

// Ably messages are limited to 64 KB; stay safely under it.
const MAX_PAYLOAD_CHARS = 56000;
const PUBLISH_DELAY_MS = 400;

const slimQueueItem = (video) => {
  const slim = slimVideo(video);
  return slim && { ...slim, queueId: video.queueId };
};

// If the played list pushes the message over the limit it is left out
// (played: null) and the other devices keep their own.
function serialize(queue, isPaused, played) {
  const base = {
    queue: queue.map(slimQueueItem).filter(Boolean),
    isPaused,
  };
  const full = JSON.stringify({ ...base, played: played.map(slimVideo).filter(Boolean) });
  return full.length <= MAX_PAYLOAD_CHARS ? full : JSON.stringify({ ...base, played: null });
}

async function fetchToken(syncCode) {
  const response = await fetch("/api/ably-token", {
    method: "POST",
    headers: { "x-sync-code": syncCode },
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (!isJson || response.status === 404) throw new Error("unavailable");
  if (!response.ok) throw new Error("error");
  return response.json();
}

const CONNECTION_STATUS = {
  connected: "connected",
  connecting: "connecting",
  initialized: "connecting",
  disconnected: "reconnecting",
  suspended: "reconnecting",
  failed: "error",
  closed: "off",
};

/**
 * Keeps the queue, pause state and played list identical on every device that
 * uses the same sync code, in real time (Ably pub/sub). Mount it once, high in
 * the tree, so it runs on both the search page and the player page.
 *
 * Rules: every change is published as the whole state; the latest message
 * wins. A device that connects asks the others for their state and adopts it,
 * so the devices that are already online are the source of truth on join.
 *
 * Returns the connection status: "off" | "connecting" | "connected" |
 * "reconnecting" | "unavailable" | "error".
 */
export default function useRemoteSync() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused, setIsPaused] = useLocalStorage("isPaused", false);
  const [played, setPlayed] = useLocalStorage("playedVideos", []);
  const [status, setStatus] = useState("off");

  const channelRef = useRef(null);
  const lastSentRef = useRef(null);
  const deviceIdRef = useRef(Math.random().toString(36).slice(2));
  const stateRef = useRef({ queue, isPaused, played });
  stateRef.current = { queue, isPaused, played };

  // Connect / disconnect with the sync code.
  useEffect(() => {
    if (!syncCode) {
      setStatus("off");
      return;
    }

    let cancelled = false;
    let client = null;
    const deviceId = deviceIdRef.current;
    setStatus("connecting");

    const publishState = () => {
      const { queue, isPaused, played } = stateRef.current;
      const json = serialize(queue, isPaused, played);
      lastSentRef.current = json;
      channelRef.current?.publish("state", { from: deviceId, json });
    };

    (async () => {
      try {
        const [{ Realtime }, first] = await Promise.all([
          import("ably"),
          fetchToken(syncCode),
        ]);
        if (cancelled) return;

        let pending = first;
        client = new Realtime({
          authCallback: (_params, callback) => {
            const next = pending ? Promise.resolve(pending) : fetchToken(syncCode);
            pending = null;
            next.then((r) => callback(null, r.tokenRequest), (e) => callback(e, null));
          },
          echoMessages: false,
        });

        const channel = client.channels.get(first.channel);
        channelRef.current = channel;

        await channel.subscribe((message) => {
          if (message.data?.from === deviceId) return;

          if (message.name === "request") {
            publishState();
          } else if (message.name === "state") {
            const state = JSON.parse(message.data.json);
            // Remember it as already sent so applying it does not echo back.
            lastSentRef.current = message.data.json;
            setQueue(state.queue);
            setIsPaused(state.isPaused);
            if (state.played) setPlayed(state.played);
          }
        });

        const handleConnection = (current) => {
          if (cancelled) return;
          setStatus(CONNECTION_STATUS[current] ?? "connecting");
          // (Re)connected: do not publish our possibly stale state, ask for theirs.
          if (current === "connected") {
            lastSentRef.current = serialize(
              stateRef.current.queue,
              stateRef.current.isPaused,
              stateRef.current.played
            );
            channel.publish("request", { from: deviceId });
          }
        };
        client.connection.on((change) => handleConnection(change.current));
        // Subscribing waits for the connection, so it may already be up.
        handleConnection(client.connection.state);
      } catch (err) {
        if (!cancelled) setStatus(err.message === "unavailable" ? "unavailable" : "error");
      }
    })();

    return () => {
      cancelled = true;
      channelRef.current = null;
      lastSentRef.current = null;
      client?.close();
    };
  }, [syncCode, setQueue, setIsPaused, setPlayed]);

  // Publish local changes shortly after they happen.
  useEffect(() => {
    if (status !== "connected" || !channelRef.current) return;
    const timer = setTimeout(() => {
      const json = serialize(queue, isPaused, played);
      if (json === lastSentRef.current) return;
      lastSentRef.current = json;
      channelRef.current?.publish("state", { from: deviceIdRef.current, json });
    }, PUBLISH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [queue, isPaused, played, status]);

  return status;
}
