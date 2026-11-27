import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { notify } from "../../lib/notify";
import { FaBookOpen, FaCheck, FaSearch, FaTrash } from "react-icons/fa";
import useLocalStorage from "../../hooks/useLocalStorage";
import useFeatureFlags from "../../hooks/useFeatureFlags";
import { mergeLibrary } from "../../lib/library";
import {
  deleteCatalog,
  getCatalogIds,
  getCatalogVideos,
  listCatalogs,
} from "../../api/catalog";
import {
  pruneCachedIds,
  readCachedIds,
  readCachedLists,
  writeCachedIds,
  writeCachedLists,
} from "../../lib/catalogCache";

// Lists whose ids are fetched at the same time, in the background.
const ID_FETCHES = 2;

/**
 * The confirmation that replaces a list's buttons: what will happen, then the
 * action on the left and Cancel where the right-hand button was, so a double
 * tap cancels instead of going ahead.
 */
function ConfirmBox({ tone, message, label, busyLabel, icon, running, busy, onConfirm, onCancel }) {
  return (
    <div className={`add-library-confirm is-${tone}`} data-confirm-box role="alert">
      <p className="mb-2 small">{message}</p>
      <div className="add-library-actions">
        <button
          className={`btn btn-sm btn-${tone} add-library-add`}
          onClick={onConfirm}
          disabled={busy}
        >
          {running ? <span className="spinner-border spinner-border-sm" aria-hidden="true" /> : icon}
          {running ? busyLabel : label}
        </button>
        <button
          className="btn btn-sm btn-outline-secondary add-library-cancel"
          onClick={onCancel}
          disabled={running}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Menu > Add Library: the lists saved by Import Videos. Shows how much of each
 * list is already in the library, and adds only what is missing.
 *
 * The lists the panel last saw show at once and are refreshed in the
 * background. The server sends only names and counts; each list's video ids
 * (for "N already in your library") are fetched one list at a time afterwards
 * and cached until the list's count changes.
 *
 * With the "shareSavedLists" flag off the server sends only this room's own
 * lists, so they are cached apart from the shared view, and the panel starts
 * over (key) when the flag changes while it is open.
 */
export default function AddLibraryPanel() {
  const { flags } = useFeatureFlags();
  return <SavedLists key={flags.shareSavedLists ? "shared" : "own"} />;
}

function SavedLists() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const { flags } = useFeatureFlags();
  const cacheKey = flags.shareSavedLists || !syncCode ? syncCode : `${syncCode}:own`;
  const [library, setLibrary] = useLocalStorage("videoLibrary", []);
  const libraryIds = useMemo(() => new Set(library.map((v) => v.id.videoId)), [library]);

  // null = loading (nothing cached yet)
  const [lists, setLists] = useState(() => (syncCode ? readCachedLists(cacheKey) : null));
  const [refreshing, setRefreshing] = useState(false);
  // Search by list name.
  const [filter, setFilter] = useState("");
  // name -> { count, ids } of the lists whose ids are known
  const [idsByName, setIdsByName] = useState({});
  // { name, action: "add" | "delete" } while a list is being added or deleted
  const [workingOn, setWorkingOn] = useState(null);
  // { name, action: "add" | "delete" } waiting to be confirmed: both ask first,
  // so a stray tap neither fills the library nor deletes a list.
  const [confirming, setConfirming] = useState(null);

  // A tap anywhere outside the confirmation, or Escape, cancels it. (onBlur
  // alone is not enough: Safari does not focus a button that is tapped, so it
  // never blurs and the action would stay armed.)
  useEffect(() => {
    if (confirming === null) return;
    const onPointerDown = (event) => {
      if (!event.target.closest?.("[data-confirm-box]")) setConfirming(null);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setConfirming(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [confirming]);

  const refreshLists = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await listCatalogs();
      setLists(fresh);
      writeCachedLists(cacheKey, fresh);
      pruneCachedIds(cacheKey, fresh.map((l) => l.name));
    } catch (err) {
      setLists((prev) => prev ?? []);
      notify.catalog.loadFailed(err);
    } finally {
      setRefreshing(false);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (syncCode) refreshLists();
  }, [syncCode, refreshLists]);

  // Fill in each list's ids: from the cache when its count still matches,
  // otherwise from the server, a couple of lists at a time.
  // Loads are not cancelled when the lists refresh (cached -> fresh), only when
  // the panel closes: a load for a list whose count since changed is simply
  // ignored when drawn, and the new count is loaded under its own key.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const loadingIds = useRef(new Set()); // "name\ncount" being loaded
  useEffect(() => {
    if (!syncCode || !lists) return;
    const keyOf = (l) => `${l.name}\n${l.count}`;
    const todo = lists.filter(
      (l) => idsByName[l.name]?.count !== l.count && !loadingIds.current.has(keyOf(l))
    );
    if (todo.length === 0) return;
    todo.forEach((l) => loadingIds.current.add(keyOf(l)));

    const loadOne = async (list) => {
      const { name, count } = list;
      try {
        let ids = await readCachedIds(cacheKey, name, count);
        if (!ids && mounted.current) {
          ids = await getCatalogIds(name);
          writeCachedIds(cacheKey, name, count, ids);
        }
        if (ids && mounted.current) {
          setIdsByName((prev) => ({ ...prev, [name]: { count, ids } }));
        }
      } catch {
        // The counts still show; the next visit tries again.
      } finally {
        loadingIds.current.delete(keyOf(list));
      }
    };
    const queue = [...todo];
    const worker = async () => {
      while (queue.length > 0 && mounted.current) await loadOne(queue.shift());
    };
    for (let i = 0; i < ID_FETCHES; i += 1) worker();
    // idsByName is read only to skip lists already known; listing it would
    // start this again after every list that loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, lists]);

  if (!syncCode) {
    return (
      <div className="alert alert-info mb-0">
        Saved lists belong to your sync code. Turn on sync first (Library tab),
        then come back here.
      </div>
    );
  }

  const addToLibrary = async (name, count) => {
    setWorkingOn({ name, action: "add" });
    try {
      const videos = await getCatalogVideos(name);
      // The ids came along with the videos: no need to fetch them again.
      const ids = [...new Set(videos.map((v) => v.id.videoId))];
      writeCachedIds(cacheKey, name, count, ids);
      setIdsByName((prev) => ({ ...prev, [name]: { count, ids } }));
      // Only the videos that are not in the library yet.
      const missing = videos.filter((v) => !libraryIds.has(v.id.videoId));
      setLibrary((prev) => mergeLibrary(prev, missing));
      notify.catalog.added(missing.length, name);
      setConfirming(null);
    } catch (err) {
      // The box stays open, so trying again is one tap.
      notify.catalog.addFailed(err);
    } finally {
      setWorkingOn(null);
    }
  };

  const deleteList = async (name) => {
    setWorkingOn({ name, action: "delete" });
    try {
      const { deleted = 0, remaining = 0 } = (await deleteCatalog(name)) ?? {};
      notify.catalog.deleted(name, deleted, remaining);
      setConfirming(null);
      await refreshLists();
    } catch (err) {
      notify.catalog.deleteFailed(err);
    } finally {
      setWorkingOn(null);
    }
  };

  if (lists === null) return <p className="text-muted mb-0">Loading…</p>;
  if (lists.length === 0) {
    return (
      <p className="text-muted mb-0">
        No saved lists yet. Collect one in the Import Videos tab.
      </p>
    );
  }

  const number = (n) => n.toLocaleString();
  const videos = (n) => `${number(n)} ${n === 1 ? "video" : "videos"}`;
  const busy = workingOn !== null;

  // Every word typed must appear in the name, in any order and any case:
  // "opm love" finds "Karaoke Hits OPM Classics and Love Songs".
  const query = filter.trim();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown =
    words.length === 0
      ? lists
      : lists.filter((l) => {
          const name = l.name.toLowerCase();
          return words.every((w) => name.includes(w));
        });

  return (
    <>
      <div className="lib-toolbar mb-2">
      <div className="lib-search">
        <FaSearch aria-hidden="true" />
        <input
          type="search"
          className="form-control"
          placeholder="Search saved lists by name"
          aria-label="Search saved lists by name"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears the search instead of closing Settings.
            if (e.key === "Escape" && filter) {
              e.stopPropagation();
              setFilter("");
            }
          }}
          enterKeyHint="search"
          autoComplete="off"
        />
      </div>
      </div>
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2 small text-muted">
        <span aria-live="polite">
          {query
            ? `${shown.length} of ${lists.length} ${lists.length === 1 ? "list" : "lists"} match “${query}”`
            : `${lists.length} saved ${lists.length === 1 ? "list" : "lists"}`}
        </span>
        {/* Kept in place (not added and removed) so the list does not jump. */}
        <span className={`text-nowrap ${refreshing ? "" : "invisible"}`}>
          {refreshing ? "Checking for updates…" : ""}
        </span>
      </div>
      {shown.length === 0 && (
        <div className="yq-empty">
          <FaSearch aria-hidden="true" />
          <div className="yq-empty-title">No matches</div>
          <div>No saved list is named like “{query}”. Try another name.</div>
          <button className="btn btn-sm btn-outline-secondary mt-2" onClick={() => setFilter("")}>
            Clear search
          </button>
        </div>
      )}
      <ul
        className={`list-group add-library-list ${shown.length === 0 ? "d-none" : ""} ${
          flags.deleteListButton && lists.some((l) => l.mine) ? "has-delete" : ""
        }`}
      >
        {shown.map(({ name, count, mine, mineCount, others }) => {
          // Unknown until the list's ids have loaded: then only the count shows.
          const ids = idsByName[name]?.count === count ? idsByName[name].ids : null;
          const inLibrary = ids ? ids.filter((id) => libraryIds.has(id)).length : 0;
          const missing = ids ? count - inLibrary : count;
          // Lists cached before these fields existed: assume the simple case.
          const shared = others ?? !mine;
          const yours = mineCount ?? count;
          const runs = (action) => workingOn?.name === name && workingOn.action === action;
          const asking = confirming?.name === name ? confirming.action : null;
          const ask = (action) => setConfirming({ name, action });

          let box = null;
          if (asking === "add") {
            box = (
              <ConfirmBox
                tone="success"
                icon={<FaBookOpen aria-hidden="true" />}
                label="Add"
                busyLabel="Adding…"
                running={runs("add")}
                busy={busy}
                onCancel={() => setConfirming(null)}
                onConfirm={() => addToLibrary(name, count)}
                message={
                  !ids ? (
                    <>
                      Add the videos of this list (<strong>{videos(count)}</strong>) to your
                      library? Any already there are skipped.
                    </>
                  ) : inLibrary > 0 ? (
                    <>
                      Add the <strong>{videos(missing)}</strong> of this list that are missing
                      from your library? The {number(inLibrary)} already there are skipped.
                    </>
                  ) : (
                    <>
                      Add all <strong>{videos(count)}</strong> of this list to your library?
                    </>
                  )
                }
              />
            );
          } else if (asking === "delete") {
            box = (
              <ConfirmBox
                tone="danger"
                icon={<FaTrash aria-hidden="true" />}
                label="Delete"
                busyLabel="Deleting…"
                running={runs("delete")}
                busy={busy}
                onCancel={() => setConfirming(null)}
                onConfirm={() => deleteList(name)}
                message={
                  <>
                    {shared && mine ? (
                      <>
                        Delete the <strong>{videos(yours)}</strong> your room imported into this
                        list? The videos other rooms imported stay.
                      </>
                    ) : (
                      <>
                        Delete this list and its <strong>{videos(count)}</strong>?
                      </>
                    )}{" "}
                    This cannot be undone. Your library is not changed.
                  </>
                }
              />
            );
          }

          return (
            <li key={name} className="list-group-item add-library-item">
              <div className="add-library-info">
                <div className="fw-semibold text-break">
                  {name}{" "}
                  {shared && (
                    <span
                      className="badge text-bg-info fw-normal"
                      title={
                        mine
                          ? "Other rooms imported videos into this list too"
                          : "Imported by another room and shared with everyone"
                      }
                    >
                      Shared
                    </span>
                  )}
                </div>
                <small className="text-muted">
                  {videos(count)}
                  {!ids
                    ? " · checking your library…"
                    : missing === 0
                      ? " · all in your library"
                      : inLibrary > 0
                        ? ` · ${number(inLibrary)} already in your library`
                        : ""}
                </small>
              </div>

              {box ?? (
                <div className="add-library-actions">
                  {missing === 0 ? (
                    <button
                      className="btn btn-sm btn-outline-success add-library-add"
                      disabled
                      title="Every video of this list is already in your library"
                    >
                      <FaCheck aria-hidden="true" /> Added
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-success add-library-add"
                      onClick={() => ask("add")}
                      disabled={busy}
                    >
                      <FaBookOpen aria-hidden="true" />
                      {inLibrary > 0 ? `Add ${number(missing)} missing` : "Add to library"}
                    </button>
                  )}
                  {mine && flags.deleteListButton && (
                    <button
                      className="btn btn-sm btn-outline-danger add-library-delete"
                      onClick={() => ask("delete")}
                      disabled={busy}
                      title="Delete your part of this saved list (your library is not changed)"
                      aria-label={`Delete ${name}`}
                    >
                      <FaTrash aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
