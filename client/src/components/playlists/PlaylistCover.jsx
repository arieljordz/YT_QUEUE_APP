import { MdQueueMusic } from "react-icons/md";

/**
 * A playlist's cover: the thumbnails of its first videos (up to four, as a
 * grid), or a music icon while it has none.
 */
export default function PlaylistCover({ videos, className = "" }) {
  const thumbs = videos
    .slice(0, 4)
    .map((v) => (v.snippet.thumbnails.medium ?? v.snippet.thumbnails.default).url);
  if (thumbs.length === 0) {
    return (
      <div className={`pl-cover is-empty ${className}`} aria-hidden="true">
        <MdQueueMusic />
      </div>
    );
  }
  // Fewer than four: one big cover instead of a grid with gaps.
  const shown = thumbs.length < 4 ? thumbs.slice(0, 1) : thumbs;
  return (
    <div className={`pl-cover${shown.length === 4 ? " is-grid" : ""} ${className}`} aria-hidden="true">
      {shown.map((url, i) => (
        <img key={i} src={url} alt="" loading="lazy" />
      ))}
    </div>
  );
}
