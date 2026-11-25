import { useState, useRef } from "react";
import { ProgressBar } from "react-bootstrap";
import { notify } from "../lib/notify";
import { FaDownload, FaStop } from "react-icons/fa";
import useLocalStorage from "../hooks/useLocalStorage";
import { CatalogError, collectPage, isSearchesList, SEARCHES_LIST } from "../api/catalog";

const MAX_OPTIONS = [100, 250, 500];
// Each page of 50 results costs 100 YouTube quota units, so the scan is capped.
const MAX_PAGES = 10;

/**
 * Menu > Import Videos: collect videos from a YouTube channel or search into a
 * named list stored in the database. (Add Library puts a list into the library.)
 */
export default function ImportVideosPanel() {
  const [syncCode] = useLocalStorage("syncCode", "");

  const [channel, setChannel] = useState("");
  const [title, setTitle] = useState("");
  const [customName, setCustomName] = useState(null); // null = follow channel / search text
  const [max, setMax] = useState(500);
  const [embeddableOnly, setEmbeddableOnly] = useState(true);
  const [skipShorts, setSkipShorts] = useState(true);
  const [newestFirst, setNewestFirst] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ saved: 0, target: 0 });
  const cancelRef = useRef(false);

  const listName = customName ?? (channel.trim() || title.trim());
  const reservedName = isSearchesList(listName);
  const canStart =
    Boolean(listName && (channel.trim() || title.trim())) && !reservedName && !busy;

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

    let pages = 0;
    let saved = 0;
    let pageToken;
    let channelId;
    try {
      // Keep reading pages until enough videos matched, YouTube has no more, or the page cap.
      while (saved < max && pages < MAX_PAGES && !cancelRef.current) {
        const page = await collectPage({
          name: listName,
          channel: channelId ? undefined : channel.trim(),
          channelId,
          title: title.trim(),
          pageToken,
          offset: saved,
          any: !embeddableOnly,
          noShorts: skipShorts,
          newest: newestFirst,
        });
        pages += 1;
        channelId = page.channelId ?? channelId;
        pageToken = page.nextPageToken;
        saved += page.added;
        setProgress({ saved, target: max });
        if (!pageToken || page.fetched === 0) break;
      }
      notify.import.saved(saved, listName);
    } catch (err) {
      notify.import.failed(err, err instanceof CatalogError ? saved : 0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row g-2">
        <div className="col-sm-6">
          <label className="form-label small mb-1" htmlFor="imp-channel">
            Channel <span className="text-muted">(optional)</span>
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
          <label className="form-label small mb-1" htmlFor="imp-title">
            Title <span className="text-muted">(optional)</span>
          </label>
          <input
            id="imp-title"
            className="form-control"
            placeholder="e.g. Karaoke"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
          {reservedName && (
            <div className="form-text text-danger">
              "{SEARCHES_LIST}" is reserved for videos you search and queue. Pick another name.
            </div>
          )}
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
      <div className="form-check">
        <input
          id="imp-shorts"
          type="checkbox"
          className="form-check-input"
          checked={skipShorts}
          onChange={(e) => setSkipShorts(e.target.checked)}
          disabled={busy}
        />
        <label className="form-check-label small" htmlFor="imp-shorts">
          Leave out YouTube Shorts
        </label>
      </div>
      <div className="form-check">
        <input
          id="imp-newest"
          type="checkbox"
          className="form-check-input"
          checked={newestFirst}
          onChange={(e) => setNewestFirst(e.target.checked)}
          disabled={busy}
        />
        <label className="form-check-label small" htmlFor="imp-newest">
          Newest uploads first (good for re-importing a channel to catch new videos)
        </label>
      </div>
      <div className="form-text">
        Fill in a channel, a title, or both. With a title, only videos whose own
        title contains those words are saved. Each 50 videos checked use 100 of
        YouTube's 10,000 free daily search units, and at most 500 are checked per
        import.
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

      <div className="form-text mt-3">
        Saved lists are added to your library from the Add Library tab.
      </div>
    </div>
  );
}
