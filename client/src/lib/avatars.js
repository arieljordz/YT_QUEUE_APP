import { FaCat, FaGhost, FaRobot, FaUserAstronaut, FaUserCircle, FaUserNinja, FaUserSecret, FaUserTie } from "react-icons/fa";

// Room avatars. Keys match AVATARS in api/_session.js.
export const AVATARS = {
  "avatar-1": { Icon: FaUserCircle, color: "#e50914" },
  "avatar-2": { Icon: FaUserAstronaut, color: "#2d8cff" },
  "avatar-3": { Icon: FaUserNinja, color: "#f5a623" },
  "avatar-4": { Icon: FaUserSecret, color: "#2ecc71" },
  "avatar-5": { Icon: FaUserTie, color: "#b45cff" },
  "avatar-6": { Icon: FaRobot, color: "#00b8a9" },
  "avatar-7": { Icon: FaCat, color: "#ff6f91" },
  "avatar-8": { Icon: FaGhost, color: "#6c7a89" },
};

export const MAX_ROOMS = 5;
