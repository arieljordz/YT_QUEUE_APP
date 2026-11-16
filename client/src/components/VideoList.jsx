import { memo } from "react";
import { FaPlus } from "react-icons/fa";

function VideoList({ videos, queuedIds, onAdd, isLoading, hasSearched }) {
  if (isLoading) {
    return <p className="text-muted text-center my-4">Searching…</p>;
  }
  if (!hasSearched) {
    return (
      <p className="text-muted text-center my-4">
        Search for a song or video, then press Add to put it in the queue.
      </p>
    );
  }
  if (videos.length === 0) {
    return <p className="text-muted text-center my-4">No results found.</p>;
  }

  return (
    <ul className="list-group mt-3">
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
              {inQueue && (
                <div>
                  <span className="badge bg-secondary">In queue</span>
                </div>
              )}
            </div>
            <button
              className="btn btn-success d-flex align-items-center gap-1 flex-shrink-0"
              onClick={() => onAdd(video)}
              aria-label={`Add ${title} to queue`}
            >
              <FaPlus /> Add
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default memo(VideoList);
