import { memo, useCallback, useState } from "react";
import { Modal, Button } from "react-bootstrap";
import ImportQueueButton from "./ImportQueueButton";
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
      <div className="card-body d-flex flex-wrap align-items-center gap-3">
        <img src={thumbOf(video)} alt="" className="result-thumb rounded" />
        <div className="now-playing-info min-w-0">
          <small className="text-primary text-uppercase fw-bold">
            {isPaused ? "Paused" : "Now playing"}
          </small>
          <div className="fw-semibold text-truncate-2" title={video.snippet.title}>
            {video.snippet.title}
          </div>
        </div>
        <div className="btn-group queue-actions">
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
          className="list-group-item d-flex flex-wrap align-items-center gap-2"
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <span className="text-muted small queue-position">{index}</span>
          <img src={thumbOf(video)} alt="" className="queue-thumb rounded" />
          <span className="up-next-title min-w-0 text-truncate-2" title={video.snippet.title}>
            {video.snippet.title}
          </span>
          <div className="btn-group btn-group-sm queue-actions">
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

function ConfirmModal({ show, title, children, confirmLabel, onConfirm, onCancel }) {
  return (
    <Modal show={show} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{children}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

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
  onImport,
  onImportError,
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

  // Removing needs a confirmation. The pending video is tracked by id, not
  // position, because the queue can change (e.g. the player tab moves on)
  // while the dialog is open.
  const [pendingRemoveId, setPendingRemoveId] = useState(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const pendingRemove = upNext.find(
    (video, i) => getItemId(video, i + 1) === pendingRemoveId
  );

  const handleRequestRemove = useCallback(
    (index) => setPendingRemoveId(getItemId(queue[index], index)),
    [queue]
  );

  const confirmRemove = () => {
    const index = queue.findIndex((video, i) => getItemId(video, i) === pendingRemoveId);
    if (index >= 1) onRemove(index);
    setPendingRemoveId(null);
  };

  const confirmClear = () => {
    onClear();
    setConfirmingClear(false);
  };

  return (
    <section>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h5 className="mb-0">
          🎵 Queue <span className="badge bg-secondary">{queue.length}</span>
        </h5>
        <div className="d-flex gap-2 flex-wrap">
          <ImportQueueButton onImport={onImport} onError={onImportError} />
          <button
            className="btn btn-sm btn-outline-warning d-flex align-items-center gap-1"
            onClick={onRequeuePlayed}
            disabled={playedCount === 0}
          >
            <FaRedo /> Re-queue played{playedCount > 0 && ` (${playedCount})`}
          </button>
          <button
            className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
            onClick={() => setConfirmingClear(true)}
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
                      onRemove={handleRequestRemove}
                    />
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        </>
      )}

      <ConfirmModal
        show={Boolean(pendingRemove)}
        title="Remove from queue?"
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemoveId(null)}
      >
        {pendingRemove && (
          <>
            Remove <strong>{pendingRemove.snippet.title}</strong> from the queue?
          </>
        )}
      </ConfirmModal>

      <ConfirmModal
        show={confirmingClear}
        title="Clear the queue?"
        confirmLabel="Clear all"
        onConfirm={confirmClear}
        onCancel={() => setConfirmingClear(false)}
      >
        This removes all {queue.length} videos from the queue, including the one
        playing now.
      </ConfirmModal>
    </section>
  );
}

export default memo(Queue);
