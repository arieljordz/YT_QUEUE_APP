// Sorting and searching helpers for lists of videos (the library can hold
// thousands, so the per-video work is done once and remembered).

// YouTube titles come with HTML entities (&#39; &amp;); decode the common ones for sorting.
const sortKey = (title) =>
  title.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

// One collator for every comparison: building one per call (what localeCompare
// with options does) made sorting a big library take seconds.
const collator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: true,
});

// Per-video keys, remembered for as long as the video object lives. Library
// videos keep their object until they change, so each key is computed once.
const sortKeys = new WeakMap();
const titleKey = (video) => {
  let key = sortKeys.get(video);
  if (key === undefined) {
    key = sortKey(video.snippet.title);
    sortKeys.set(video, key);
  }
  return key;
};

/** Compare two videos by title: ignores case and punctuation, and 2 comes before 10. */
export const byTitle = (a, b) => collator.compare(titleKey(a), titleKey(b));

/**
 * Compare by title, but put videos that only play on YouTube (ids in
 * `youtubeOnlyIds`) after the ones that play here.
 */
export const playableFirstByTitle = (youtubeOnlyIds) => {
  const ytOnly = (v) => (youtubeOnlyIds?.has(v.id.videoId) ? 1 : 0);
  return (a, b) => ytOnly(a) - ytOnly(b) || byTitle(a, b);
};

// The last title sort of each list, kept while the list itself is unchanged
// (the library array only changes when a video is added or removed), so
// reopening the Library tab or typing a search does not sort again.
const sortedLists = new WeakMap();

/** `videos` sorted by title (a new array, remembered per input array). */
export function sortedByTitle(videos) {
  let sorted = sortedLists.get(videos);
  if (!sorted) {
    sorted = [...videos].sort(byTitle);
    sortedLists.set(videos, sorted);
  }
  return sorted;
}

/**
 * Moves the videos that only play on YouTube to the end, keeping the order
 * otherwise. On a title-sorted list this gives the same order as sorting with
 * `playableFirstByTitle`, without sorting again when `youtubeOnlyIds` changes.
 */
export function playableFirst(videos, youtubeOnlyIds) {
  if (!youtubeOnlyIds || youtubeOnlyIds.size === 0) return videos;
  const playable = [];
  const ytOnly = [];
  for (const v of videos) (youtubeOnlyIds.has(v.id.videoId) ? ytOnly : playable).push(v);
  return ytOnly.length === 0 ? videos : playable.concat(ytOnly);
}

// Lowercased title and channel per video, for the search boxes.
const searchKeys = new WeakMap();

/** True when the video's title or channel contains `needle` (already lowercased). */
export function matchesSearch(video, needle) {
  if (!needle) return true;
  let keys = searchKeys.get(video);
  if (!keys) {
    keys = {
      title: video.snippet.title.toLowerCase(),
      channel: video.snippet.channelTitle?.toLowerCase() ?? "",
    };
    searchKeys.set(video, keys);
  }
  return keys.title.includes(needle) || keys.channel.includes(needle);
}
