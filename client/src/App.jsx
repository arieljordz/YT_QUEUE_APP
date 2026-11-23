import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import Home from "./components/Home";
import PlayerPage from "./components/PlayerPage";
import NavBar from "./components/NavBar";
import useRemoteSync from "./hooks/useRemoteSync";
import useLibrary from "./hooks/useLibrary";
import { useFeatureFlagsSync } from "./hooks/useFeatureFlags";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

function App() {
  // Keeps the queue identical on every device that uses the same sync code.
  const liveStatus = useRemoteSync();
  // The saved library (and its sync with the server), shared by the page and the menu.
  const libraryApi = useLibrary();
  // Keeps the feature flags identical on every device that uses the same sync code.
  useFeatureFlagsSync();

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
