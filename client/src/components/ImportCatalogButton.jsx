import { useState, memo } from "react";
import { Modal, Button } from "react-bootstrap";
import { FaDatabase } from "react-icons/fa";

async function getJson(url) {
  const response = await fetch(url);
  const isJson = response.headers.get("content-type")?.includes("application/json");
  // Local dev (plain vite) has no /api route and answers with HTML or 404.
  if (!isJson || response.status === 404) throw new Error("unavailable");
  if (!response.ok) throw new Error("error");
  return response.json();
}

/**
 * Lists the video catalogs saved in the database (filled by
 * scripts/collect-karaoke.mjs) and hands the chosen one to
 * `onImport(videos, 0)`. `onError(message)` reports failures.
 */
function ImportCatalogButton({ onImport, onError }) {
  const [show, setShow] = useState(false);
  const [catalogs, setCatalogs] = useState(null); // null = loading
  const [loadingName, setLoadingName] = useState(null);

  const explain = (err) =>
    err.message === "unavailable"
      ? "Importing from the database only works on the deployed site."
      : "Could not reach the database. Please try again.";

  const open = async () => {
    setShow(true);
    setCatalogs(null);
    try {
      setCatalogs((await getJson("/api/catalog")).catalogs);
    } catch (err) {
      setShow(false);
      onError(explain(err));
    }
  };

  const choose = async (name) => {
    setLoadingName(name);
    try {
      const { videos } = await getJson(`/api/catalog?name=${encodeURIComponent(name)}`);
      if (videos.length === 0) {
        onError("That list is empty.");
      } else {
        onImport(videos, 0);
        setShow(false);
      }
    } catch (err) {
      onError(explain(err));
    } finally {
      setLoadingName(null);
    }
  };

  return (
    <>
      <button
        className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
        onClick={open}
        title="Add a ready-made list of videos from the database"
      >
        <FaDatabase /> From database
      </button>

      <Modal show={show} onHide={() => !loadingName && setShow(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title as="h5">Import from the database</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {catalogs === null ? (
            <p className="text-muted mb-0">Loading lists…</p>
          ) : catalogs.length === 0 ? (
            <p className="text-muted mb-0">
              No lists saved yet. Fill the database with scripts/collect-karaoke.mjs.
            </p>
          ) : (
            <div className="list-group">
              {catalogs.map(({ name, count }) => (
                <button
                  key={name}
                  className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                  onClick={() => choose(name)}
                  disabled={loadingName !== null}
                >
                  <span>{loadingName === name ? "Importing…" : name}</span>
                  <span className="badge bg-secondary">{count}</span>
                </button>
              ))}
            </div>
          )}
          <p className="form-text mt-3 mb-0">
            The videos are added to your queue and your library.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)} disabled={loadingName !== null}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default memo(ImportCatalogButton);
