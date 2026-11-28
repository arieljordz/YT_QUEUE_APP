import { useEffect, useRef } from "react";
import { FaVolumeMute, FaVolumeDown, FaVolumeUp } from "react-icons/fa";
import useLocalStorage from "../../hooks/useLocalStorage";
import { VOLUME_KEY, MUTED_KEY, DEFAULT_VOLUME, clampVolume } from "../../lib/volume";

/** The player's volume (wherever it runs: this tab, another tab or another device). */
function useVolume() {
  const [volume, setVolume] = useLocalStorage(VOLUME_KEY, DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useLocalStorage(MUTED_KEY, false);
  const level = clampVolume(volume);
  const silent = isMuted || level === 0;
  const Icon = silent ? FaVolumeMute : level < 50 ? FaVolumeDown : FaVolumeUp;
  return { level, isMuted, silent, Icon, setVolume, setIsMuted };
}

/**
 * The small speaker button beside the progress bar. It shows the current
 * volume (muted, low, high) and opens or closes the slider below.
 */
export function VolumeToggle({ open, onToggle, panelId, buttonRef }) {
  const { level, silent, Icon } = useVolume();
  const label = silent ? "Volume: muted" : `Volume: ${level}%`;
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`btn now-volume-btn now-volume-toggle${open ? " is-open" : ""}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`${label}. ${open ? "Hide" : "Show"} volume control`}
      title={label}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}

/** Mute button and volume slider, shown when the toggle is open. */
export function VolumePanel({ id, onClose }) {
  const { level, isMuted, silent, setVolume, setIsMuted } = useVolume();
  const sliderRef = useRef(null);

  // Opening it with a click or a key puts the focus on the slider, ready to use.
  useEffect(() => {
    sliderRef.current?.focus({ preventScroll: true });
  }, []);

  const change = (event) => {
    const next = clampVolume(event.target.value);
    setVolume(next);
    // Moving the slider up is a clear wish to hear it again.
    if (isMuted && next > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    // Unmuting at 0 would still be silent: bring it back to an audible level.
    if (silent && level === 0) setVolume(50);
    setIsMuted(!silent);
  };

  const MuteIcon = silent ? FaVolumeMute : FaVolumeUp;
  return (
    <div
      id={id}
      className="now-volume"
      role="group"
      aria-label="Volume"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <button
        type="button"
        className="btn now-volume-btn"
        onClick={toggleMute}
        aria-label={silent ? "Unmute" : "Mute"}
        aria-pressed={silent}
        title={silent ? "Unmute" : "Mute"}
      >
        <MuteIcon aria-hidden="true" />
      </button>
      <input
        ref={sliderRef}
        type="range"
        className="now-volume-slider"
        min={0}
        max={100}
        step={1}
        value={silent ? 0 : level}
        onChange={change}
        aria-label="Volume"
        aria-valuetext={silent ? "Muted" : `${level}%`}
        style={{ "--fill": `${silent ? 0 : level}%` }}
      />
      <span className="now-volume-value">{silent ? "Muted" : `${level}%`}</span>
    </div>
  );
}
