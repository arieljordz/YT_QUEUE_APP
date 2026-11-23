/** YouTube titles come with HTML entities (&amp; &#39;); turn them into plain text. */
export function decodeHtml(value) {
  return new DOMParser().parseFromString(value, "text/html").documentElement.textContent ?? "";
}
