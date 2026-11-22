import { useState, useRef } from "react";
import { ProgressBar } from "react-bootstrap";
import { toast } from "react-toastify";
import { FaDownload, FaStop } from "react-icons/fa";
import useLocalStorage from "../hooks/useLocalStorage";
import { CatalogError, collectPage } from "../api/catalog";

const MAX_OPTIONS = [100, 250, 500];

/**
 * Menu > Import Videos: collect videos from a YouTube channel or search into a
 * named list stored in the database. (Add Library puts a list into the library.)
 */
export default function ImportVideosPanel() {
  const [syncCode] = useLocalStorage("syncCode", "");

  const [channel, setChannel] = useState("");
  const [query, setQuery] = useState("");
  const [customName, setCustomName] = useState(null); // null = follow channel / search text
  const [max, setMax] = useState(250);
  const [embeddableOnly, setEmbeddableOnly] = useState(true);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ saved: 0, target: 0 });
  const cancelRef = useRef(false);

  const listName = customName ?? (channel.trim() || query.trim());
  const canStart = Boolean(listName && (channel.trim() || query.trim())) && !busy;

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
    }
  };

  return (
    <div>
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

      <div className="form-text mt-3">
        Saved lists are added to your library from the gear menu, under Add Library.
      </div>
    </div>
  );
}
