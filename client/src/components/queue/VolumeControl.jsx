import { FaVolumeMute, FaVolumeDown, FaVolumeUp } from "react-icons/fa";
import useLocalStorage from "../../hooks/useLocalStorage";
import { VOLUME_KEY, MUTED_KEY, DEFAULT_VOLUME, clampVolume } from "../../lib/volume";

/**
 * Mute button and volume slider for the player, wherever it runs (this tab,
 * another tab, or another device of the room).
 */
export default function VolumeControl() {
  const [volume, setVolume] = useLocalStorage(VOLUME_KEY, DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useLocalStorage(MUTED_KEY, false);
  const level = clampVolume(volume);
  const silent = isMuted || level === 0;
  const Icon = silent ? FaVolumeMute : level < 50 ? FaVolumeDown : FaVolumeUp;

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

  return (
    <div className="now-volume">
      <button
        type="button"
        className="btn now-volume-btn"
        onClick={toggleMute}
        aria-label={silent ? "Unmute" : "Mute"}
        aria-pressed={silent}
        title={silent ? "Unmute" : "Mute"}
      >
        <Icon aria-hidden="true" />
      </button>
      <input
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
