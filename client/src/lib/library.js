// Helpers for the saved video library (every video the user has ever added).

/** Reduce a YouTube search result to the fields the UI uses. Returns null if unusable. */
export function slimVideo(video) {
  const id = video?.id?.videoId;
  const snippet = video?.snippet;
  if (typeof id !== "string" || !id || typeof snippet?.title !== "string") return null;

  const thumbs = snippet.thumbnails ?? {};
  const thumbnails = {};
  if (thumbs.default?.url) thumbnails.default = { url: thumbs.default.url };
  if (thumbs.medium?.url) thumbnails.medium = { url: thumbs.medium.url };
  if (!thumbnails.default && !thumbnails.medium) return null;

  return {
    id: { videoId: id },
    snippet: {
      title: snippet.title,
      channelTitle: snippet.channelTitle ?? "",
      thumbnails,
    },
  };
}

/** Union by video id; entries in `base` win and keep their order. */
export function mergeLibrary(base, extra) {
  const byId = new Map();
  for (const video of [...base, ...extra]) {
    const item = slimVideo(video);
    if (item && !byId.has(item.id.videoId)) byId.set(item.id.videoId, item);
  }
  return [...byId.values()];
}
