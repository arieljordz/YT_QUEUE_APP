import React, { useState, useEffect } from "react";
import { Dropdown, Modal, Button } from "react-bootstrap";
import { FaCog } from "react-icons/fa";

const NavBar = () => {
  const [darkMode, setDarkMode] = useState(true);
  const [showCoffeeModal, setShowCoffeeModal] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const isDark = savedTheme === "dark";
    setDarkMode(isDark);
    document.body.classList.toggle("bg-dark", isDark);
    document.body.classList.toggle("text-light", isDark);
  }, []);

  const toggleTheme = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    document.body.classList.toggle("bg-dark", newDarkMode);
    document.body.classList.toggle("text-light", newDarkMode);
    localStorage.setItem("theme", newDarkMode ? "dark" : "light");
  };

  const handleCoffeeClick = () => setShowCoffeeModal(true);
  const handleCloseModal = () => setShowCoffeeModal(false);

  return (
    <>
      <nav
        className={`navbar navbar-expand-lg ${
          darkMode ? "navbar-light bg-light" : "navbar-dark bg-dark"
        } px-3`}
      >
        <a className="navbar-brand">🎬 YouTube Queueing App</a>

        <div className="ms-auto">
          <Dropdown align="end">
            <Dropdown.Toggle
              as="span"
              id="dropdown-gear"
              className="d-flex align-items-center"
              style={{ cursor: "pointer" }}
            >
              <FaCog size={20} color={darkMode ? "#000" : "#fff"} />
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
            // src="https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif"
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
