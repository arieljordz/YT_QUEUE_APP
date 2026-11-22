import { useState, useEffect, useCallback } from "react";
import { Dropdown } from "react-bootstrap";
import { FaCog, FaDownload, FaBookOpen, FaPalette, FaCoffee } from "react-icons/fa";
import ImportVideosModal from "./ImportVideosModal";
import AddLibraryModal from "./AddLibraryModal";
import AppearanceModal from "./AppearanceModal";
import SupportModal from "./SupportModal";

const NavBar = () => {
  // Read the saved theme up front so the first paint is already correct.
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("theme") === "dark"
  );
  // Which settings window is open: null | "import" | "library" | "appearance" | "support".
  const [openModal, setOpenModal] = useState(null);

  useEffect(() => {
    // Bootstrap 5.3 themes every component (cards, lists, inputs, modals, tabs)
    // from this attribute.
    document.documentElement.setAttribute("data-bs-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const toggleTheme = useCallback(() => setDarkMode((dark) => !dark), []);
  const closeModal = useCallback(() => setOpenModal(null), []);

  return (
    <>
      {/* The bar uses the opposite theme to the page so it always stands out. */}
      <nav
        data-bs-theme={darkMode ? "light" : "dark"}
        className={`navbar navbar-expand-lg ${darkMode ? "bg-light" : "bg-dark"} px-3 py-1`}
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
                onClick={() => setOpenModal("library")}
              >
                <FaBookOpen aria-hidden="true" /> Add Library
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
      <AddLibraryModal show={openModal === "library"} onHide={closeModal} />
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
