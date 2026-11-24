import { useCallback, useEffect, useRef, useState } from "react";
import { claimPlayer, releasePlayer } from "../api/rooms";

const HEARTBEAT_MS = 20 * 1000;
const ID_KEY = "playerId";

// One id per browser tab (sessionStorage), kept across reloads so a reloaded
// player gets its own lease back.
function tabPlayerId() {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Only one device plays a room at a time. Returns
 *   status: "checking" | "active" | "busy" (another device was already playing)
 *           | "moved" (another device took over from this one)
 *   takeOver(): make this tab the room's player.
 * If the server can't be reached the player keeps playing (fails open).
 * onSignedOut() is called when the room session is gone.
 */
export default function usePlayerLease(onSignedOut) {
  const [status, setStatus] = useState("checking");
  const [playerId] = useState(tabPlayerId);
  const statusRef = useRef(status);
  const signedOut = useRef(onSignedOut);
  useEffect(() => {
    statusRef.current = status;
    signedOut.current = onSignedOut;
  });

  const claim = useCallback(
    async (takeover = false) => {
      try {
        const result = await claimPlayer(playerId, takeover);
        if (result.status === 401) return signedOut.current?.();
        if (!result.ok) {
          if (statusRef.current === "checking") setStatus("active");
          return;
        }
        if (result.data.active) setStatus("active");
        else setStatus(statusRef.current === "active" ? "moved" : "busy");
      } catch {
        // offline: keep playing
        if (statusRef.current === "checking") setStatus("active");
      }
    },
    [playerId]
  );

  useEffect(() => {
    claim();
    const release = () => releasePlayer(playerId);
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [claim, playerId]);

  // Renew the lease while playing, and notice when another device took over.
  useEffect(() => {
    if (status !== "active") return;
    const timer = setInterval(() => claim(), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [status, claim]);

  const takeOver = useCallback(() => claim(true), [claim]);
  return { status, takeOver };
}
