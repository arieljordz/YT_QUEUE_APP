import { Modal, Button } from "react-bootstrap";
import { FaCoffee } from "react-icons/fa";

export default function SupportModal({ show, onHide }) {
  return (
    <Modal show={show} onHide={onHide} centered backdrop="static" keyboard={false}>
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="d-flex align-items-center gap-2">
          <FaCoffee aria-hidden="true" /> Support
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center">
        <p className="mb-3">Enjoying the app? Buy me a coffee ☕</p>
        <img src="/images/qrcode.jpg" alt="Coffee" className="img-fluid rounded mb-3" />

        <div className="d-flex flex-column align-items-center gap-1">
          <div className="fw-bold">AR**L S.</div>
          <div className="text-muted">Mobile No.: 091.....151</div>
          <div className="text-uppercase">............WINH2J</div>
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
