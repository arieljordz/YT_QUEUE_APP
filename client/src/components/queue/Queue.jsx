import { memo, useCallback, useId, useRef, useState } from "react";
import { Modal, Button } from "react-bootstrap";
import YoutubeOnlyBadge from "../videos/YoutubeOnlyBadge";
import { VolumeToggle, VolumePanel } from "./VolumeControl";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useNowPosition } from "../../hooks/usePlayerProgress";
import { formatClock } from "../../lib/progress";
import { plural } from "../../lib/notify";
import { MdPlaylistRemove } from "react-icons/md";
import {
  FaTrash,
  FaGripVertical,
  FaPause,
  FaPlay,
  FaStepForward,
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

/**
 * Elapsed time, a bar, and the length, as reported by the player (wherever it
 * runs), with `children` (the volume button) at the end of the row. Before the
 * player reports anything, the row holds only the children.
 */
function NowProgress({ queueId, isPaused, children }) {
  const progress = useNowPosition(queueId, isPaused);
  if (!progress) return <div className="now-progress now-progress-empty">{children}</div>;
  const { position, duration } = progress;
  const percent = (position / duration) * 100;
  return (
    <div className="now-progress">
      <span className="now-time">{formatClock(position)}</span>
      <div
        className="now-bar"
        role="progressbar"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${formatClock(position)} of ${formatClock(duration)}`}
      >
        <div className="now-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="now-time">{formatClock(duration)}</span>
      {children}
    </div>
  );
}

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
  // The volume slider stays folded behind its button until asked for.
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumePanelId = useId();
  const volumeButtonRef = useRef(null);
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
      <NowProgress queueId={video.queueId} isPaused={isPaused}>
        <VolumeToggle
          open={volumeOpen}
          onToggle={() => setVolumeOpen((open) => !open)}
          panelId={volumePanelId}
          buttonRef={volumeButtonRef}
        />
      </NowProgress>
      {volumeOpen && (
        <VolumePanel
          id={volumePanelId}
          onClose={() => {
            setVolumeOpen(false);
            volumeButtonRef.current?.focus();
          }}
        />
      )}
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
          aria-label="Shuffle the videos up next"
          title={canShuffle ? "Mix up the videos that are coming next" : "Needs at least 2 videos up next"}
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
      {!current ? (
        <div className="yq-empty">
          <FaListUl aria-hidden="true" />
          <div className="yq-empty-title">The queue is empty</div>
          <div>Add videos from Search or your Library.</div>
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
              {/* Empties the whole queue, the playing video included (not only "Up next"). */}
              <button
                className="btn btn-sm yq-btn-ghost-danger d-flex align-items-center gap-1"
                onClick={() => setConfirmingClear(true)}
                title="Remove every video from the queue, including the one playing now"
              >
                <MdPlaylistRemove size={18} aria-hidden="true" /> <span>Clear queue</span>
              </button>
            </div>
          </div>

          {upNext.length === 0 ? (
            <p className="lib-summary text-center my-3">Nothing up next. Add more from Search or your Library.</p>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              {/* Scrolls on its own after 7 videos; dragging near its edge scrolls it too. */}
              <div className="queue-scroll">
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
              </div>
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
        confirmLabel="Clear queue"
        onConfirm={confirmClear}
        onCancel={() => setConfirmingClear(false)}
      >
        {queue.length === 1
          ? "This removes the video playing now and empties the queue."
          : `This removes all ${plural(queue.length, "video")} from the queue, including the one playing now.`}{" "}
        You can undo it right after.
      </ConfirmModal>
    </section>
  );
}

export default memo(Queue);
