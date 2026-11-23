import { useEffect } from "react";

/** True when this browser can keep the screen on. */
export const wakeLockSupported = () => typeof navigator !== "undefined" && "wakeLock" in navigator;

/**
 * Keeps the screen from dimming or locking while `active` is true. The browser
 * drops the lock whenever the tab is hidden, so it is requested again when the
 * tab comes back.
 */
export default function useWakeLock(active) {
  useEffect(() => {
    if (!active || !wakeLockSupported()) return;

    let lock = null;
    let cancelled = false;

    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) next.release();
        else lock = next;
      } catch {
        // Refused (for example low battery or a hidden tab); try again later.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) request();
    };

    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release();
    };
  }, [active]);
}
