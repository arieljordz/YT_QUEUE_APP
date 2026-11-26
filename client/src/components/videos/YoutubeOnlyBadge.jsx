/** Tag for a video whose owner turned embedding off: it plays on youtube.com only. */
export default function YoutubeOnlyBadge() {
  return (
    <span
      className="badge bg-warning text-dark"
      title="The owner disabled embedding, so it can't play in the player tab."
    >
      YouTube only
    </span>
  );
}
