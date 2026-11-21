import { Modal, Button } from "react-bootstrap";
import { FaDownload } from "react-icons/fa";
import ImportVideosPanel from "./ImportVideosPanel";

export default function ImportVideosModal({ show, onHide }) {
  return (
    <Modal show={show} onHide={onHide} centered size="lg" scrollable fullscreen="sm-down">
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaDownload aria-hidden="true" /> Import Videos
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <ImportVideosPanel />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
