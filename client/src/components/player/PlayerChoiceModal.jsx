import { Modal } from "react-bootstrap";
import { MdOpenInNew, MdOndemandVideo } from "react-icons/md";

/**
 * In a browser, the Player tab first asks where to play: in a new browser tab
 * (the queue keeps playing there while this page is used for searching), or
 * here, inside the Player tab of this page.
 */
export default function PlayerChoiceModal({ show, onNewTab, onHere, onClose }) {
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">Where do you want to play?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="player-choice">
          {/* A real link, as the Player tab used to be, so the browser opens it as a new tab. */}
          <a
            href="/player"
            target="_blank"
            rel="noopener"
            className="player-choice-option"
            onClick={onNewTab}
          >
            <MdOpenInNew className="player-choice-icon" aria-hidden="true" />
            <span>
              <span className="player-choice-title">In a new browser tab</span>
              <span className="player-choice-text">
                The player gets its own tab, for example on a TV or second screen. This page stays free
                for searching and the queue.
              </span>
            </span>
          </a>
          <button type="button" className="player-choice-option" onClick={onHere}>
            <MdOndemandVideo className="player-choice-icon" aria-hidden="true" />
            <span>
              <span className="player-choice-title">Here, in the Player tab</span>
              <span className="player-choice-text">
                Plays inside this page. It keeps playing while you use the other tabs.
              </span>
            </span>
          </button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
