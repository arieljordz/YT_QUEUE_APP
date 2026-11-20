import { useState, useEffect, useCallback } from "react";
import { Dropdown, Modal, Button } from "react-bootstrap";
import { FaCog } from "react-icons/fa";

const NavBar = () => {
  // Read the saved theme up front so the first paint is already correct.
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("theme") === "dark"
  );
  const [showCoffeeModal, setShowCoffeeModal] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("bg-dark", darkMode);
    document.body.classList.toggle("text-light", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const toggleTheme = useCallback(() => setDarkMode((dark) => !dark), []);
  const handleCoffeeClick = useCallback(() => setShowCoffeeModal(true), []);
  const handleCloseModal = useCallback(() => setShowCoffeeModal(false), []);

  return (
    <>
      <nav
        className={`navbar navbar-expand-lg ${
          darkMode ? "navbar-light bg-light" : "navbar-dark bg-dark"
        } px-3 py-1`}
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
              <Dropdown.Item className="small" onClick={toggleTheme}>
                🌗 Theme
              </Dropdown.Item>
              <Dropdown.Divider className="m-0" />
              <Dropdown.Item className="small" onClick={handleCoffeeClick}>
                ☕ Coffee?
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </nav>

      <Modal
        show={showCoffeeModal}
        onHide={handleCloseModal}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>Coffee Time ☕</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center">
          <img
            src="/images/qrcode.jpg"
            alt="Coffee"
            className="img-fluid rounded mb-3"
          />

          <div className="d-flex flex-column align-items-center gap-1">
            <div className="fw-bold">AR**L S.</div>
            <div className="text-muted">Mobile No.: 091.....151</div>
            <div className="text-uppercase">............WINH2J</div>
          </div>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default NavBar;
