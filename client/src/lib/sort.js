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
