/**
 * The app's mark, in two versions: dark bars for light pages and white bars for
 * dark ones. Both are rendered and CSS (.app-logo-*) shows the one that fits
 * the theme, so it switches instantly with no flash.
 * (The installed app icon, public/icons/logo-v2.svg, keeps its own dark tile.)
 */
export default function AppLogo({ size = 36 }) {
  const props = { width: size, height: size, alt: "", "aria-hidden": true };
  return (
    <span className="app-logo" style={{ width: size, height: size }}>
      <img src="/icons/logo-light.svg" className="app-logo-light" {...props} />
      <img src="/icons/logo-dark.svg" className="app-logo-dark" {...props} />
    </span>
  );
}
