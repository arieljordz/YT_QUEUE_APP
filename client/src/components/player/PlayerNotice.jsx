import { FaTv } from "react-icons/fa";

/** A full-screen message on the player page, with one action. */
export default function PlayerNotice({ title, children, action, onAction }) {
  return (
    <div className="player-notice" role="status">
      <FaTv className="player-notice-icon" aria-hidden="true" />
      <h1 className="player-notice-title">{title}</h1>
      {children && <p className="player-notice-text">{children}</p>}
      {action && (
        <button className="btn player-notice-btn" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
