import { useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { notify } from "../../lib/notify";
import { FaCog } from "react-icons/fa";
import { MdFileDownload, MdLibraryAdd, MdToggleOn, MdLock } from "react-icons/md";
import AppTabs from "../layout/AppTabs";
import useAdmin from "../../hooks/useAdmin";
import { logoutAdmin } from "../../api/admin";
import AdminSignIn from "../settings/AdminSignIn";
import ImportVideosPanel from "../settings/ImportVideosPanel";
import AddLibraryPanel from "../settings/AddLibraryPanel";
import FeatureFlagsPanel from "../settings/FeatureFlagsPanel";

/**
 * Settings: Import Videos, Add Library, Feature Flags and the admin password.
 * Opening it always asks for the admin password, and closing it signs the
 * admin out again, because this app often runs on a shared device (a TV).
 * The server checks the admin sign-in on every one of these requests too.
 */
// The Settings tabs: full names on wide screens, short ones under the icon on phones.
const TABS = [
  { key: "import", label: "Import Videos", shortLabel: "Import", icon: <MdFileDownload aria-hidden="true" /> },
  { key: "library", label: "Add Library", shortLabel: "Library", icon: <MdLibraryAdd aria-hidden="true" /> },
  { key: "flags", label: "Feature Flags", shortLabel: "Flags", icon: <MdToggleOn aria-hidden="true" /> },
  { key: "password", label: "Admin Password", shortLabel: "Password", icon: <MdLock aria-hidden="true" /> },
];

function SettingsBody({ onClose }) {
  const admin = useAdmin();
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState("import");

  if (admin.error) return <p className="text-danger">{admin.error}</p>;
  if (!admin.status) return <p className="text-body-secondary">Checking…</p>;

  if (!admin.status.configured) {
    return (
      <p className="mb-0">
        No admin password has been set yet. To set it, choose <strong>Leave Room</strong>, then{" "}
        <strong>Manage Rooms</strong> on the room screen.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <AdminSignIn
        mode="login"
        purpose="Settings are for the admin. Enter the admin password to continue."
        onDone={() => setSignedIn(true)}
        onStale={admin.refresh}
        onCancel={onClose}
      />
    );
  }

  const expired = () => {
    notify.admin.sessionExpired();
    setSignedIn(false);
  };

  return (
    <>
      <AppTabs tabs={TABS} active={tab} onSelect={setTab} className="settings-tabs" ariaLabel="Settings sections" />
      {tab === "import" && <ImportVideosPanel />}
      {tab === "library" && <AddLibraryPanel />}
      {tab === "flags" && <FeatureFlagsPanel onAdminRequired={expired} />}
      {tab === "password" && (
        <AdminSignIn
          mode="change"
          onDone={() => {
            notify.admin.passwordChanged();
            setTab("import");
          }}
        />
      )}
    </>
  );
}

export default function SettingsModal({ show, onHide }) {
  const close = () => {
    logoutAdmin();
    onHide();
  };
  return (
    <Modal show={show} onHide={close} centered size="lg" scrollable fullscreen="sm-down">
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaCog aria-hidden="true" /> Settings
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{show && <SettingsBody onClose={close} />}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={close}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
