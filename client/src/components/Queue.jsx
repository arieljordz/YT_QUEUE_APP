import { memo, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  FaTrash,
  FaArrowUp,
  FaArrowDown,
  FaPause,
  FaPlay,
  FaStepForward,
  FaRedo,
} from "react-icons/fa";

// Entries saved before queueIds existed fall back to a videoId+index key.
const getItemId = (video, index) => video.queueId ?? `${video.id.videoId}-${index}`;
const thumbOf = (video) => {
  const { thumbnails } = video.snippet;
  return (thumbnails.medium ?? thumbnails.default).url;
};

const NowPlaying = memo(function NowPlaying({ video, isPaused, onTogglePause, onSkip }) {
  return (
    <div className="card mb-3 border-primary">
      <div className="card-body d-flex align-items-center gap-3">
        <img src={thumbOf(video)} alt="" className="result-thumb rounded" />
        <div className="flex-grow-1 min-w-0">
          <small className="text-primary text-uppercase fw-bold">
            {isPaused ? "Paused" : "Now playing"}
          </small>
          <div className="fw-semibold text-truncate-2" title={video.snippet.title}>
            {video.snippet.title}
          </div>
        </div>
        <div className="btn-group flex-shrink-0">
          <button
            className="btn btn-primary"
            onClick={onTogglePause}
            aria-label={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <FaPlay /> : <FaPause />}
          </button>
          <button className="btn btn-outline-primary" onClick={onSkip} aria-label="Skip">
            <FaStepForward />
          </button>
        </div>
      </div>
    </div>
  );
});

// `index` is the absolute queue position (so >= 1 for upcoming items).
const UpNextItem = memo(function UpNextItem({
  video,
  index,
  isLast,
  onPlay,
  onMove,
  onRemove,
}) {
  return (
    <Draggable draggableId={getItemId(video, index)} index={index - 1}>
      {(provided) => (
        <li
          className="list-group-item d-flex align-items-center gap-2"
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <span className="text-muted small queue-position">{index}</span>
          <img src={thumbOf(video)} alt="" className="queue-thumb rounded" />
          <span className="flex-grow-1 min-w-0 text-truncate-2" title={video.snippet.title}>
            {video.snippet.title}
          </span>
          <div className="btn-group btn-group-sm flex-shrink-0">
            <button
              className="btn btn-outline-primary"
              onClick={() => onPlay(index)}
              aria-label="Play now"
              title="Play now"
            >
              <FaPlay />
            </button>
            <button
              className="btn btn-outline-secondary"
              onClick={() => onMove(index, index - 1)}
              disabled={index <= 1}
              aria-label="Move up"
            >
              <FaArrowUp />
            </button>
            <button
              className="btn btn-outline-secondary"
              onClick={() => onMove(index, index + 1)}
              disabled={isLast}
              aria-label="Move down"
            >
              <FaArrowDown />
            </button>
            <button
              className="btn btn-outline-danger"
              onClick={() => onRemove(index)}
              aria-label="Remove"
            >
              <FaTrash />
            </button>
          </div>
        </li>
      )}
    </Draggable>
  );
});

function Queue({
  queue,
  isPaused,
  onTogglePause,
  onSkip,
  onPlay,
  onMove,
  onRemove,
  onClear,
  playedCount,
  onRequeuePlayed,
}) {
  const handleDragEnd = useCallback(
    (result) => {
      if (!result.destination) return;
      // The droppable only holds upcoming items, so shift back to queue positions.
      onMove(result.source.index + 1, result.destination.index + 1);
    },
    [onMove]
  );

  const [current, ...upNext] = queue;

  return (
    <section>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h5 className="mb-0">
          🎵 Queue <span className="badge bg-secondary">{queue.length}</span>
        </h5>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-outline-warning d-flex align-items-center gap-1"
            onClick={onRequeuePlayed}
            disabled={playedCount === 0}
          >
            <FaRedo /> Re-queue played{playedCount > 0 && ` (${playedCount})`}
          </button>
          <button
            className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
            onClick={onClear}
            disabled={queue.length === 0}
          >
            <FaTrash /> Clear
          </button>
        </div>
      </div>

      {!current ? (
        <p className="text-muted text-center my-4">
          The queue is empty. Add videos from the search results.
        </p>
      ) : (
        <NowPlaying
          video={current}
          isPaused={isPaused}
          onTogglePause={onTogglePause}
          onSkip={onSkip}
        />
      )}

      {upNext.length > 0 && (
        <>
          <h6 className="text-muted text-uppercase small">Up next</h6>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="video-queue">
              {(provided) => (
                <ul
                  className="list-group"
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  {upNext.map((video, i) => (
                    <UpNextItem
                      key={getItemId(video, i + 1)}
                      video={video}
                      index={i + 1}
                      isLast={i === upNext.length - 1}
                      onPlay={onPlay}
                      onMove={onMove}
                      onRemove={onRemove}
                    />
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        </>
      )}
    </section>
  );
}

export default memo(Queue);
