import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import { FaBookOpen, FaCheck, FaTrash } from "react-icons/fa";
import useLocalStorage from "../hooks/useLocalStorage";
import { mergeLibrary } from "../lib/library";
import { deleteCatalog, getCatalogVideos, listCatalogs } from "../api/catalog";

/**
 * Menu > Add Library: the lists saved by Import Videos. Shows how much of each
 * list is already in the library, and adds only what is missing.
 */
export default function AddLibraryPanel() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [library, setLibrary] = useLocalStorage("videoLibrary", []);
  const libraryIds = useMemo(() => new Set(library.map((v) => v.id.videoId)), [library]);

  const [lists, setLists] = useState(null); // null = loading
  const [workingOn, setWorkingOn] = useState(null); // list being added or deleted
  const [confirmDelete, setConfirmDelete] = useState(null);

  const refreshLists = useCallback(async () => {
    try {
      setLists(await listCatalogs(syncCode));
    } catch (err) {
      setLists([]);
      toast.error(err.message, { toastId: "catalog-list-error" });
    }
  }, [syncCode]);

  useEffect(() => {
    if (syncCode) refreshLists();
  }, [syncCode, refreshLists]);

  if (!syncCode) {
    return (
      <div className="alert alert-info mb-0">
        Saved lists belong to your sync code. Turn on sync first (Library tab),
        then come back here.
      </div>
    );
  }

  const addToLibrary = async (name) => {
    setWorkingOn(name);
    try {
      const videos = await getCatalogVideos(syncCode, name);
      // Only the videos that are not in the library yet.
      const missing = videos.filter((v) => !libraryIds.has(v.id.videoId));
      setLibrary((prev) => mergeLibrary(prev, missing));
      toast.success(`Added ${missing.length} videos from "${name}" to your library`);
    } catch (err) {
      toast.error(err.message);
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
      await deleteCatalog(syncCode, name);
      toast.success(`Deleted the list "${name}"`);
      setConfirmDelete(null);
      await refreshLists();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setWorkingOn(null);
    }
  };

  if (lists === null) return <p className="text-muted mb-0">Loading…</p>;
  if (lists.length === 0) {
    return (
      <p className="text-muted mb-0">
        No saved lists yet. Collect one with Import Videos in the gear menu.
      </p>
    );
  }

  return (
    <ul className="list-group">
      {lists.map(({ name, count, ids }) => {
        const inLibrary = ids.filter((id) => libraryIds.has(id)).length;
        const missing = count - inLibrary;
        return (
          <li
            key={name}
            className="list-group-item d-flex flex-wrap align-items-center gap-2"
          >
            <div className="flex-grow-1 min-w-0">
              <div className="fw-semibold text-break">{name}</div>
              <small className="text-muted">
                {count} videos
                {missing === 0
                  ? " · all in your library"
                  : inLibrary > 0
                    ? ` · ${inLibrary} already in your library`
                    : ""}
              </small>
            </div>
            <div className="d-flex gap-2 flex-grow-1 flex-sm-grow-0 justify-content-end">
              {missing === 0 ? (
                <button
                  className="btn btn-sm btn-outline-success d-flex align-items-center justify-content-center gap-1 flex-grow-1 flex-sm-grow-0"
                  disabled
                  title="Every video of this list is already in your library"
                >
                  <FaCheck /> Added
                </button>
              ) : (
                <button
                  className="btn btn-sm btn-success d-flex align-items-center justify-content-center gap-1 flex-grow-1 flex-sm-grow-0"
                  onClick={() => addToLibrary(name)}
                  disabled={workingOn !== null}
                >
                  <FaBookOpen />{" "}
                  {workingOn === name
                    ? "Working…"
                    : inLibrary > 0
                      ? `Add ${missing} missing`
                      : "Add to library"}
                </button>
              )}
              <button
                className={`btn btn-sm d-flex align-items-center gap-1 ${
                  confirmDelete === name ? "btn-danger" : "btn-outline-danger"
                }`}
                onClick={() => removeList(name)}
                onBlur={() => setConfirmDelete(null)}
                disabled={workingOn !== null}
                title="Delete this saved list (your library is not changed)"
              >
                <FaTrash /> {confirmDelete === name ? "Sure?" : ""}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
