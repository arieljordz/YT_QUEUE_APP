/**
 * True when the app runs as an installed app (home-screen icon) rather than in
 * a browser tab. There is no tab bar to switch between the app and a player
 * window, so the player lives inside the app instead.
 */
export function isInstalledApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true // iPhone home-screen apps
  );
}
