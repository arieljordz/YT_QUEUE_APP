import { useState, useEffect, useCallback } from "react";
import { FaCog } from "react-icons/fa";
import SettingsModal from "./SettingsModal";

const NavBar = () => {
  // Read the saved theme up front so the first paint is already correct.
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("theme") === "dark"
  );
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("bg-dark", darkMode);
    document.body.classList.toggle("text-light", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const toggleTheme = useCallback(() => setDarkMode((dark) => !dark), []);
  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  return (
    <>
      <nav
        className={`navbar navbar-expand-lg ${
          darkMode ? "navbar-light bg-light" : "navbar-dark bg-dark"
        } px-3 py-1`}
      >
        <span className="navbar-brand py-0 fs-6">🎬 YouTube Queueing App</span>

        <button
          className="btn btn-link p-0 ms-auto d-flex align-items-center"
          onClick={openSettings}
          aria-label="Settings"
          title="Settings"
        >
          <FaCog size={16} color={darkMode ? "#000" : "#fff"} />
        </button>
      </nav>

      <SettingsModal
        show={showSettings}
        onHide={closeSettings}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />
    </>
  );
};

export default NavBar;
