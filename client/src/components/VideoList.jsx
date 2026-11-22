import { memo, useState } from "react";
import { FaPlus, FaTrash } from "react-icons/fa";

function VideoList({
  videos,
  queuedIds,
  youtubeOnlyIds,
  onAdd,
  onRemove,
  isLoading,
  hasSearched,
  emptyText = "No results found.",
}) {
  // With onRemove, the trash button needs a second click to confirm.
  const [confirmId, setConfirmId] = useState(null);

  if (isLoading) {
    return <p className="text-muted text-center my-4">Searching…</p>;
  }
  if (!hasSearched) {
    return (
      <p className="text-muted text-center my-4">
        Search for a song or video, then press Queue to line it up.
      </p>
    );
  }
  if (videos.length === 0) {
    return <p className="text-muted text-center my-4">{emptyText}</p>;
  }

  return (
    <ul className="list-group">
      {videos.map((video) => {
        const { thumbnails, title, channelTitle } = video.snippet;
        const inQueue = queuedIds.has(video.id.videoId);
        return (
          <li
            key={video.id.videoId}
            className="list-group-item d-flex align-items-center gap-3"
          >
            <img
              src={(thumbnails.medium ?? thumbnails.default).url}
              alt=""
              loading="lazy"
              className="result-thumb rounded"
            />
            <div className="flex-grow-1 min-w-0">
              <div className="fw-semibold text-truncate-2" title={title}>
                {title}
              </div>
              {channelTitle && <small className="text-muted">{channelTitle}</small>}
              {(inQueue || youtubeOnlyIds?.has(video.id.videoId)) && (
                <div className="d-flex flex-wrap gap-1">
                  {inQueue && <span className="badge bg-secondary">In queue</span>}
                  {youtubeOnlyIds?.has(video.id.videoId) && (
                    <span
                      className="badge bg-warning text-dark"
                      title="The owner disabled embedding, so it can't play in the player tab."
                    >
                      YouTube only
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              className="btn btn-success add-to-queue d-flex align-items-center justify-content-center gap-1 flex-shrink-0"
              onClick={() => onAdd(video)}
              aria-label={`Add ${title} to queue`}
              title="Add to queue"
            >
              <FaPlus aria-hidden="true" />
              <span className="d-none d-sm-inline">Queue</span>
            </button>
            {onRemove && (
              <button
                className={`btn add-to-queue d-flex align-items-center justify-content-center gap-1 flex-shrink-0 ${
                  confirmId === video.id.videoId
                    ? "btn-danger is-confirming"
                    : "btn-outline-danger"
                }`}
                onClick={() => {
                  if (confirmId === video.id.videoId) {
                    setConfirmId(null);
                    onRemove(video.id.videoId);
                  } else {
                    setConfirmId(video.id.videoId);
                  }
                }}
                onBlur={() => setConfirmId(null)}
                aria-label={`Remove ${title} from library`}
                title={
                  confirmId === video.id.videoId
                    ? "Click again to remove"
                    : "Remove from library"
                }
              >
                <FaTrash aria-hidden="true" />
                {confirmId === video.id.videoId && <span>Sure?</span>}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default memo(VideoList);
