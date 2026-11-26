import { memo, useCallback, useMemo } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  FaArrowLeft,
  FaGripVertical,
  FaPlay,
  FaPen,
  FaPlus,
  FaTrash,
  FaListUl,
  FaBan,
} from "react-icons/fa";
import { MdPlaylistAdd } from "react-icons/md";
import YoutubeOnlyBadge from "../videos/YoutubeOnlyBadge";
import useVideoDurations from "../../hooks/useVideoDurations";
import { formatDuration } from "../../lib/format";
import { plural } from "../../lib/notify";
import PlaylistCover from "./PlaylistCover";
import { formatUpdated } from "./playlistText";

const thumbOf = (video) => (video.snippet.thumbnails.medium ?? video.snippet.thumbnails.default).url;

const PlaylistRow = memo(function PlaylistRow({ videoId, video, index, seconds, youtubeOnly, inQueue, onRemove }) {
  const title = video?.snippet.title ?? "Unavailable video";
  const length = video ? formatDuration(seconds) : null;
  return (
    <Draggable draggableId={videoId} index={index}>
      {(provided, snapshot) => (
        <li
          className={`yq-row queue-row${snapshot.isDragging ? " is-dragging" : ""}${video ? "" : " is-missing"}`}
          ref={provided.innerRef}
          {...provided.draggableProps}
        >
          <span className="drag-handle" title="Drag to reorder" aria-label={`Reorder ${title}`} {...provided.dragHandleProps}>
            <FaGripVertical />
          </span>
          <span className="queue-position">{index + 1}</span>
          {video ? (
            <img src={thumbOf(video)} alt="" className="queue-thumb" loading="lazy" />
          ) : (
            <span className="queue-thumb pl-thumb-missing" aria-hidden="true">
              <FaBan />
            </span>
          )}
          <div className="flex-grow-1 min-w-0">
            <div className="yq-title text-truncate-2" title={title}>
              {title}
            </div>
            <div className="yq-meta text-truncate">
              {video
                ? [video.snippet.channelTitle, length].filter(Boolean).join(" · ")
                : "Removed from your library. It is skipped when the playlist plays."}
            </div>
            {(inQueue || youtubeOnly) && (
              <div className="d-flex flex-wrap gap-1 mt-1">
                {inQueue && <span className="yq-badge-queued">In queue</span>}
                {youtubeOnly && <YoutubeOnlyBadge />}
              </div>
            )}
          </div>
          {length && <span className="pl-duration d-none d-md-inline">{length}</span>}
          <button
            className="btn btn-sm yq-btn-ghost-danger row-action d-flex align-items-center justify-content-center gap-1 flex-shrink-0"
            onClick={() => onRemove(videoId, index)}
            aria-label={`Remove ${title} from the playlist`}
            title="Remove from the playlist (it stays in your library)"
          >
            <FaTrash aria-hidden="true" />
            <span className="d-none d-sm-inline">Remove</span>
          </button>
        </li>
      )}
    </Draggable>
  );
});

/**
 * One playlist: its videos in playback order, with drag-to-reorder and Remove,
 * plus Play, Add to queue, Add videos, Edit and Delete for the whole playlist.
 */
function PlaylistDetail({
  playlist,
  libraryById,
  queuedIds,
  youtubeOnlyIds,
  onBack,
  onPlay,
  onQueue,
  onAddVideos,
  onEdit,
  onDelete,
  onReorder,
  onRemoveVideo,
}) {
  const { videoIds } = playlist;
  const available = useMemo(
    () => videoIds.map((id) => libraryById.get(id)).filter(Boolean),
    [videoIds, libraryById]
  );
  const availableIds = useMemo(() => available.map((v) => v.id.videoId), [available]);
  const durations = useVideoDurations(availableIds);
  const totalSeconds = available.reduce((sum, v) => sum + (durations[v.id.videoId] ?? 0), 0);
  const missing = videoIds.length - available.length;

  const handleDragEnd = useCallback(
    (result) => {
      if (!result.destination || result.destination.index === result.source.index) return;
      const next = [...videoIds];
      next.splice(result.destination.index, 0, next.splice(result.source.index, 1)[0]);
      onReorder(next);
    },
    [videoIds, onReorder]
  );

  const meta = [
    plural(available.length, "video"),
    missing > 0 ? `${missing} unavailable` : null,
    formatDuration(totalSeconds),
    formatUpdated(playlist),
  ].filter(Boolean);

  return (
    <section>
      <button type="button" className="btn btn-sm btn-link pl-back px-0 mb-2" onClick={onBack}>
        <FaArrowLeft aria-hidden="true" /> All playlists
      </button>

      <div className="pl-header">
        <PlaylistCover videos={available} className="pl-header-cover" />
        <div className="min-w-0 flex-grow-1">
          <h2 className="pl-header-title">{playlist.name}</h2>
          {playlist.description && <p className="pl-header-description">{playlist.description}</p>}
          <div className="yq-meta">{meta.join(" · ")}</div>
          <div className="pl-actions">
            <button
              className="btn yq-btn-primary d-flex align-items-center gap-1"
              onClick={() => onPlay(available)}
              disabled={available.length === 0}
              title="Replace the queue with this playlist and start playing it"
            >
              <FaPlay aria-hidden="true" /> Play
            </button>
            <button
              className="btn yq-btn-toggle d-flex align-items-center gap-1"
              onClick={() => onQueue(available)}
              disabled={available.length === 0}
              title="Add this playlist's videos to the end of the queue"
            >
              <MdPlaylistAdd size={20} aria-hidden="true" /> <span>Add to queue</span>
            </button>
            <button className="btn yq-btn-toggle d-flex align-items-center gap-1" onClick={onAddVideos}>
              <FaPlus aria-hidden="true" /> <span>Add videos</span>
            </button>
            <button
              className="btn yq-btn-toggle d-flex align-items-center gap-1"
              onClick={onEdit}
              aria-label="Edit name and description"
              title="Edit name and description"
            >
              <FaPen aria-hidden="true" /> <span>Edit</span>
            </button>
            <button
              className="btn yq-btn-ghost-danger d-flex align-items-center gap-1"
              onClick={onDelete}
              aria-label="Delete playlist"
              title="Delete this playlist (its videos stay in your library)"
            >
              <FaTrash aria-hidden="true" /> <span className="d-none d-sm-inline">Delete</span>
            </button>
          </div>
        </div>
      </div>

      {videoIds.length === 0 ? (
        <div className="yq-empty">
          <FaListUl aria-hidden="true" />
          <div className="yq-empty-title">This playlist is empty</div>
          <div>Use Add videos to pick songs from your library.</div>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="queue-scroll">
            <Droppable droppableId={`playlist-${playlist.id}`}>
              {(provided) => (
                <ul className="yq-list" ref={provided.innerRef} {...provided.droppableProps}>
                  {videoIds.map((id, index) => (
                    <PlaylistRow
                      key={id}
                      videoId={id}
                      video={libraryById.get(id)}
                      index={index}
                      seconds={durations[id]}
                      youtubeOnly={youtubeOnlyIds?.has(id)}
                      inQueue={queuedIds.has(id)}
                      onRemove={onRemoveVideo}
                    />
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </div>
        </DragDropContext>
      )}
    </section>
  );
}

export default memo(PlaylistDetail);
