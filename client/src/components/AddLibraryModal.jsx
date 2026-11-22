import { Modal, Button } from "react-bootstrap";
import { FaBookOpen } from "react-icons/fa";
import AddLibraryPanel from "./AddLibraryPanel";

export default function AddLibraryModal({ show, onHide }) {
  return (
    <Modal show={show} onHide={onHide} centered size="lg" scrollable fullscreen="sm-down">
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaBookOpen aria-hidden="true" /> Add Library
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <AddLibraryPanel />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
