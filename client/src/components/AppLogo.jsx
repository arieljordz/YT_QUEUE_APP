/**
 * The app's mark, drawn inline so it follows the theme: the queue bars take the
 * text color (dark on light pages, white on dark ones) and the play arrow stays red.
 * (The installed app icon, public/icons/logo-v2.svg, keeps its own dark tile.)
 */
export default function AppLogo({ size = 36 }) {
  return (
    <svg
      viewBox="87 108 360 320"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="app-logo"
    >
      <rect x="87" y="108" width="280" height="44" rx="22" fill="currentColor" />
      <rect x="87" y="186" width="168" height="44" rx="22" fill="currentColor" fillOpacity="0.72" />
      <rect x="87" y="264" width="112" height="44" rx="22" fill="currentColor" fillOpacity="0.45" />
      <path
        d="M291 242 L291 390 L411 316 Z"
        fill="var(--yq-accent, #e50914)"
        stroke="var(--yq-accent, #e50914)"
        strokeWidth="28"
        strokeLinejoin="round"
      />
    </svg>
  );
}
