import { useCallback, useEffect, useMemo, useRef } from "react";
import useLocalStorage from "./useLocalStorage";
import { postExtras } from "../api/extras";
import { slimVideo } from "../lib/library";

const REFRESH_MS = 30000;
const MAX_HISTORY = 50;

/**
 * Favorites (ids of starred videos) and recently played (newest first). Both
 * live in this browser; with a sync code they are also saved on the server so
 * every device agrees. Writes are small operations ("add this id"), so two
 * devices do not overwrite each other.
 */

/** Mount once, high in the tree: pulls the server's lists now and then. */
export function useExtrasSync() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [favoriteIds, setFavoriteIds] = useLocalStorage("favoriteIds", []);
  const [, setHistory] = useLocalStorage("recentlyPlayed", []);
  const favoritesRef = useRef(favoriteIds);
  favoritesRef.current = favoriteIds;

  useEffect(() => {
    if (!syncCode) return;
    let cancelled = false;

    const load = async (body = {}) => {
      try {
        const data = await postExtras(body);
        if (cancelled) return;
        setFavoriteIds(data.favorites);
        setHistory(data.history);
      } catch {
        // Offline or not deployed: keep what this device has.
      }
    };
    // First contact: hand over the favorites this device already has, then follow the server.
    load(favoritesRef.current.length > 0 ? { favorites: { add: favoritesRef.current } } : {});
    const timer = setInterval(() => load(), REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [syncCode, setFavoriteIds, setHistory]);
}

export function useFavorites() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [favoriteIds, setFavoriteIds] = useLocalStorage("favoriteIds", []);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const toggleFavorite = useCallback(
    (videoId) => {
      const adding = !favoriteSet.has(videoId);
      setFavoriteIds((prev) =>
        adding ? [...prev, videoId] : prev.filter((id) => id !== videoId)
      );
      if (syncCode) {
        postExtras({
          favorites: adding ? { add: [videoId] } : { remove: [videoId] },
        }).catch(() => {});
      }
    },
    [favoriteSet, setFavoriteIds, syncCode]
  );

  return { favoriteSet, toggleFavorite };
}

/** Returns a function that records a song as just played. */
export function useRecordPlayed() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [, setHistory] = useLocalStorage("recentlyPlayed", []);

  return useCallback(
    (video) => {
      const slim = slimVideo(video);
      if (!slim) return;
      setHistory((prev) =>
        [slim, ...prev.filter((v) => v.id.videoId !== slim.id.videoId)].slice(0, MAX_HISTORY)
      );
      if (syncCode) postExtras({ played: slim }).catch(() => {});
    },
    [setHistory, syncCode]
  );
}
