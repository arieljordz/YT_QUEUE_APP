const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  copy: "©", reg: "®", trade: "™", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  middot: "·", bull: "•",
};

/** YouTube sends titles with HTML entities (&#39; &amp; &quot;); turn them into plain characters. */
export function decodeEntities(value) {
  if (typeof value !== "string") return value;
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const num = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      try {
        return String.fromCodePoint(num);
      } catch {
        return match; // not a real character
      }
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Same as decodeEntities (kept for the places that already call it by this name). */
export const decodeHtml = (value) => decodeEntities(value) ?? "";
