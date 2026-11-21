import { Modal, Button } from "react-bootstrap";
import { FaPalette } from "react-icons/fa";

export default function AppearanceModal({ show, onHide, darkMode, onToggleTheme }) {
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaPalette aria-hidden="true" /> Appearance
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
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
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
