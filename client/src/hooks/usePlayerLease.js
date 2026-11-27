import { useCallback, useEffect, useRef, useState } from "react";
import { claimPlayer, releasePlayer } from "../api/rooms";

const HEARTBEAT_MS = 20 * 1000;
const ID_KEY = "playerId";

// crypto.randomUUID needs a secure page and a recent browser (older iPads lack it).
function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// One id per browser tab (sessionStorage), kept across reloads so a reloaded
// player gets its own lease back.
function tabPlayerId() {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    if (!id) {
      id = newId();
      sessionStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return newId();
  }
}

const isHidden = () => document.visibilityState === "hidden";

/**
 * Only one device plays a room at a time. Returns
 *   status: "checking" | "active" | "busy" (another device was already playing)
 *           | "moved" (another device took over from this one)
 *   takeOver(): make this tab the room's player.
 * If the server can't be reached the player keeps playing (fails open).
 * onSignedOut() is called when the room session is gone.
 *
 * Phones, tablets and installed apps suspend a page in the background (or when
 * the screen locks), so its renewals stop. The player tells the server when it
 * goes to the background, so its lease is kept and another device still gets
 * asked before taking over; and it checks again as soon as it is back.
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
    async ({ takeover = false, hidden = isHidden() } = {}) => {
      try {
        const result = await claimPlayer(playerId, { takeover, hidden });
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
    // A page kept in the back/forward cache (mobile Safari does this a lot) is
    // only suspended: it keeps the lease, marked hidden. Closed for good, it gives it up.
    const hide = (event) => {
      if (!event.persisted) release();
      else if (statusRef.current === "active") claim({ hidden: true });
    };
    const restored = (event) => {
      if (event.persisted && statusRef.current === "active") claim();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", restored);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", restored);
      release();
    };
  }, [claim, playerId]);

  // Renew the lease while playing, and notice when another device took over.
  // Going to the background renews it at once (marked hidden, so it is kept
  // while the page is suspended); coming back checks it at once.
  useEffect(() => {
    if (status !== "active") return;
    const timer = setInterval(() => claim(), HEARTBEAT_MS);
    const onVisibility = () => claim();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, claim]);

  const takeOver = useCallback(() => claim({ takeover: true }), [claim]);
  return { status, takeOver };
}
