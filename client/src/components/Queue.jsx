import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  FaTrash,
  FaArrowUp,
  FaArrowDown,
  FaPause,
  FaPlay as FaPlayIcon,
  FaArrowRight,
  FaArrowLeft,
} from "react-icons/fa";

function Queue({
  queue,
  onReorder,
  onRemove,
  onClear,
  onPlay,
  isPaused,
  setIsPaused,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
}) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;

    // Prevent dragging the currently playing video
    if (result.source.index === 0 || result.destination.index === 0) return;

    const reordered = [...queue];
    const [movedItem] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, movedItem);

    onReorder(reordered);
  };

  const moveItem = (index, direction) => {
    const newQueue = [...queue];
    const targetIndex = index + direction;

    // Prevent moving into index 0 (currently playing)
    if (index === 0 || targetIndex === 0) return;

    if (targetIndex > 0 && targetIndex < newQueue.length) {
      const [item] = newQueue.splice(index, 1);
      newQueue.splice(targetIndex, 0, item);
      onReorder(newQueue);
    }
  };

  const currentlyPlaying = queue[0];

  return (
    <div className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5>🎵 Queue</h5>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-primary d-flex align-items-center gap-1"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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
              {queue.map((video, index) => {
                const isPlaying = index === 0;

                return (
                  <Draggable
                    key={`${video.id.videoId}-${index}`}
                    draggableId={`${video.id.videoId}-${index}`}
                    index={index}
                    isDragDisabled={isPlaying}
                  >
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
                              onClick={() => setIsPaused((prev) => !prev)}
                            >
                              {isPaused ? <FaPlayIcon /> : <FaPause />}
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-outline-primary me-1"
                              onClick={() => onPlay(index)}
                            >
                              <FaPlayIcon />
                            </button>
                          )}

                          <button
                            className="btn btn-sm btn-outline-warning me-1"
                            onClick={() => moveItem(index, -1)}
                            disabled={index <= 1}
                          >
                            <FaArrowUp />
                          </button>

                          <button
                            className="btn btn-sm btn-outline-warning me-1"
                            onClick={() => moveItem(index, 1)}
                            disabled={index === 0 || index === queue.length - 1}
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
              })}
              {provided.placeholder}
            </ul>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

export default Queue;
