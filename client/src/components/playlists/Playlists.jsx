import { memo, useCallback, useMemo, useRef, useState } from "react";
import { FaPlus, FaSearch } from "react-icons/fa";
import { MdQueueMusic } from "react-icons/md";
import usePlaylists from "../../hooks/usePlaylists";
import { notify, plural } from "../../lib/notify";
import PlaylistCover from "./PlaylistCover";
import PlaylistDetail from "./PlaylistDetail";
import { AddVideosModal, DeletePlaylistModal, PlaylistFormModal } from "./PlaylistModals";
import { formatUpdated } from "./playlistText";

function PlaylistCard({ playlist, libraryById, onOpen }) {
  const videos = useMemo(
    () => playlist.videoIds.map((id) => libraryById.get(id)).filter(Boolean),
    [playlist.videoIds, libraryById]
  );
  return (
    <li>
      <button type="button" className="pl-card" onClick={() => onOpen(playlist.id)}>
        <PlaylistCover videos={videos} />
        <span className="pl-card-body">
          <span className="pl-card-title text-truncate-2">{playlist.name}</span>
          {playlist.description && (
            <span className="pl-card-description text-truncate-2">{playlist.description}</span>
          )}
          <span className="yq-meta">
            {plural(videos.length, "video")} · {formatUpdated(playlist)}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The Playlists tab (behind the Personal playlists flag): the room's playlists
 * as cards, and one playlist at a time when opened.
 * onPlay(name, videos) replaces the queue; onQueue(videos) adds to its end.
 */
function Playlists({ library, queuedIds, youtubeOnlyIds, onPlay, onQueue }) {
  const { playlists, createPlaylist, updatePlaylist, deletePlaylist } = usePlaylists();
  // The latest list, for Undo (which runs after other changes may have landed).
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("");
  // Which dialog is open: "create" | "edit" | "add" | "delete" | null.
  const [dialog, setDialog] = useState(null);
  const closeDialog = useCallback(() => setDialog(null), []);

  const libraryById = useMemo(() => new Map(library.map((v) => [v.id.videoId, v])), [library]);
  const open = playlists.find((p) => p.id === openId) ?? null;

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return playlists;
    return playlists.filter(
      (p) => p.name.toLowerCase().includes(needle) || p.description?.toLowerCase().includes(needle)
    );
  }, [playlists, filter]);

  const handleCreate = async (fields) => {
    const id = await createPlaylist(fields);
    if (!id) return false;
    notify.playlists.created(fields.name.trim());
    setOpenId(id);
    return true;
  };

  const handleDelete = async () => {
    const ok = await deletePlaylist(open.id);
    if (ok) {
      notify.playlists.deleted(open.name);
      setOpenId(null);
    }
    return ok;
  };

  const handleAddVideos = async (ids) => {
    const ok = await updatePlaylist(open.id, { videoIds: [...open.videoIds, ...ids] });
    if (ok) notify.playlists.videosAdded(ids.length, open.name);
    return ok;
  };

  const handleReorder = useCallback(
    (videoIds) => openId && updatePlaylist(openId, { videoIds }),
    [openId, updatePlaylist]
  );

  const handleRemoveVideo = useCallback(
    async (videoId, index) => {
      if (!open) return;
      const ok = await updatePlaylist(open.id, { videoIds: open.videoIds.filter((id) => id !== videoId) });
      if (!ok) return;
      const playlistId = open.id;
      notify.playlists.videoRemoved(() => {
        // Back where it was, in the playlist as it is now.
        const current = playlistsRef.current.find((p) => p.id === playlistId);
        if (!current) return;
        const ids = current.videoIds.filter((id) => id !== videoId);
        const at = Math.min(index, ids.length);
        updatePlaylist(playlistId, { videoIds: [...ids.slice(0, at), videoId, ...ids.slice(at)] });
      });
    },
    [open, updatePlaylist]
  );

  if (open) {
    return (
      <>
        <PlaylistDetail
          playlist={open}
          libraryById={libraryById}
          queuedIds={queuedIds}
          youtubeOnlyIds={youtubeOnlyIds}
          onBack={() => setOpenId(null)}
          onPlay={(videos) => onPlay(open.name, videos)}
          onQueue={onQueue}
          onAddVideos={() => setDialog("add")}
          onEdit={() => setDialog("edit")}
          onDelete={() => setDialog("delete")}
          onReorder={handleReorder}
          onRemoveVideo={handleRemoveVideo}
        />
        {dialog === "edit" && (
          <PlaylistFormModal
            show
            playlist={open}
            onSave={(fields) => updatePlaylist(open.id, fields)}
            onClose={closeDialog}
          />
        )}
        {dialog === "add" && (
          <AddVideosModal
            show
            playlist={open}
            library={library}
            youtubeOnlyIds={youtubeOnlyIds}
            onAdd={handleAddVideos}
            onClose={closeDialog}
          />
        )}
        {dialog === "delete" && (
          <DeletePlaylistModal show playlist={open} onConfirm={handleDelete} onClose={closeDialog} />
        )}
      </>
    );
  }

  return (
    <section>
      <div className="lib-toolbar">
        <div className="lib-search">
          <FaSearch aria-hidden="true" />
          <input
            type="search"
            className="form-control"
            placeholder="Search your playlists"
            aria-label="Search playlists"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={playlists.length === 0}
          />
        </div>
        <button
          className="btn yq-btn-primary text-nowrap d-flex align-items-center gap-1"
          onClick={() => setDialog("create")}
        >
          <FaPlus aria-hidden="true" /> Create playlist
        </button>
      </div>

      <p className="lib-summary" aria-live="polite">
        {filter.trim()
          ? `${shown.length} ${shown.length === 1 ? "match" : "matches"} for “${filter.trim()}”`
          : plural(playlists.length, "playlist")}
      </p>

      {shown.length === 0 ? (
        <div className="yq-empty">
          {filter.trim() ? <FaSearch aria-hidden="true" /> : <MdQueueMusic aria-hidden="true" />}
          <div className="yq-empty-title">{filter.trim() ? "No matches" : "No playlists yet"}</div>
          <div>
            {filter.trim()
              ? "Try another name."
              : "Create a playlist, pick songs from your library, and play them all in one go."}
          </div>
        </div>
      ) : (
        <ul className="pl-grid">
          {shown.map((p) => (
            <PlaylistCard key={p.id} playlist={p} libraryById={libraryById} onOpen={setOpenId} />
          ))}
        </ul>
      )}

      {dialog === "create" && (
        <PlaylistFormModal
          show
          library={library}
          youtubeOnlyIds={youtubeOnlyIds}
          onSave={handleCreate}
          onClose={closeDialog}
        />
      )}
    </section>
  );
}

export default memo(Playlists);
