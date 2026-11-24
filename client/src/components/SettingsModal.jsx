import { useState } from "react";
import { Modal, Button, Tab, Tabs } from "react-bootstrap";
import { toast } from "react-toastify";
import { FaCog } from "react-icons/fa";
import useAdmin from "../hooks/useAdmin";
import { logoutAdmin } from "../api/admin";
import AdminSignIn from "./AdminSignIn";
import ImportVideosPanel from "./ImportVideosPanel";
import AddLibraryPanel from "./AddLibraryPanel";
import FeatureFlagsPanel from "./FeatureFlagsPanel";

/**
 * Settings: Import Videos, Add Library, Feature Flags and the admin password.
 * Opening it always asks for the admin password, and closing it signs the
 * admin out again, because this app often runs on a shared device (a TV).
 * The server checks the admin sign-in on every one of these requests too.
 */
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
    toast.info("Your admin sign-in expired. Enter the password again.");
    setSignedIn(false);
  };

  return (
    <Tabs activeKey={tab} onSelect={(k) => setTab(k)} className="mb-3" fill>
      <Tab eventKey="import" title="Import Videos">
        {tab === "import" && <ImportVideosPanel />}
      </Tab>
      <Tab eventKey="library" title="Add Library">
        {tab === "library" && <AddLibraryPanel />}
      </Tab>
      <Tab eventKey="flags" title="Feature Flags">
        {tab === "flags" && <FeatureFlagsPanel onAdminRequired={expired} />}
      </Tab>
      <Tab eventKey="password" title="Admin Password">
        {tab === "password" && (
          <AdminSignIn
            mode="change"
            onDone={() => {
              toast.success("Admin password changed. It now works in every room.");
              setTab("import");
            }}
          />
        )}
      </Tab>
    </Tabs>
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
