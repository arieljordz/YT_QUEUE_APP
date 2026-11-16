import { memo, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  FaTrash,
  FaArrowUp,
  FaArrowDown,
  FaPause,
  FaPlay,
  FaArrowRight,
  FaArrowLeft,
} from "react-icons/fa";

// Entries saved before queueIds existed fall back to a videoId+index key.
const getItemId = (video, index) => video.queueId ?? `${video.id.videoId}-${index}`;

const QueueItem = memo(function QueueItem({
  video,
  index,
  isLast,
  isPaused,
  onTogglePause,
  onPlay,
  onMove,
  onRemove,
}) {
  const isPlaying = index === 0;
  const itemId = getItemId(video, index);

  return (
    <Draggable draggableId={itemId} index={index} isDragDisabled={isPlaying}>
      {(provided) => (
        <li
          className={`list-group-item d-flex justify-content-between align-items-center ${
            isPlaying ? "bg-primary text-white" : ""
          }`}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <span
            className="me-2 text-truncate"
            style={{ maxWidth: "50%" }}
            title={video.snippet.title}
          >
            {isPlaying ? "▶️ " : "🎬 "}
            {video.snippet.title}
          </span>

          <div className="d-flex flex-nowrap align-items-center overflow-auto">
            {isPlaying ? (
              <button
                className="btn btn-sm btn-outline-light me-1"
                onClick={onTogglePause}
              >
                {isPaused ? <FaPlay /> : <FaPause />}
              </button>
            ) : (
              <button
                className="btn btn-sm btn-outline-primary me-1"
                onClick={() => onPlay(index)}
              >
                <FaPlay />
              </button>
            )}

            <button
              className="btn btn-sm btn-outline-warning me-1"
              onClick={() => onMove(index, index - 1)}
              disabled={index <= 1}
            >
              <FaArrowUp />
            </button>

            <button
              className="btn btn-sm btn-outline-warning me-1"
              onClick={() => onMove(index, index + 1)}
              disabled={isPlaying || isLast}
            >
              <FaArrowDown />
            </button>

            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => onRemove(index)}
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
  onMove,
  onRemove,
  onClear,
  onPlay,
  isPaused,
  onTogglePause,
  isSidebarCollapsed,
  onToggleSidebar,
  hasPlayedVideos,
  onRequeuePlayed,
}) {
  const handleDragEnd = useCallback(
    (result) => {
      if (!result.destination) return;
      // Position 0 is the playing video; Home.handleMove enforces that too.
      onMove(result.source.index, result.destination.index);
    },
    [onMove]
  );

  return (
    <div className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5>🎵 Queue</h5>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-primary d-flex align-items-center gap-1"
            onClick={onToggleSidebar}
          >
            {isSidebarCollapsed ? (
              <>
                <FaArrowRight />
                Show Search
              </>
            ) : (
              <>
                <FaArrowLeft />
                Hide Search
              </>
            )}
          </button>
          <button
            className="btn btn-sm btn-warning"
            onClick={onRequeuePlayed}
            disabled={!hasPlayedVideos}
          >
            Re-Queue Played
          </button>

          {queue.length > 0 && (
            <button className="btn btn-sm btn-danger" onClick={onClear}>
              <FaTrash className="me-1" /> Clear All
            </button>
          )}
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="video-queue">
          {(provided) => (
            <ul
              className="list-group"
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {queue.map((video, index) => (
                <QueueItem
                  key={getItemId(video, index)}
                  video={video}
                  index={index}
                  isLast={index === queue.length - 1}
                  isPaused={isPaused}
                  onTogglePause={onTogglePause}
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
    </div>
  );
}

export default Queue;
