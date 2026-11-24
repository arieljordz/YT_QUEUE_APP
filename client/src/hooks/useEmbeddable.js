import { useCallback, useEffect, useMemo, useRef } from "react";
import useLocalStorage from "./useLocalStorage";
import { getVideoDetails } from "../api/youtube";

const BATCH = 50; // the most ids one YouTube lookup takes (and costs 1 quota unit)

/**
 * What this device knows about which videos can be embedded: { videoId: true | false }.
 * It is only a cache of facts from YouTube, so it is kept in this browser and not synced.
 */
export function useEmbeddableCache() {
  const [cache, setCache] = useLocalStorage("embeddableInfo", {});

  /** entries: a Map (or array of pairs) of videoId -> can it be embedded. */
  const record = useCallback(
    (entries) => {
      setCache((prev) => {
        let next = prev;
        for (const [id, embeddable] of entries) {
          if (prev[id] === embeddable) continue;
          if (next === prev) next = { ...prev };
          next[id] = embeddable;
        }
        return next;
      });
    },
    [setCache]
  );

  const youtubeOnlyIds = useMemo(
    () => new Set(Object.keys(cache).filter((id) => cache[id] === false)),
    [cache]
  );

  return { cache, record, youtubeOnlyIds };
}

/**
 * Mount once, high in the tree. Looks up the videos in the library and the queue
 * whose status is not known yet, 50 at a time (1 quota unit each time), so they
 * can be tagged "YouTube only". Each video is asked about once per visit.
 */
export function useEmbeddableLookup() {
  const [library] = useLocalStorage("videoLibrary", []);
  const [queue] = useLocalStorage("videoQueue", []);
  const { cache, record } = useEmbeddableCache();
  const triedRef = useRef(new Set());

  useEffect(() => {
    const unknown = [...new Set([...queue, ...library].map((v) => v.id.videoId))]
      .filter((id) => !(id in cache) && !triedRef.current.has(id))
      .slice(0, BATCH);
    if (unknown.length === 0) return;

    unknown.forEach((id) => triedRef.current.add(id)); // a failed lookup is not retried in a loop
    getVideoDetails(unknown).then((details) => {
      record([...details].map(([id, detail]) => [id, detail.embeddable]));
    });
    // The effect runs again after the cache changes, which fetches the next batch.
  }, [library, queue, cache, record]);
}
