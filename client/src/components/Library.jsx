import { useState, useMemo, memo } from "react";
import { Modal, Button } from "react-bootstrap";
import { FaTrash, FaStar, FaHistory, FaList, FaSearch } from "react-icons/fa";
import { MdPlaylistAdd } from "react-icons/md";
import VideoList from "./VideoList";
import useLocalStorage from "../hooks/useLocalStorage";
import useFeatureFlags from "../hooks/useFeatureFlags";
import { byTitle } from "../lib/sort";
import { useFavorites } from "../hooks/useExtras";

// The list grows by this many rows each time the user scrolls near the bottom.
const PAGE_SIZE = 100;

const newDeleteCode = () => String(Math.floor(1000 + Math.random() * 9000));

// Deleting needs a typed code, so it cannot happen by accident. With a search
// (`query`) only the matching videos go; without one, the whole library.
function DeleteAllModal({ show, count, query, synced, onConfirm, onCancel }) {
  const [code, setCode] = useState(newDeleteCode);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTyped("");
    setCode(newDeleteCode());
    onCancel();
  };
  const confirm = async () => {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) close();
  };

  return (
    <Modal show={show} onHide={close} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">
          {query ? `Delete ${count} matching ${count === 1 ? "video" : "videos"}?` : "Delete the whole library?"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {query ? (
            <>
              This removes the {count} {count === 1 ? "video" : "videos"} matching <strong>“{query}”</strong>
              {synced ? " from this room's library" : " from this browser"}. The rest of your library stays.
            </>
          ) : (
            <>
              This removes all {count} saved videos
              {synced ? " from this room's library" : " from this browser"}.
            </>
          )}{" "}
          It cannot be undone.
        </p>
        <label htmlFor="delete-code" className="form-label">
          Type <strong>{code}</strong> to confirm
        </label>
        <input
          id="delete-code"
          className="form-control"
          inputMode="numeric"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value.trim())}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={typed !== code || busy}>
          {busy ? "Deleting…" : query ? `Delete ${count}` : "Delete all"}
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
  const shown = useMemo(() => {
    const base = view === "recent" ? recent : view === "favorites" ? favorites : library;
    const needle = filter.trim().toLowerCase();
    const matches = base.filter(
      (v) =>
        !needle ||
        v.snippet.title.toLowerCase().includes(needle) ||
        v.snippet.channelTitle?.toLowerCase().includes(needle)
    );
    if (view === "recent") return matches;
    return sort === "newest" ? matches.reverse() : matches.sort(byTitle);
  }, [view, recent, favorites, library, filter, sort]);

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
  // played" can show videos that are no longer in the library).
  const query = filter.trim();
  const deletable = useMemo(() => {
    if (!query) return library;
    const saved = new Set(library.map((v) => v.id.videoId));
    return shown.filter((v) => saved.has(v.id.videoId));
  }, [query, shown, library]);
  // Kept while the dialog is open, so the list can't change under the user.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const openDelete = () => {
    setDeleteTarget(query ? { query, videos: deletable } : { query: "", videos: library });
    setConfirmingDelete(true);
  };
  const confirmDelete = () =>
    deleteTarget?.query ? onDeleteMatches(deleteTarget.videos) : onClearLibrary();

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
    <div>
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
            autoFocus
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
            title={query ? "Delete only the videos this search found" : "Delete every saved video"}
            aria-label={query ? `Delete ${deletable.length} matching videos` : "Delete all"}
          >
            <FaTrash aria-hidden="true" />
            <span className="d-none d-sm-inline">
              {query ? `Delete ${deletable.length}` : "Delete all"}
            </span>
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
          synced={Boolean(syncCode)}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
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
