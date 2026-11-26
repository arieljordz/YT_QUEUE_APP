import { useEffect, useRef } from "react";
import useLocalStorage from "./useLocalStorage";
import { useEmbeddableCache } from "./useEmbeddable";
import { getVideoDetails } from "../api/youtube";

const BATCH = 50; // the most ids one YouTube lookup takes (and costs 1 quota unit)

/**
 * Video lengths in seconds ({ videoId: seconds | null }), looked up from YouTube
 * for the given ids the first time they are needed, 50 at a time. Library
 * videos do not store their length, so this cache (kept in this browser only,
 * like the "YouTube only" one) fills it in. Each id is asked about once per visit.
 */
export default function useVideoDurations(ids) {
  const [durations, setDurations] = useLocalStorage("videoDurations", {});
  const { record } = useEmbeddableCache();
  const triedRef = useRef(new Set());

  useEffect(() => {
    const unknown = [...new Set(ids)]
      .filter((id) => !(id in durations) && !triedRef.current.has(id))
      .slice(0, BATCH);
    if (unknown.length === 0) return;
    unknown.forEach((id) => triedRef.current.add(id));
    // Not cancelled on re-run: these ids are marked as tried, so the answer must be kept.
    getVideoDetails(unknown).then((details) => {
      if (details.size === 0) return;
      setDurations((prev) => {
        const next = { ...prev };
        for (const [id, detail] of details) next[id] = detail.seconds;
        return next;
      });
      record([...details].map(([id, detail]) => [id, detail.embeddable]));
    });
    // Runs again after the cache changes, which fetches the next batch.
  }, [ids, durations, setDurations, record]);

  return durations;
}
