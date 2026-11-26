import { AVATARS } from "../../lib/avatars";

export default function Avatar({ avatar, size = 72 }) {
  const { Icon, color } = AVATARS[avatar] ?? AVATARS["avatar-1"];
  return (
    <span className="room-avatar" style={{ background: color }}>
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}
