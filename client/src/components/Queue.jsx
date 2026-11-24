import { memo, useCallback, useState } from "react";
import { Modal, Button } from "react-bootstrap";
import YoutubeOnlyBadge from "./YoutubeOnlyBadge";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  FaTrash,
  FaGripVertical,
  FaPause,
  FaPlay,
  FaStepForward,
  FaRedo,
  FaRedoAlt,
  FaRandom,
  FaListUl,
} from "react-icons/fa";

// Entries saved before queueIds existed fall back to a videoId+index key.
const getItemId = (video, index) => video.queueId ?? `${video.id.videoId}-${index}`;
const thumbOf = (video) => {
  const { thumbnails } = video.snippet;
  return (thumbnails.medium ?? thumbnails.default).url;
};

/** The video playing now, with Pause / Repeat / Shuffle / Next. */
const NowPlaying = memo(function NowPlaying({
  video,
  isPaused,
  isRepeat,
  canShuffle,
  onTogglePause,
  onToggleRepeat,
  onShuffle,
  onSkip,
  youtubeOnly,
}) {
  return (
    <div className="now-card">
      <div className="now-media">
        <img src={thumbOf(video)} alt="" className="now-thumb" />
        <div className="now-info min-w-0">
          <div className="now-label">
            {!isPaused && (
              <span className="eq" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
            {isPaused ? "Paused" : "Now playing"}
            {isRepeat && <span className="now-repeat">· Repeat on</span>}
          </div>
          <div className="now-title text-truncate-2" title={video.snippet.title}>
            {video.snippet.title}
          </div>
          {video.snippet.channelTitle && <div className="yq-meta">{video.snippet.channelTitle}</div>}
          {youtubeOnly && (
            <div className="mt-1">
              <YoutubeOnlyBadge />
            </div>
          )}
        </div>
      </div>
      <div className="now-controls" role="group" aria-label="Playback">
        <button
          className="btn yq-btn-primary now-btn"
          onClick={onTogglePause}
          aria-label={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? <FaPlay aria-hidden="true" /> : <FaPause aria-hidden="true" />}
          <span>{isPaused ? "Resume" : "Pause"}</span>
        </button>
        <button
          className={`btn now-btn yq-btn-toggle${isRepeat ? " active" : ""}`}
          onClick={onToggleRepeat}
          aria-label={isRepeat ? "Turn repeat off" : "Turn repeat on"}
          aria-pressed={isRepeat}
          title={isRepeat ? "Repeat is on" : "Repeat this video"}
        >
          <FaRedoAlt aria-hidden="true" />
          <span>Repeat</span>
        </button>
        <button
          className="btn now-btn yq-btn-toggle"
          onClick={onShuffle}
          disabled={!canShuffle}
          aria-label="Shuffle the songs up next"
          title={canShuffle ? "Mix up the songs that are coming next" : "Needs at least 2 songs up next"}
        >
          <FaRandom aria-hidden="true" />
          <span>Shuffle</span>
        </button>
        <button
          className="btn now-btn yq-btn-toggle"
          onClick={onSkip}
          aria-label="Skip to the next video"
          title="Skip to the next video"
        >
          <FaStepForward aria-hidden="true" />
          <span>Next</span>
        </button>
      </div>
    </div>
  );
});

// `index` is the absolute queue position (so >= 1 for upcoming items).
const UpNextItem = memo(function UpNextItem({ video, index, onPlay, onRemove, youtubeOnly }) {
  return (
    <Draggable draggableId={getItemId(video, index)} index={index - 1}>
      {(provided, snapshot) => (
        <li
          className={`yq-row queue-row${snapshot.isDragging ? " is-dragging" : ""}`}
          ref={provided.innerRef}
          {...provided.draggableProps}
        >
          <span
            className="drag-handle"
            title="Drag to reorder"
            aria-label="Drag to reorder"
            {...provided.dragHandleProps}
          >
            <FaGripVertical />
          </span>
          <span className="queue-position">{index}</span>
          <img src={thumbOf(video)} alt="" className="queue-thumb" loading="lazy" />
          <div className="flex-grow-1 min-w-0">
            <div className="yq-title text-truncate-2" title={video.snippet.title}>
              {video.snippet.title}
            </div>
            {video.snippet.channelTitle && (
              <div className="yq-meta text-truncate">{video.snippet.channelTitle}</div>
            )}
            {youtubeOnly && <YoutubeOnlyBadge />}
          </div>
          <div className="d-flex gap-1 flex-shrink-0">
            <button
              className="btn btn-sm yq-btn-primary row-action d-flex align-items-center justify-content-center gap-1"
              onClick={() => onPlay(index)}
              aria-label={`Play ${video.snippet.title} now`}
              title="Play now"
            >
              <FaPlay aria-hidden="true" />
              <span className="d-none d-sm-inline">Play now</span>
            </button>
            <button
              className="btn btn-sm yq-btn-ghost-danger row-action d-flex align-items-center justify-content-center gap-1"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${video.snippet.title} from the queue`}
              title="Remove from queue"
            >
              <FaTrash aria-hidden="true" />
              <span className="d-none d-sm-inline">Remove</span>
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
  isRepeat,
  onTogglePause,
  onToggleRepeat,
  onSkip,
  onPlay,
  onMove,
  onRemove,
  onClear,
  youtubeOnlyIds,
  onShuffle,
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

  const requeueButton = (primary) => (
    <button
      className={`btn btn-sm ${primary ? "yq-btn-primary" : "yq-btn-toggle"} d-flex align-items-center gap-1`}
      onClick={onRequeuePlayed}
      disabled={playedCount === 0}
      title="Add the songs that already played to the end of the queue"
    >
      <FaRedo aria-hidden="true" />
      <span className={primary ? "" : "d-none d-sm-inline"}>Re-queue played</span>
      <span className={primary ? "d-none" : "d-sm-none"}>Re-queue</span>
      {playedCount > 0 && <span className="yq-count">{playedCount}</span>}
    </button>
  );

  return (
    <section>
      {!current ? (
        <div className="yq-empty">
          <FaListUl aria-hidden="true" />
          <div className="yq-empty-title">The queue is empty</div>
          <div>Add videos from Search or your Library.</div>
          {playedCount > 0 && <div className="d-flex justify-content-center mt-3">{requeueButton(true)}</div>}
        </div>
      ) : (
        <>
          <NowPlaying
            video={current}
            isPaused={isPaused}
            isRepeat={isRepeat}
            canShuffle={upNext.length >= 2}
            onTogglePause={onTogglePause}
            onToggleRepeat={onToggleRepeat}
            onShuffle={onShuffle}
            onSkip={onSkip}
            youtubeOnly={youtubeOnlyIds?.has(current.id.videoId)}
          />

          {/* Actions for the whole list sit on the list's own header. */}
          <div className="queue-header">
            <h2 className="queue-heading">
              Up next <span className="lib-chip-count">{upNext.length}</span>
            </h2>
            <div className="queue-header-actions">
              {requeueButton(false)}
              <button
                className="btn btn-sm yq-btn-ghost-danger d-flex align-items-center gap-1"
                onClick={() => setConfirmingClear(true)}
                title="Remove every video from the queue"
              >
                <FaTrash aria-hidden="true" /> <span>Clear</span>
              </button>
            </div>
          </div>

          {upNext.length === 0 ? (
            <p className="lib-summary text-center my-3">Nothing up next. Add more from Search or your Library.</p>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="video-queue">
                {(provided) => (
                  <ul className="yq-list" ref={provided.innerRef} {...provided.droppableProps}>
                    {upNext.map((video, i) => (
                      <UpNextItem
                        key={getItemId(video, i + 1)}
                        video={video}
                        index={i + 1}
                        onPlay={onPlay}
                        onRemove={handleRequestRemove}
                        youtubeOnly={youtubeOnlyIds?.has(video.id.videoId)}
                      />
                    ))}
                    {provided.placeholder}
                  </ul>
                )}
              </Droppable>
            </DragDropContext>
          )}
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
