// YouTube titles come with HTML entities (&#39; &amp;); decode the common ones for sorting.
const sortKey = (title) =>
  title.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** Compare two videos by title: ignores case and punctuation, and 2 comes before 10. */
export const byTitle = (a, b) =>
  sortKey(a.snippet.title).localeCompare(sortKey(b.snippet.title), undefined, {
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true,
  });

/**
 * Compare by title, but put videos that only play on YouTube (ids in
 * `youtubeOnlyIds`) after the ones that play here.
 */
export const playableFirstByTitle = (youtubeOnlyIds) => {
  const ytOnly = (v) => (youtubeOnlyIds?.has(v.id.videoId) ? 1 : 0);
  return (a, b) => ytOnly(a) - ytOnly(b) || byTitle(a, b);
};
