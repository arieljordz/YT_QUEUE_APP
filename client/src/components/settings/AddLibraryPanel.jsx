import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { notify } from "../../lib/notify";
import { FaBookOpen, FaCheck, FaTrash } from "react-icons/fa";
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
 * Menu > Add Library: the lists saved by Import Videos. Shows how much of each
 * list is already in the library, and adds only what is missing.
 *
 * The lists the panel last saw show at once and are refreshed in the
 * background. The server sends only names and counts; each list's video ids
 * (for "N already in your library") are fetched one list at a time afterwards
 * and cached until the list's count changes.
 */
export default function AddLibraryPanel() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const { flags } = useFeatureFlags();
  const [library, setLibrary] = useLocalStorage("videoLibrary", []);
  const libraryIds = useMemo(() => new Set(library.map((v) => v.id.videoId)), [library]);

  // null = loading (nothing cached yet)
  const [lists, setLists] = useState(() => (syncCode ? readCachedLists(syncCode) : null));
  const [refreshing, setRefreshing] = useState(false);
  // name -> { count, ids } of the lists whose ids are known
  const [idsByName, setIdsByName] = useState({});
  const [workingOn, setWorkingOn] = useState(null); // list being added or deleted
  const [confirmDelete, setConfirmDelete] = useState(null);

  const refreshLists = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await listCatalogs();
      setLists(fresh);
      writeCachedLists(syncCode, fresh);
      pruneCachedIds(syncCode, fresh.map((l) => l.name));
    } catch (err) {
      setLists((prev) => prev ?? []);
      notify.catalog.loadFailed(err);
    } finally {
      setRefreshing(false);
    }
  }, [syncCode]);

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
        let ids = await readCachedIds(syncCode, name, count);
        if (!ids && mounted.current) {
          ids = await getCatalogIds(name);
          writeCachedIds(syncCode, name, count, ids);
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
  }, [syncCode, lists]);

  if (!syncCode) {
    return (
      <div className="alert alert-info mb-0">
        Saved lists belong to your sync code. Turn on sync first (Library tab),
        then come back here.
      </div>
    );
  }

  const addToLibrary = async (name, count) => {
    setWorkingOn(name);
    try {
      const videos = await getCatalogVideos(name);
      // The ids came along with the videos: no need to fetch them again.
      const ids = [...new Set(videos.map((v) => v.id.videoId))];
      writeCachedIds(syncCode, name, count, ids);
      setIdsByName((prev) => ({ ...prev, [name]: { count, ids } }));
      // Only the videos that are not in the library yet.
      const missing = videos.filter((v) => !libraryIds.has(v.id.videoId));
      setLibrary((prev) => mergeLibrary(prev, missing));
      notify.catalog.added(missing.length, name);
    } catch (err) {
      notify.catalog.addFailed(err);
    } finally {
      setWorkingOn(null);
    }
  };

  const removeList = async (name) => {
    if (confirmDelete !== name) {
      setConfirmDelete(name);
      return;
    }
    setWorkingOn(name);
    try {
      await deleteCatalog(name);
      notify.catalog.deleted(name);
      setConfirmDelete(null);
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

  return (
    <>
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2 small text-muted">
        <span>
          {lists.length} saved {lists.length === 1 ? "list" : "lists"}
        </span>
        {/* Kept in place (not added and removed) so the list does not jump. */}
        <span className={refreshing ? "" : "invisible"} aria-live="polite">
          {refreshing ? "Checking for updates…" : ""}
        </span>
      </div>
      <ul
        className={`list-group add-library-list ${
          flags.deleteListButton && lists.some((l) => l.mine) ? "has-delete" : ""
        }`}
      >
        {lists.map(({ name, count, mine }) => {
          // Unknown until the list's ids have loaded: then only the count shows.
          const ids = idsByName[name]?.count === count ? idsByName[name].ids : null;
          const inLibrary = ids ? ids.filter((id) => libraryIds.has(id)).length : 0;
          const missing = ids ? count - inLibrary : count;
          const confirming = confirmDelete === name;
          return (
            <li key={name} className="list-group-item add-library-item">
              <div className="add-library-info">
                <div className="fw-semibold text-break">
                  {name}{" "}
                  {!mine && (
                    <span
                      className="badge text-bg-info fw-normal"
                      title="Imported by another room and shared with everyone"
                    >
                      Shared
                    </span>
                  )}
                </div>
                <small className="text-muted">
                  {number(count)} {count === 1 ? "video" : "videos"}
                  {!ids
                    ? " · checking your library…"
                    : missing === 0
                      ? " · all in your library"
                      : inLibrary > 0
                        ? ` · ${number(inLibrary)} already in your library`
                        : ""}
                </small>
              </div>
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
                    onClick={() => addToLibrary(name, count)}
                    disabled={workingOn !== null}
                  >
                    <FaBookOpen aria-hidden="true" />
                    {workingOn === name
                      ? "Working…"
                      : inLibrary > 0
                        ? `Add ${number(missing)} missing`
                        : "Add to library"}
                  </button>
                )}
                {mine && flags.deleteListButton && (
                  <button
                    className={`btn btn-sm add-library-delete ${
                      confirming ? "btn-danger is-confirming" : "btn-outline-danger"
                    }`}
                    onClick={() => removeList(name)}
                    onBlur={() => setConfirmDelete(null)}
                    disabled={workingOn !== null}
                    title="Delete your part of this saved list (your library is not changed)"
                    aria-label={confirming ? `Confirm deleting ${name}` : `Delete ${name}`}
                  >
                    <FaTrash aria-hidden="true" />
                    {confirming && "Sure?"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
