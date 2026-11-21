import { useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { FaDownload, FaPalette, FaCoffee } from "react-icons/fa";
import ImportVideosPanel from "./ImportVideosPanel";

const TABS = [
  { key: "import", label: "Import Videos", icon: <FaDownload aria-hidden="true" /> },
  { key: "appearance", label: "Appearance", icon: <FaPalette aria-hidden="true" /> },
  { key: "support", label: "Support", icon: <FaCoffee aria-hidden="true" /> },
];

function AppearancePanel({ darkMode, onToggleTheme }) {
  return (
    <div className="form-check form-switch fs-5">
      <input
        id="dark-mode"
        type="checkbox"
        className="form-check-input"
        role="switch"
        checked={darkMode}
        onChange={onToggleTheme}
      />
      <label className="form-check-label" htmlFor="dark-mode">
        Dark mode
      </label>
    </div>
  );
}

function SupportPanel() {
  return (
    <div className="text-center">
      <p className="mb-3">Enjoying the app? Buy me a coffee ☕</p>
      <img src="/images/qrcode.jpg" alt="Coffee" className="img-fluid rounded mb-3" />
      <div className="d-flex flex-column align-items-center gap-1">
        <div className="fw-bold">AR**L S.</div>
        <div className="text-muted">Mobile No.: 091.....151</div>
        <div className="text-uppercase">............WINH2J</div>
      </div>
    </div>
  );
}

export default function SettingsModal({ show, onHide, darkMode, onToggleTheme }) {
  const [tab, setTab] = useState("import");

  return (
    <Modal show={show} onHide={onHide} centered size="lg" scrollable fullscreen="sm-down">
      <Modal.Header closeButton>
        <Modal.Title as="h5">Settings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ul className="nav nav-pills mb-3 flex-nowrap overflow-auto">
          {TABS.map(({ key, label, icon }) => (
            <li className="nav-item" key={key}>
              <button
                className={`nav-link d-flex align-items-center gap-2 text-nowrap ${
                  tab === key ? "active" : ""
                }`}
                onClick={() => setTab(key)}
              >
                {icon} {label}
              </button>
            </li>
          ))}
        </ul>

        {tab === "import" && <ImportVideosPanel />}
        {tab === "appearance" && (
          <AppearancePanel darkMode={darkMode} onToggleTheme={onToggleTheme} />
        )}
        {tab === "support" && <SupportPanel />}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
