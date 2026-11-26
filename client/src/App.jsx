import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppToaster from "./components/layout/AppToaster";
import Home from "./components/home/Home";
import PlayerGate from "./components/player/PlayerGate";
import NavBar from "./components/layout/NavBar";
import useRemoteSync from "./hooks/useRemoteSync";
import useLibrary from "./hooks/useLibrary";
import { useFeatureFlagsSync } from "./hooks/useFeatureFlags";
import { useExtrasSync } from "./hooks/useExtras";
import { useEmbeddableLookup } from "./hooks/useEmbeddable";
import RoomSelect from "./components/rooms/RoomSelect";
import PinEntry from "./components/rooms/PinEntry";
import { currentRoom, leaveRoomSession } from "./api/rooms";
import { clearRoomData } from "./lib/roomData";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const ROOM_ID = /^[0-9a-f]{24}$/;

// Before rooms existed the secret sync code was kept in localStorage. Remove it
// (and the data cached for it) so the secret does not linger in the browser.
(function dropLegacySyncCode() {
  try {
    const stored = JSON.parse(localStorage.getItem("syncCode") ?? '""');
    const last = JSON.parse(localStorage.getItem("lastSyncCode") ?? '""');
    if ((stored && !ROOM_ID.test(stored)) || (last && !ROOM_ID.test(last))) {
      localStorage.removeItem("syncCode");
      localStorage.removeItem("lastSyncCode");
      clearRoomData();
    }
  } catch {
    // unreadable values are ignored
  }
})();

// Guest invite links (/?join=...) were retired: drop a saved guest token and
// the parameter, so old links just open the room screen.
(function dropGuestInvite() {
  try {
    localStorage.removeItem("guestCode");
  } catch {
    // storage unavailable
  }
  const params = new URLSearchParams(window.location.search);
  if (!params.has("join")) return;
  params.delete("join");
  const rest = params.toString();
  window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
})();

function App() {
  // Keeps the queue identical on every device that uses the same sync code.
  useRemoteSync();
  // The saved library (and its sync with the server), shared by the page and the menu.
  const libraryApi = useLibrary();
  // Keeps the feature flags identical on every device that uses the same sync code.
  useFeatureFlagsSync();
  // Keeps favorites and recently played identical on every device on the same sync code.
  useExtrasSync();
  // Finds out which saved and queued videos can only be watched on YouTube.
  useEmbeddableLookup();

  const [pickedRoom, setPickedRoom] = useState(null);
  const [notice, setNotice] = useState("");
  const [roomName, setRoomName] = useState("");
  const { syncCode: roomId, setSyncCode: setRoomId } = libraryApi;

  // The session cookie is the real proof of access. If it is gone or expired
  // (checked at startup and whenever the tab becomes visible), go back to room selection.
  const checkSession = useCallback(async () => {
    if (!roomId) return;
    try {
      const result = await currentRoom();
      if (result.status === 401) {
        setRoomId("");
        setNotice("You were signed out of the room (its PIN changed, or it was deleted). Choose a room to continue.");
      } else if (result.ok) {
        setRoomName(result.data.room.name);
      }
    } catch {
      // offline: stay in the room with the cached data
    }
  }, [roomId, setRoomId]);
  useEffect(() => {
    checkSession();
    const onVisible = () => document.visibilityState === "visible" && checkSession();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkSession]);

  const leaveRoom = useCallback(async () => {
    await leaveRoomSession();
    setRoomName("");
    setPickedRoom(null);
    setRoomId("");
  }, [setRoomId]);

  const enteredRoom = useCallback(
    (room) => {
      setNotice("");
      setRoomName(room.name);
      setRoomId(room.id);
      setPickedRoom(null);
    },
    [setRoomId]
  );

  // A player tab never shows room selection: it says it stopped instead.
  if (!roomId && window.location.pathname === "/player") {
    return <PlayerGate roomId="" roomName="" />;
  }

  if (!roomId) {
    return (
      <>
        {pickedRoom ? (
          <PinEntry
            room={pickedRoom}
            onBack={() => setPickedRoom(null)}
            onEntered={enteredRoom}
            onMissing={() => {
              setPickedRoom(null);
              setNotice("That room no longer exists. Choose another room.");
            }}
          />
        ) : (
          <RoomSelect
            notice={notice}
            onSelect={(room) => {
              setNotice("");
              setPickedRoom(room);
            }}
          />
        )}
        <AppToaster />
      </>
    );
  }

  return (
    <BrowserRouter>
      <NavBar
        sync={{
          roomName,
          leaveRoom,
          syncCode: roomId,
        }}
      />
      <AppToaster />
      <Routes>
        <Route
          path="/"
          element={<Home libraryApi={libraryApi} roomName={roomName} onSignedOut={checkSession} />}
        />
        <Route
          path="/player"
          element={<PlayerGate roomId={roomId} roomName={roomName} onSignedOut={checkSession} />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
