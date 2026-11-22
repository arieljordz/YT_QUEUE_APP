import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ProgressBar } from "react-bootstrap";
import { toast } from "react-toastify";
import { FaDownload, FaBookOpen, FaCheck, FaTrash, FaStop } from "react-icons/fa";
import useLocalStorage from "../hooks/useLocalStorage";
import { mergeLibrary } from "../lib/library";
import {
  CatalogError,
  collectPage,
  deleteCatalog,
  getCatalogVideos,
  listCatalogs,
} from "../api/catalog";

const MAX_OPTIONS = [100, 250, 500];

/**
 * Settings > Import Videos. Step 1: collect videos from a YouTube channel or
 * search into a named list stored in the database. Step 2: pick a saved list
 * and add it to the library.
 */
export default function ImportVideosPanel() {
  const [syncCode] = useLocalStorage("syncCode", "");
  const [library, setLibrary] = useLocalStorage("videoLibrary", []);
  const libraryIds = useMemo(() => new Set(library.map((v) => v.id.videoId)), [library]);

  const [channel, setChannel] = useState("");
  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState(null); // null = follow channel / search text
  const [max, setMax] = useState(250);
  const [embeddableOnly, setEmbeddableOnly] = useState(true);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ saved: 0, target: 0 });
  const cancelRef = useRef(false);

  const [lists, setLists] = useState(null); // null = loading
  const [workingOn, setWorkingOn] = useState(null); // list being added or deleted
  const [confirmDelete, setConfirmDelete] = useState(null);

  const listName = customName ?? (channel.trim() || query.trim());
  const canStart = Boolean(listName && (channel.trim() || query.trim())) && !busy;

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
        Imported lists are saved in the database under your sync code. Turn on
        sync first (Library tab), then come back here.
      </div>
    );
  }

  const startImport = async () => {
    cancelRef.current = false;
    setBusy(true);
    setProgress({ saved: 0, target: max });

    let offset = 0;
    let saved = 0;
    let pageToken;
    let channelId;
    try {
      while (offset < max && !cancelRef.current) {
        const page = await collectPage(syncCode, {
          name: listName,
          channel: channelId ? undefined : channel.trim(),
          channelId,
          query: query.trim(),
          pageToken,
          offset,
          any: !embeddableOnly,
        });
        channelId = page.channelId ?? channelId;
        pageToken = page.nextPageToken;
        offset += page.fetched;
        saved += page.added;
        setProgress({ saved, target: max });
        if (!pageToken || page.fetched === 0) break;
      }
      toast.success(`Saved ${saved} videos to "${listName}"`);
    } catch (err) {
      toast.error(
        saved > 0 && err instanceof CatalogError
          ? `${err.message} (${saved} videos were saved)`
          : err.message
      );
    } finally {
      setBusy(false);
      refreshLists();
    }
  };

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

  return (
    <div>
      <h6 className="mb-2">1. Collect videos from YouTube</h6>
      <div className="row g-2">
        <div className="col-sm-6">
          <label className="form-label small mb-1" htmlFor="imp-channel">
            Channel
          </label>
          <input
            id="imp-channel"
            className="form-control"
            placeholder="e.g. Atomic Karaoke"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="col-sm-6">
          <label className="form-label small mb-1" htmlFor="imp-query">
            Search text <span className="text-muted">(optional with a channel)</span>
          </label>
          <input
            id="imp-query"
            className="form-control"
            placeholder="e.g. Taylor Swift"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="col-7 col-sm-6">
          <label className="form-label small mb-1" htmlFor="imp-name">
            Save as (list name)
          </label>
          <input
            id="imp-name"
            className="form-control"
            maxLength={60}
            value={listName}
            onChange={(e) => setCustomName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="col-5 col-sm-6">
          <label className="form-label small mb-1" htmlFor="imp-max">
            Up to
          </label>
          <select
            id="imp-max"
            className="form-select"
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
            disabled={busy}
          >
            {MAX_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} videos
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-check mt-2">
        <input
          id="imp-embed"
          type="checkbox"
          className="form-check-input"
          checked={embeddableOnly}
          onChange={(e) => setEmbeddableOnly(e.target.checked)}
          disabled={busy}
        />
        <label className="form-check-label small" htmlFor="imp-embed">
          Only videos that can play in the player tab
        </label>
      </div>
      <div className="form-text">
        Each 50 videos use 100 of YouTube's 10,000 free daily search units.
      </div>

      <div className="d-flex gap-2 mt-3">
        <button
          className="btn btn-primary d-flex align-items-center justify-content-center gap-2 flex-grow-1 flex-sm-grow-0"
          onClick={startImport}
          disabled={!canStart}
        >
          <FaDownload /> {busy ? "Importing…" : "Import from YouTube"}
        </button>
        {busy && (
          <button
            className="btn btn-outline-secondary d-flex align-items-center gap-2"
            onClick={() => (cancelRef.current = true)}
          >
            <FaStop /> Stop
          </button>
        )}
      </div>
      {busy && (
        <ProgressBar
          className="mt-3"
          now={Math.min(100, (progress.saved / progress.target) * 100)}
          label={`${progress.saved} saved`}
        />
      )}

      <hr className="my-4" />

      <h6 className="mb-2">2. Add a saved list to your library</h6>
      {lists === null ? (
        <p className="text-muted mb-0">Loading…</p>
      ) : lists.length === 0 ? (
        <p className="text-muted mb-0">No lists yet. Collect one above.</p>
      ) : (
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
                      disabled={workingOn !== null || busy}
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
                    disabled={workingOn !== null || busy}
                    title="Delete this saved list (your library is not changed)"
                  >
                    <FaTrash /> {confirmDelete === name ? "Sure?" : ""}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
