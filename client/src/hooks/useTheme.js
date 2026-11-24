import { useEffect, useState } from "react";
import useFeatureFlags from "./useFeatureFlags";

/**
 * The app theme. The user's choice is kept on this device; the admin decides
 * which themes are available (lightMode / darkMode feature flags). When the
 * chosen theme is turned off, the other one is used.
 */
export default function useTheme() {
  const { flags } = useFeatureFlags();
  // Read up front so the first paint is already correct.
  const [preference, setPreference] = useState(() =>
    localStorage.getItem("theme") === "dark" ? "dark" : "light"
  );
  const options = ["light", "dark"].filter((t) => flags[`${t}Mode`]);
  // The server never allows both off; fall back to light if it ever happens.
  const theme = options.includes(preference) ? preference : options[0] ?? "light";

  useEffect(() => {
    // Bootstrap 5.3 themes every component from this attribute.
    document.documentElement.setAttribute("data-bs-theme", theme);
  }, [theme]);

  const setTheme = (next) => {
    setPreference(next);
    localStorage.setItem("theme", next);
  };

  return { theme, setTheme, options };
}
