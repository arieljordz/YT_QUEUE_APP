import { useCallback, useEffect } from "react";
import useLocalStorage from "./useLocalStorage";

// Every flag and its default (same as DEFAULT_FLAGS in api/flags.js). Both
// themes are on; the delete buttons are hidden until switched on.
export const FEATURE_FLAGS = {
  lightMode: true,
  darkMode: true,
  removeButton: false,
  deleteAllButton: false,
  deleteListButton: false,
};

const REFRESH_MS = 30000;

async function postFlags(body) {
  const response = await fetch("/api/flags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  // Local dev (plain vite) has no /api route and answers with HTML or 404.
  if (!isJson || response.status === 404) {
    throw new Error("Shared flags only work on the deployed site.");
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? "Could not save the flag.");
    error.adminRequired = Boolean(data.adminRequired);
    throw error;
  }
  return data;
}

/**
 * Feature flags, the same for the whole app. In a room the server holds them
 * (so every device agrees and the server refuses the deletes while they are
 * off), and changing one needs the admin sign-in.
 */
export default function useFeatureFlags() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [stored, setStored] = useLocalStorage("featureFlags", {});
  const flags = { ...FEATURE_FLAGS, ...stored };

  /** Rejects with an Error whose message can be shown (and .adminRequired). */
  const setFlag = useCallback(
    async (name, enabled) => {
      if (!syncCode) {
        setStored((prev) => ({ ...prev, [name]: enabled }));
        return;
      }
      const data = await postFlags({ flags: { [name]: enabled } });
      setStored(data.flags);
    },
    [syncCode, setStored]
  );

  return { flags, setFlag, synced: Boolean(syncCode) };
}

/**
 * Keeps this device's flags in step with the server. Mount it once, high in
 * the tree. Flags changed on another device show up within about 30 seconds,
 * or as soon as this tab is focused again.
 */
export function useFeatureFlagsSync() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [, setStored] = useLocalStorage("featureFlags", {});

  useEffect(() => {
    if (!syncCode) return;
    let cancelled = false;

    const load = async () => {
      try {
        const data = await postFlags({});
        if (cancelled) return;
        setStored(data.flags);
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
  }, [syncCode, setStored]);
}
