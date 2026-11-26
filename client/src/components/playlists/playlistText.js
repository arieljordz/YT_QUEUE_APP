const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
};

/** "Updated 26 Nov 2026", or "Created ..." while it was never changed. */
export function formatUpdated(playlist) {
  const created = formatDate(playlist.createdAt);
  const updated = formatDate(playlist.updatedAt);
  if (updated && playlist.updatedAt !== playlist.createdAt) return `Updated ${updated}`;
  return created ? `Created ${created}` : null;
}
