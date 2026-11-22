import { useCallback, useEffect } from "react";
import useLocalStorage from "./useLocalStorage";

// Every flag and its default. The delete buttons are hidden until switched on.
export const FEATURE_FLAGS = {
  removeButton: false,
  deleteAllButton: false,
};

const REFRESH_MS = 30000;

async function postFlags(syncCode, body) {
  const response = await fetch("/api/flags", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sync-code": syncCode },
    body: JSON.stringify(body),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  // Local dev (plain vite) has no /api route and answers with HTML or 404.
  if (!isJson || response.status === 404) {
    throw new Error("Shared flags only work on the deployed site.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not save the flag.");
  return data;
}

/**
 * Feature flags. Without a sync code they are saved in this browser only. With
 * one, the server holds them (so every device agrees and the server refuses
 * the deletes while they are off), and changing one needs the flags password.
 */
export default function useFeatureFlags() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [stored, setStored] = useLocalStorage("featureFlags", {});
  const [locked, setLocked] = useLocalStorage("featureFlagsLocked", false);
  const flags = { ...FEATURE_FLAGS, ...stored };

  /** Rejects with an Error whose message can be shown to the user. */
  const setFlag = useCallback(
    async (name, enabled, password) => {
      if (!syncCode) {
        setStored((prev) => ({ ...prev, [name]: enabled }));
        return;
      }
      const data = await postFlags(syncCode, { flags: { [name]: enabled }, password });
      setStored(data.flags);
      setLocked(data.locked);
    },
    [syncCode, setStored, setLocked]
  );

  return { flags, setFlag, locked, synced: Boolean(syncCode) };
}

/**
 * Keeps this device's flags in step with the server. Mount it once, high in
 * the tree. Flags changed on another device show up within about 30 seconds,
 * or as soon as this tab is focused again.
 */
export function useFeatureFlagsSync() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [, setStored] = useLocalStorage("featureFlags", {});
  const [, setLocked] = useLocalStorage("featureFlagsLocked", false);

  useEffect(() => {
    if (!syncCode) return;
    let cancelled = false;

    const load = async () => {
      try {
        const data = await postFlags(syncCode, {});
        if (cancelled) return;
        setStored(data.flags);
        setLocked(data.locked);
      } catch {
        // Offline or not deployed: keep the last known flags.
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [syncCode, setStored, setLocked]);
}
