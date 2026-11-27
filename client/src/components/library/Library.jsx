import { useState, useMemo, useCallback, memo } from "react";
import { Modal, Button } from "react-bootstrap";
import { FaTrash, FaStar, FaHistory, FaList, FaSearch } from "react-icons/fa";
import { MdPlaylistAdd } from "react-icons/md";
import VideoList from "../videos/VideoList";
import useLocalStorage from "../../hooks/useLocalStorage";
import useFeatureFlags from "../../hooks/useFeatureFlags";
import { sortedByTitle, playableFirst, matchesSearch } from "../../lib/sort";
import { useFavorites } from "../../hooks/useExtras";
import { notify } from "../../lib/notify";

// The list grows by this many rows each time the user scrolls near the bottom.
const PAGE_SIZE = 100;

// Confirms Delete all (the button itself is behind its feature flag). With a
// search (`query`) only the matching videos go; in Favorites (`favorites`) only
// the favorites; with neither, the whole library.
function DeleteAllModal({ show, count, query, favorites, synced, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) onCancel();
  };

  const videos = count === 1 ? "video" : "videos";
  const where = synced ? " from this room's library" : " from this browser";
  const partial = Boolean(query) || favorites;
  const title = !partial
    ? "Delete the whole library?"
    : `Delete ${count} ${query ? "matching " : ""}${favorites ? (count === 1 ? "favorite" : "favorites") : videos}?`;

  return (
    <Modal show={show} onHide={() => !busy && onCancel()} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {partial ? (
          <>
            This removes the {count} {favorites ? `favorite ${videos}` : videos}
            {query && (
              <>
                {" "}matching <strong>“{query}”</strong>
              </>
            )}
            {where}. The rest of your library stays.
          </>
        ) : (
          <>
            This removes all {count} saved videos{where}.
          </>
        )}{" "}
        It cannot be undone.
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={busy}>
          {busy ? "Deleting…" : partial ? `Delete ${count}` : "Delete all"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function Library({
  library,
  onAdd,
  onAddAll,
  onClearLibrary,
  onDeleteMatches,
  onRemove,
  queuedIds,
  youtubeOnlyIds,
  syncCode,
  downloading = false,
}) {
  const { flags } = useFeatureFlags();
  const { favoriteSet, toggleFavorite } = useFavorites();
  const [recent] = useLocalStorage("recentlyPlayed", []);
  const [view, setView] = useState("all"); // "all" | "favorites" | "recent"
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useLocalStorage("librarySort", "az"); // "az" | "newest"
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingQueueAll, setConfirmingQueueAll] = useState(false);

  // The list for the chosen view, narrowed by the filter box. "Recently played"
  // keeps its own order (newest first); the others are sorted A-Z or newest first.
  const favorites = useMemo(
    () => library.filter((v) => favoriteSet.has(v.id.videoId)),
    [library, favoriteSet]
  );
  // The library in the chosen order, before the search. The A-Z sort is done once
  // per library (and remembered across tab switches); typing only filters it.
  const ordered = useMemo(() => {
    if (view === "recent") return recent;
    const base = view === "favorites" ? favorites : library;
    if (sort === "newest") return [...base].reverse();
    // A-Z: playable videos first, then the YouTube-only ones, each group by title.
    // Favorites keep the library's sorted order, so they need no sort of their own.
    const sorted = sortedByTitle(library);
    const inView = view === "favorites" ? sorted.filter((v) => favoriteSet.has(v.id.videoId)) : sorted;
    return playableFirst(inView, youtubeOnlyIds);
  }, [view, recent, favorites, library, favoriteSet, sort, youtubeOnlyIds]);
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? ordered.filter((v) => matchesSearch(v, needle)) : ordered;
  }, [ordered, filter]);

  const visible = useMemo(() => shown.slice(0, visibleCount), [shown, visibleCount]);
  // Load the next page of rows when the user scrolls close to the bottom.
  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 400) {
      setVisibleCount((count) => (count < shown.length ? count + PAGE_SIZE : count));
    }
  };

  // Everything the filter matches that is not already in the queue, in the order shown.
  const queueable = useMemo(
    () => shown.filter((v) => !queuedIds.has(v.id.videoId)),
    [shown, queuedIds]
  );
  // With a search, Delete all only deletes the saved videos it found ("Recently
  // played" can show videos that are no longer in the library). In Favorites it
  // only deletes the favorites (the ones the search found, with a search).
  const query = filter.trim();
  const favoritesOnly = view === "favorites";
  const partialDelete = Boolean(query) || favoritesOnly;
  const deletable = useMemo(() => {
    if (!partialDelete) return library;
    const saved = new Set(library.map((v) => v.id.videoId));
    return shown.filter((v) => saved.has(v.id.videoId));
  }, [partialDelete, shown, library]);
  // Kept while the dialog is open, so the list can't change under the user.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const openDelete = () => {
    setDeleteTarget(
      partialDelete
        ? { partial: true, query, favorites: favoritesOnly, videos: deletable }
        : { partial: false, query: "", favorites: false, videos: library }
    );
    setConfirmingDelete(true);
  };
  const confirmDelete = () =>
    deleteTarget?.partial ? onDeleteMatches(deleteTarget.videos) : onClearLibrary();
  const deleteAllLabel = partialDelete ? `Delete ${deletable.length}` : "Delete all";
  const deleteAllTitle = query
    ? favoritesOnly
      ? "Delete only the favorites this search found"
      : "Delete only the videos this search found"
    : favoritesOnly
      ? "Delete every favorite (the rest of the library stays)"
      : "Delete every saved video";

  // Picked videos for Delete selected. Off with the flag (and in "Recently
  // played", where Remove is not offered either).
  const selectionOn = flags.librarySelection;
  const showSelection = selectionOn && view !== "recent";
  const [selected, setSelected] = useState(() => new Set());
  // Drop picks that left the library (removed here or on another device), and
  // all of them when the flag is switched off.
  const [seen, setSeen] = useState({ library, selectionOn });
  if (seen.library !== library || seen.selectionOn !== selectionOn) {
    setSeen({ library, selectionOn });
    if (selected.size > 0) {
      const saved = new Set(library.map((v) => v.id.videoId));
      const kept = selectionOn ? [...selected].filter((id) => saved.has(id)) : [];
      if (kept.length !== selected.size) setSelected(new Set(kept));
    }
  }
  const selectedVideos = useMemo(
    () => (selectionOn ? library.filter((v) => selected.has(v.id.videoId)) : []),
    [selectionOn, library, selected]
  );
  const toggleSelected = useCallback((videoId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(videoId)) next.add(videoId);
      return next;
    });
  }, []);
  // Select all works on the whole list shown (every match, not only the rows loaded so far).
  const shownSelected = useMemo(
    () => shown.reduce((n, v) => (selected.has(v.id.videoId) ? n + 1 : n), 0),
    [shown, selected]
  );
  const allShownSelected = shown.length > 0 && shownSelected === shown.length;
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const v of shown) {
        if (allShownSelected) next.delete(v.id.videoId);
        else next.add(v.id.videoId);
      }
      return next;
    });
  };
  const selectAllRef = useCallback(
    (el) => {
      if (el) el.indeterminate = shownSelected > 0 && !allShownSelected;
    },
    [shownSelected, allShownSelected]
  );

  // Delete selected: the same removal as each video's Remove button, in one go.
  const [confirmingDeleteSelected, setConfirmingDeleteSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  // Kept while the dialog is open, so the count can't change under the user.
  const [selectedTarget, setSelectedTarget] = useState([]);
  const openDeleteSelected = () => {
    setSelectedTarget(selectedVideos);
    setConfirmingDeleteSelected(true);
  };
  const confirmDeleteSelected = async () => {
    setDeletingSelected(true);
    try {
      const ok = await onDeleteMatches(selectedTarget);
      if (ok) {
        setSelected(new Set());
        setConfirmingDeleteSelected(false);
      } else {
        notify.library.selectedDeleteFailed();
      }
    } catch (err) {
      console.error("Delete selected failed", err);
      notify.library.selectedDeleteFailed();
    } finally {
      setDeletingSelected(false);
    }
  };

  // Large batches ask for confirmation first.
  const handleQueueAll = () => {
    if (queueable.length > 25) setConfirmingQueueAll(true);
    else onAddAll(queueable);
  };
  const confirmQueueAll = () => {
    setConfirmingQueueAll(false);
    onAddAll(queueable);
  };

  const views = [
    ["all", "All videos", library.length, <FaList key="all" aria-hidden="true" />],
    ["favorites", "Favorites", favorites.length, <FaStar key="fav" aria-hidden="true" />],
    ["recent", "Recently played", recent.length, <FaHistory key="rec" aria-hidden="true" />],
  ];

  return (
    <div className="library-view">
      <div className="lib-chips" role="group" aria-label="Library view">
        {views.map(([key, label, count, icon]) => (
          <button
            key={key}
            type="button"
            className={`lib-chip${view === key ? " active" : ""}`}
            onClick={() => {
              setView(key);
              setVisibleCount(PAGE_SIZE);
            }}
            aria-pressed={view === key}
          >
            {icon} {label} <span className="lib-chip-count">{count}</span>
          </button>
        ))}
      </div>

      <div className="lib-toolbar">
        <div className="lib-search">
          <FaSearch aria-hidden="true" />
          <input
            type="search"
            className="form-control"
            placeholder={view === "all" ? "Search your library by title or channel" : "Search this list"}
            aria-label="Search library"
            autoFocus={flags.librarySearchAutofocus}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        </div>
        <select
          className="form-select w-auto"
          aria-label="Sort library"
          disabled={view === "recent"}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <option value="az">Title A–Z</option>
          <option value="newest">Recently added</option>
        </select>
        <button
          className="btn yq-btn-primary text-nowrap d-flex align-items-center gap-1"
          onClick={handleQueueAll}
          disabled={queueable.length === 0}
          title={filter.trim() ? "Add every matching video to the queue" : "Add the whole library to the queue"}
        >
          <MdPlaylistAdd size={20} aria-hidden="true" />
          Queue all{queueable.length > 0 ? ` (${queueable.length})` : ""}
        </button>
        {flags.deleteAllButton && (
          <button
            className="btn yq-btn-ghost-danger text-nowrap d-flex align-items-center gap-1"
            onClick={openDelete}
            disabled={deletable.length === 0}
            title={deleteAllTitle}
            aria-label={
              partialDelete
                ? `Delete ${deletable.length} ${query ? "matching " : ""}${favoritesOnly ? "favorites" : "videos"}`
                : "Delete all"
            }
          >
            <FaTrash aria-hidden="true" />
            <span className="d-none d-sm-inline">{deleteAllLabel}</span>
          </button>
        )}
      </div>
      <Modal show={confirmingQueueAll} onHide={() => setConfirmingQueueAll(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title as="h5">Add to the queue?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {filter.trim()
            ? `Add all ${queueable.length} videos matching "${filter.trim()}" to the queue?`
            : `Add all ${queueable.length} videos in your library to the queue?`}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setConfirmingQueueAll(false)}>
            Cancel
          </Button>
          <Button className="yq-btn-primary" onClick={confirmQueueAll}>
            Queue all ({queueable.length})
          </Button>
        </Modal.Footer>
      </Modal>
      {flags.deleteAllButton && (
        <DeleteAllModal
          show={confirmingDelete}
          count={deleteTarget?.videos.length ?? 0}
          query={deleteTarget?.query ?? ""}
          favorites={Boolean(deleteTarget?.favorites)}
          synced={Boolean(syncCode)}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {flags.deleteSelectedButton && (
        <Modal
          show={confirmingDeleteSelected}
          onHide={() => !deletingSelected && setConfirmingDeleteSelected(false)}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title as="h5">
              Delete {selectedTarget.length} selected {selectedTarget.length === 1 ? "video" : "videos"}?
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            This removes the {selectedTarget.length} selected{" "}
            {selectedTarget.length === 1 ? "video" : "videos"}
            {syncCode ? " from this room's library" : " from this browser"}. It cannot be undone.
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setConfirmingDeleteSelected(false)}
              disabled={deletingSelected}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDeleteSelected} disabled={deletingSelected}>
              {deletingSelected ? "Deleting…" : `Delete ${selectedTarget.length}`}
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {showSelection && shown.length > 0 && (
        <div className="lib-selection-bar">
          <label className="lib-select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="form-check-input"
              checked={allShownSelected}
              onChange={toggleSelectAll}
              aria-label={query ? "Select all matching videos" : "Select all videos"}
            />
            Select all
          </label>
          <span className="lib-summary" aria-live="polite">
            {selectedVideos.length} selected
          </span>
          {flags.deleteSelectedButton && (
            <button
              type="button"
              className="btn btn-sm yq-btn-ghost-danger text-nowrap d-flex align-items-center gap-1 ms-auto"
              onClick={openDeleteSelected}
              disabled={selectedVideos.length === 0}
              title="Delete the selected videos"
            >
              <FaTrash aria-hidden="true" />
              Delete selected{selectedVideos.length > 0 ? ` (${selectedVideos.length})` : ""}
            </button>
          )}
        </div>
      )}

      <p className="lib-summary" aria-live="polite">
        {downloading && library.length === 0 ? null : filter.trim()
          ? `${shown.length} ${shown.length === 1 ? "match" : "matches"} for “${filter.trim()}”`
          : `${shown.length} ${shown.length === 1 ? "video" : "videos"}${view === "recent" ? ", newest first" : ""}`}
        {downloading && library.length > 0 && (
          <span className="lib-loading-inline">
            <span className="spinner-border spinner-border-sm" aria-hidden="true" /> Loading more…
          </span>
        )}
      </p>
      <div className="library-scroll" onScroll={handleScroll}>
      {downloading && library.length === 0 && view !== "recent" ? (
        // The library is still coming from the room (a page at a time).
        <div className="lib-loading" role="status">
          <span className="spinner-border" aria-hidden="true" />
          <span>Loading your library…</span>
        </div>
      ) : (
      <VideoList
        videos={visible}
        queuedIds={queuedIds}
        youtubeOnlyIds={youtubeOnlyIds}
        onAdd={onAdd}
        onRemove={flags.removeButton && view !== "recent" ? onRemove : undefined}
        selectedIds={showSelection ? selected : undefined}
        onToggleSelect={showSelection ? toggleSelected : undefined}
        favoriteSet={favoriteSet}
        onToggleFavorite={toggleFavorite}
        isLoading={false}
        hasSearched
        emptyIcon={filter.trim() ? <FaSearch aria-hidden="true" /> : views.find(([k]) => k === view)[3]}
        emptyTitle={
          filter.trim()
            ? "No matches"
            : view === "recent"
              ? "Nothing played yet"
              : view === "favorites"
                ? "No favorites yet"
                : "Your library is empty"
        }
        emptyText={
          filter.trim()
            ? "Try another title or channel name."
            : view === "recent"
              ? "Videos you play will show up here, newest first."
              : view === "favorites"
                ? "Tap the star on a video to keep it here."
                : "Videos you add to the queue are saved here automatically."
        }
      />
      )}
      </div>
      {shown.length > visible.length && (
        <p className="lib-summary text-center mt-2">
          Showing {visible.length} of {shown.length}. Scroll down to load more.
        </p>
      )}
    </div>
  );
}

export default memo(Library);
