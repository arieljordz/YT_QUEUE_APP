import { useState, useCallback } from "react";
import { Dropdown } from "react-bootstrap";
import { useLocation } from "react-router-dom";
import useInstallPrompt from "../../hooks/useInstallPrompt";
import useTheme from "../../hooks/useTheme";
import { FaBars, FaDoorOpen, FaQrcode, FaPalette, FaCog, FaCoffee } from "react-icons/fa";
import { InviteModal, AppearanceModal, LeaveRoomModal } from "../modals/MenuModals";
import SettingsModal from "../modals/SettingsModal";
import SupportModal from "../modals/SupportModal";
import AppLogo from "./AppLogo";

// The user menu. Everyone gets these five; Settings asks for the admin password.
const ITEMS = [
  { key: "leave", label: "Leave Room", Icon: FaDoorOpen },
  { key: "invite", label: "Invite", Icon: FaQrcode },
  { key: "appearance", label: "Appearance", Icon: FaPalette },
  { key: "settings", label: "Settings", Icon: FaCog },
  { key: "support", label: "Support", Icon: FaCoffee },
];

const NavBar = ({ sync }) => {
  // The theme the admin allows (feature flags) and this device prefers.
  const { theme, setTheme, options } = useTheme();
  // Which window is open: null | one of ITEMS' keys.
  const [openModal, setOpenModal] = useState(null);

  // Kept here so the browser's install offer is caught as soon as the app loads.
  const { canInstall, install } = useInstallPrompt();

  const closeModal = useCallback(() => setOpenModal(null), []);

  // The player page is all video: no bar there. (The theme above is still applied.)
  if (useLocation().pathname === "/player") return null;

  return (
    <>
      {/* Like YouTube: no separate bar, just the logo and menu on the page's own background. */}
      <nav className="navbar app-header px-3 py-2">
        <span className="navbar-brand py-0 fs-5 fw-semibold d-flex align-items-center gap-2">
          <AppLogo size={26} /> QueueUp
        </span>

        <div className="ms-auto d-flex align-items-center gap-2">
          {sync.roomName && <span className="badge text-bg-secondary">{sync.roomName}</span>}
          <Dropdown align="end">
            <Dropdown.Toggle
              as="span"
              id="dropdown-gear"
              role="button"
              aria-label="Menu"
              title="Menu"
              className="d-flex align-items-center"
              style={{ cursor: "pointer" }}
            >
              <FaBars size={18} aria-hidden="true" />
            </Dropdown.Toggle>

            <Dropdown.Menu className="py-1">
              {ITEMS.map((item, i) => {
                const { key, label, Icon } = item;
                return (
                <div key={key}>
                  {i > 0 && <Dropdown.Divider className="m-0" />}
                  <Dropdown.Item
                    className="small d-flex align-items-center gap-2"
                    onClick={() => setOpenModal(key)}
                  >
                    <Icon aria-hidden="true" /> {label}
                  </Dropdown.Item>
                </div>
                );
              })}
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </nav>

      <LeaveRoomModal
        show={openModal === "leave"}
        onHide={closeModal}
        roomName={sync.roomName}
        onLeave={async () => {
          closeModal();
          await sync.leaveRoom();
        }}
      />
      <InviteModal show={openModal === "invite"} onHide={closeModal} />
      <AppearanceModal
        show={openModal === "appearance"}
        onHide={closeModal}
        theme={theme}
        setTheme={setTheme}
        options={options}
      />
      <SettingsModal show={openModal === "settings"} onHide={closeModal} />
      <SupportModal
        show={openModal === "support"}
        onHide={closeModal}
        canInstall={canInstall}
        onInstall={install}
      />
    </>
  );
};

export default NavBar;
