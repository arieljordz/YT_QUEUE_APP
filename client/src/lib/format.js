/** 212 -> "3:32", 3725 -> "1:02:05". Returns null when there is no length (live streams). */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** 1234567 -> "1.2M views". Returns null when YouTube hides the count. */
export function formatViews(count) {
  if (!Number.isFinite(count)) return null;
  return `${compact.format(count)} ${count === 1 ? "view" : "views"}`;
}

/** "3:32 · 1.2M views" from a video's details (any missing part is left out). */
export function describeVideo(details) {
  if (!details) return "";
  return [formatDuration(details.seconds), formatViews(details.views)].filter(Boolean).join(" · ");
}
