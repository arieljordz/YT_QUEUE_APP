import { memo, useState } from "react";
import { FaTrash, FaStar, FaRegStar, FaYoutube } from "react-icons/fa";
import { MdPlaylistAdd } from "react-icons/md";
import { describeVideo } from "../lib/format";
import YoutubeOnlyBadge from "./YoutubeOnlyBadge";

function VideoList({
  videos,
  queuedIds,
  details,
  youtubeOnlyIds,
  onAdd,
  onRemove,
  favoriteSet,
  onToggleFavorite,
  isLoading,
  hasSearched,
  emptyText = "No results found.",
  emptyTitle,
  emptyIcon,
}) {
  // With onRemove, the trash button needs a second click to confirm.
  const [confirmId, setConfirmId] = useState(null);

  if (isLoading) {
    // Placeholder rows in the shape of the results, while searching.
    return (
      <ul className="yq-list mt-3" aria-busy="true" aria-label="Searching">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="yq-row yq-skeleton" aria-hidden="true">
            <span className="result-thumb sk-block" />
            <span className="flex-grow-1">
              <span className="sk-line" style={{ width: `${70 - i * 6}%` }} />
              <span className="sk-line sk-short" />
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (!hasSearched) {
    return (
      <div className="yq-empty">
        <FaYoutube aria-hidden="true" />
        <div className="yq-empty-title">Find something to play</div>
        <div>Search YouTube, then press Queue to line it up.</div>
      </div>
    );
  }
  if (videos.length === 0) {
    return (
      <div className="yq-empty">
        {emptyIcon}
        {emptyTitle && <div className="yq-empty-title">{emptyTitle}</div>}
        <div>{emptyText}</div>
      </div>
    );
  }

  return (
    <ul className="yq-list">
      {videos.map((video) => {
        const { thumbnails, title, channelTitle } = video.snippet;
        const inQueue = queuedIds.has(video.id.videoId);
        const detail = details?.get(video.id.videoId);
        const meta = describeVideo(detail);
        const youtubeOnly = detail?.embeddable === false || Boolean(youtubeOnlyIds?.has(video.id.videoId));
        return (
          <li
            key={video.id.videoId}
            className="yq-row"
          >
            <img
              src={(thumbnails.medium ?? thumbnails.default).url}
              alt=""
              loading="lazy"
              className="result-thumb"
            />
            <div className="flex-grow-1 min-w-0">
              <div className="yq-title text-truncate-2" title={title}>
                {title}
              </div>
              {(channelTitle || meta) && (
                <small className="yq-meta d-block">
                  {[channelTitle, meta].filter(Boolean).join(" · ")}
                </small>
              )}
              {(inQueue || youtubeOnly) && (
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {inQueue && <span className="yq-badge-queued">In queue</span>}
                  {youtubeOnly && <YoutubeOnlyBadge />}
                </div>
              )}
            </div>
            {onToggleFavorite && (
              <button
                className="btn btn-link p-1 flex-shrink-0 favorite-star"
                onClick={() => onToggleFavorite(video.id.videoId)}
                aria-pressed={favoriteSet?.has(video.id.videoId)}
                aria-label={
                  favoriteSet?.has(video.id.videoId)
                    ? `Remove ${title} from favorites`
                    : `Add ${title} to favorites`
                }
                title={favoriteSet?.has(video.id.videoId) ? "Favorite" : "Add to favorites"}
              >
                {favoriteSet?.has(video.id.videoId) ? (
                  <FaStar className="is-on" size={18} aria-hidden="true" />
                ) : (
                  <FaRegStar className="is-off" size={18} aria-hidden="true" />
                )}
              </button>
            )}
            <div className="d-flex gap-1 flex-shrink-0">
              <button
                className="btn btn-sm yq-btn-primary row-action d-flex align-items-center justify-content-center gap-1 flex-shrink-0"
                onClick={() => onAdd(video)}
                aria-label={`Add ${title} to queue`}
                title="Add to queue"
              >
                <MdPlaylistAdd size={18} aria-hidden="true" />
                <span className="d-none d-sm-inline">Queue</span>
              </button>
              {onRemove && (
                <button
                  className={`btn btn-sm row-action d-flex align-items-center justify-content-center gap-1 flex-shrink-0 ${
                    confirmId === video.id.videoId
                      ? "btn-danger is-confirming"
                      : "yq-btn-ghost-danger"
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
                  <span className={confirmId === video.id.videoId ? "" : "d-none d-sm-inline"}>
                    {confirmId === video.id.videoId ? "Sure?" : "Remove"}
                  </span>
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default memo(VideoList);
