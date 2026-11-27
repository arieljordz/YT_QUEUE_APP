import { useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { notify } from "../../lib/notify";
import { FaCog } from "react-icons/fa";
import { MdBackup, MdFileDownload, MdLibraryAdd, MdToggleOn, MdLock } from "react-icons/md";
import AppTabs from "../layout/AppTabs";
import useAdmin from "../../hooks/useAdmin";
import useFeatureFlags from "../../hooks/useFeatureFlags";
import { logoutAdmin } from "../../api/admin";
import AdminSignIn from "../settings/AdminSignIn";
import ImportVideosPanel from "../settings/ImportVideosPanel";
import AddLibraryPanel from "../settings/AddLibraryPanel";
import FeatureFlagsPanel from "../settings/FeatureFlagsPanel";
import BackupPanel from "../settings/BackupPanel";

/**
 * Settings: Import Videos, Add Library, Feature Flags, the admin password and
 * Backup & Restore of the database.
 * Opening it asks for the admin password (unless the "Settings password"
 * feature flag is off), and closing it signs the admin out again, because this
 * app often runs on a shared device (a TV). The server checks the same on
 * every one of these requests too (requireSettingsAccess in api/flags.js).
 */
// The Settings tabs: full names on wide screens, short ones under the icon on phones.
const TABS = [
  { key: "import", label: "Import Videos", shortLabel: "Import", icon: <MdFileDownload aria-hidden="true" /> },
  { key: "library", label: "Add Library", shortLabel: "Library", icon: <MdLibraryAdd aria-hidden="true" /> },
  { key: "flags", label: "Feature Flags", shortLabel: "Flags", icon: <MdToggleOn aria-hidden="true" /> },
  { key: "password", label: "Admin Password", shortLabel: "Password", icon: <MdLock aria-hidden="true" /> },
  { key: "backup", label: "Backup & Restore", shortLabel: "Backup", icon: <MdBackup aria-hidden="true" /> },
];

function SettingsBody({ onClose }) {
  const admin = useAdmin();
  const { flags } = useFeatureFlags();
  const [signedIn, setSignedIn] = useState(false);
  // The server asked for the password although this device thought the
  // "Settings password" flag was off (it was turned on elsewhere).
  const [mustSignIn, setMustSignIn] = useState(false);
  const [tab, setTab] = useState("import");

  // The "Settings password" feature flag: off = Settings open without the password.
  const open = !flags.settingsPassword && !mustSignIn;

  if (!open && !signedIn) {
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
    if (signedIn) notify.admin.sessionExpired();
    else notify.admin.passwordRequired();
    setSignedIn(false);
    setMustSignIn(true);
  };

  // Changing the password needs the admin sign-in, even when Settings are open.
  const tabs = signedIn ? TABS : TABS.filter((t) => t.key !== "password");
  const shown = tabs.some((t) => t.key === tab) ? tab : "import";

  return (
    <>
      <AppTabs tabs={tabs} active={shown} onSelect={setTab} className="settings-tabs" ariaLabel="Settings sections" />
      {shown === "import" && <ImportVideosPanel />}
      {shown === "library" && <AddLibraryPanel />}
      {shown === "flags" && <FeatureFlagsPanel onAdminRequired={expired} />}
      {shown === "backup" && <BackupPanel onAdminRequired={expired} />}
      {shown === "password" && (
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
