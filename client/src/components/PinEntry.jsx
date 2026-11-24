import { useRef, useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import AppLogo from "./AppLogo";
import { enterRoom } from "../api/rooms";
import Avatar from "./RoomAvatar";

const EMPTY = ["", "", "", ""];

export default function PinEntry({ room, onBack, onEntered, onMissing }) {
  const [digits, setDigits] = useState(EMPTY);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  // Bumped on each wrong PIN to replay the shake animation.
  const [shake, setShake] = useState(0);
  const refs = useRef([]);

  const setAt = (index, value) =>
    setDigits((prev) => prev.map((d, i) => (i === index ? value : d)));

  function onChange(index, raw) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) return setAt(index, "");
    if (clean.length > 1) return fill(clean, index);
    setAt(index, clean);
    if (index < 3) refs.current[index + 1]?.focus();
  }

  function fill(text, start = 0) {
    const chars = text.replace(/\D/g, "").slice(0, 4 - start).split("");
    if (!chars.length) return;
    setDigits((prev) => prev.map((d, i) => (i >= start && chars[i - start] ? chars[i - start] : d)));
    refs.current[Math.min(start + chars.length, 3)]?.focus();
  }

  function onKeyDown(index, event) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      setAt(index - 1, "");
      refs.current[index - 1]?.focus();
    }
    if (event.key === "Enter") submit();
  }

  async function submit(event) {
    event?.preventDefault();
    const pin = digits.join("");
    if (pin.length !== 4 || busy) return setError("Enter all 4 digits.");
    setBusy(true);
    setError("");
    try {
      const result = await enterRoom(room.id, pin);
      if (result.ok) return onEntered(result.data.room);
      if (result.data.missing) return onMissing();
      setError(result.data.error ?? "Could not enter the room.");
      setLocked(Boolean(result.data.locked));
      setShake((n) => n + 1);
      setDigits(EMPTY);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
      setTimeout(() => refs.current[0]?.focus(), 0);
    }
  }

  return (
    <main className="room-screen">
      <header className="room-brand">
        <AppLogo size={48} />
        <span>QueueUp</span>
      </header>
      <form className="pin-panel" onSubmit={submit}>
        <Avatar avatar={room.avatar} size={56} />
        <h1 className="room-heading mb-1">{room.name}</h1>
        <p className="room-muted">Enter the 4-digit PIN</p>
        <div className={`pin-row${shake ? " pin-shake" : ""}`} key={shake}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="pin-box"
              type={visible ? "text" : "password"}
              inputMode="numeric"
              autoComplete="off"
              autoFocus={i === 0}
              maxLength={4}
              value={digit}
              aria-label={`PIN digit ${i + 1}`}
              disabled={busy}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={(e) => {
                e.preventDefault();
                fill(e.clipboardData.getData("text"));
              }}
              onFocus={(e) => e.target.select()}
            />
          ))}
          <button
            type="button"
            className="pin-toggle"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide PIN" : "Show PIN"}
          >
            {visible ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>
        {error && (
          <p className="room-notice" role="alert">
            {error}
          </p>
        )}
        <div className="pin-actions">
          <button type="submit" className="btn btn-danger" disabled={busy || locked}>
            {busy ? "Checking…" : "Enter Room"}
          </button>
          <button type="button" className="btn btn-outline-light" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </main>
  );
}
