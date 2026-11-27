import { useCallback, useMemo, useState } from "react";
import { FaSearch, FaList } from "react-icons/fa";
import VideoList from "../videos/VideoList";
import { sortedByTitle, playableFirst, matchesSearch } from "../../lib/sort";

// The list grows by this many rows each time the user scrolls near the bottom.
const PAGE_SIZE = 100;
const NO_IDS = new Set();

/**
 * Picks Library videos for a playlist: a search box, Select all and the
 * Library's row checkboxes. `selected` is a Set of video ids in the order they
 * were picked (that becomes the playlist's order); `excludeIds` are left out
 * (the videos already in the playlist).
 */
export default function VideoPicker({ library, selected, onChange, excludeIds = NO_IDS, youtubeOnlyIds }) {
  const [filter, setFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Playable videos first, then the YouTube-only ones, each group by title (the
  // library's title sort is shared with the Library tab and done once).
  const candidates = useMemo(
    () =>
      playableFirst(
        sortedByTitle(library).filter((v) => !excludeIds.has(v.id.videoId)),
        youtubeOnlyIds
      ),
    [library, excludeIds, youtubeOnlyIds]
  );
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? candidates.filter((v) => matchesSearch(v, needle)) : candidates;
  }, [candidates, filter]);
  const visible = useMemo(() => shown.slice(0, visibleCount), [shown, visibleCount]);

  const toggle = useCallback(
    (videoId) => {
      const next = new Set(selected);
      if (!next.delete(videoId)) next.add(videoId);
      onChange(next);
    },
    [selected, onChange]
  );

  const shownSelected = useMemo(
    () => shown.reduce((n, v) => (selected.has(v.id.videoId) ? n + 1 : n), 0),
    [shown, selected]
  );
  const allShownSelected = shown.length > 0 && shownSelected === shown.length;
  const toggleAll = () => {
    const next = new Set(selected);
    for (const v of shown) {
      if (allShownSelected) next.delete(v.id.videoId);
      else next.add(v.id.videoId);
    }
    onChange(next);
  };
  const selectAllRef = useCallback(
    (el) => {
      if (el) el.indeterminate = shownSelected > 0 && !allShownSelected;
    },
    [shownSelected, allShownSelected]
  );

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 400) {
      setVisibleCount((count) => (count < shown.length ? count + PAGE_SIZE : count));
    }
  };

  return (
    <div className="pl-picker">
      <div className="lib-toolbar">
        <div className="lib-search">
          <FaSearch aria-hidden="true" />
          <input
            type="search"
            className="form-control"
            placeholder="Search your library by title or channel"
            aria-label="Search library videos to add"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        </div>
      </div>
      <div className="lib-selection-bar">
        <label className="lib-select-all">
          <input
            ref={selectAllRef}
            type="checkbox"
            className="form-check-input"
            checked={allShownSelected}
            disabled={shown.length === 0}
            onChange={toggleAll}
            aria-label={filter.trim() ? "Select all matching videos" : "Select all videos"}
          />
          Select all
        </label>
        <span className="lib-summary" aria-live="polite">
          <strong>{selected.size}</strong> selected
          {filter.trim() ? ` · ${shown.length} ${shown.length === 1 ? "match" : "matches"}` : ""}
        </span>
      </div>
      <div className="library-scroll pl-picker-scroll mt-2" onScroll={handleScroll}>
        <VideoList
          videos={visible}
          queuedIds={NO_IDS}
          youtubeOnlyIds={youtubeOnlyIds}
          selectedIds={selected}
          onToggleSelect={toggle}
          isLoading={false}
          hasSearched
          emptyIcon={filter.trim() ? <FaSearch aria-hidden="true" /> : <FaList aria-hidden="true" />}
          emptyTitle={filter.trim() ? "No matches" : candidates.length === 0 && library.length > 0 ? "Everything is already in" : "Your library is empty"}
          emptyText={
            filter.trim()
              ? "Try another title or channel name."
              : candidates.length === 0 && library.length > 0
                ? "Every video in your library is already in this playlist."
                : "Videos you add to the queue are saved in your library, ready for playlists."
          }
        />
      </div>
    </div>
  );
}
