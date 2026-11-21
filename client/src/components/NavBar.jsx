import { useState, useEffect, useCallback } from "react";
import { Dropdown } from "react-bootstrap";
import { FaCog, FaDownload, FaPalette, FaCoffee } from "react-icons/fa";
import ImportVideosModal from "./ImportVideosModal";
import AppearanceModal from "./AppearanceModal";
import SupportModal from "./SupportModal";

const NavBar = () => {
  // Read the saved theme up front so the first paint is already correct.
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("theme") === "dark"
  );
  // Which settings window is open: null | "import" | "appearance" | "support".
  const [openModal, setOpenModal] = useState(null);

  useEffect(() => {
    document.body.classList.toggle("bg-dark", darkMode);
    document.body.classList.toggle("text-light", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const toggleTheme = useCallback(() => setDarkMode((dark) => !dark), []);
  const closeModal = useCallback(() => setOpenModal(null), []);

  return (
    <>
      <nav
        className={`navbar navbar-expand-lg ${
          darkMode ? "navbar-light bg-light" : "navbar-dark bg-dark"
        } px-3 py-1`}
      >
        <span className="navbar-brand py-0 fs-6">🎬 YouTube Queueing App</span>

        <div className="ms-auto">
          <Dropdown align="end">
            <Dropdown.Toggle
              as="span"
              id="dropdown-gear"
              className="d-flex align-items-center"
              style={{ cursor: "pointer" }}
            >
              <FaCog size={16} color={darkMode ? "#000" : "#fff"} />
            </Dropdown.Toggle>

            <Dropdown.Menu className="py-1">
              <Dropdown.Item
                className="small d-flex align-items-center gap-2"
                onClick={() => setOpenModal("import")}
              >
                <FaDownload aria-hidden="true" /> Import Videos
              </Dropdown.Item>
              <Dropdown.Divider className="m-0" />
              <Dropdown.Item
                className="small d-flex align-items-center gap-2"
                onClick={() => setOpenModal("appearance")}
              >
                <FaPalette aria-hidden="true" /> Appearance
              </Dropdown.Item>
              <Dropdown.Divider className="m-0" />
              <Dropdown.Item
                className="small d-flex align-items-center gap-2"
                onClick={() => setOpenModal("support")}
              >
                <FaCoffee aria-hidden="true" /> Support
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </nav>

      <ImportVideosModal show={openModal === "import"} onHide={closeModal} />
      <AppearanceModal
        show={openModal === "appearance"}
        onHide={closeModal}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
      />
      <SupportModal show={openModal === "support"} onHide={closeModal} />
    </>
  );
};

export default NavBar;
