import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import Home from "./components/Home";
import PlayerPage from "./components/PlayerPage";
import NavBar from "./components/NavBar";
import useRemoteSync from "./hooks/useRemoteSync";
import useLibrary from "./hooks/useLibrary";
import { useFeatureFlagsSync } from "./hooks/useFeatureFlags";
import { useExtrasSync } from "./hooks/useExtras";
import { useEmbeddableLookup } from "./hooks/useEmbeddable";
import useLocalStorage from "./hooks/useLocalStorage";
import GuestApp from "./components/GuestApp";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const INVITE_TOKEN = /^[\w-]{12,64}$/;

/**
 * Opening an invite link (/?join=TOKEN) makes this browser a guest of that
 * room. The token is saved and removed from the address bar. A browser that
 * already has a sync code of its own (the host) ignores it.
 */
function captureInvite() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("join");
  if (token === null) return;
  params.delete("join");
  const rest = params.toString();
  window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));

  let hasOwnRoom = false;
  try {
    hasOwnRoom = Boolean(JSON.parse(localStorage.getItem("syncCode") ?? '""'));
  } catch {
    // unreadable value: treat as no room
  }
  if (INVITE_TOKEN.test(token) && !hasOwnRoom) {
    localStorage.setItem("guestCode", JSON.stringify(token));
  }
}

function App() {
  // Runs once, before the saved guest code is read below.
  useState(captureInvite);
  const [guestCode, setGuestCode] = useLocalStorage("guestCode", "");
  // Keeps the queue identical on every device that uses the same sync code.
  const liveStatus = useRemoteSync();
  // The saved library (and its sync with the server), shared by the page and the menu.
  const libraryApi = useLibrary();
  // Keeps the feature flags identical on every device that uses the same sync code.
  useFeatureFlagsSync();
  // Keeps favorites and recently played identical on every device on the same sync code.
  useExtrasSync();
  // Finds out which saved and queued videos can only be watched on YouTube.
  useEmbeddableLookup();

  // A guest only gets the search-and-queue view.
  if (guestCode && !libraryApi.syncCode) {
    return (
      <>
        <GuestApp token={guestCode} onLeave={() => setGuestCode("")} />
        <ToastContainer position="top-right" autoClose={2000} />
      </>
    );
  }

  return (
    <BrowserRouter>
      <NavBar
        sync={{
          syncCode: libraryApi.syncCode,
          lastSyncCode: libraryApi.lastSyncCode,
          setSyncCode: libraryApi.setSyncCode,
          status: libraryApi.status,
          retrySync: libraryApi.retrySync,
          liveStatus,
        }}
      />
      <ToastContainer position="top-right" autoClose={2000} />
      <Routes>
        <Route path="/" element={<Home libraryApi={libraryApi} />} />
        <Route path="/player" element={<PlayerPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
