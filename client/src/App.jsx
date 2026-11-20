import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import Home from "./components/Home";
import PlayerPage from "./components/PlayerPage";
import NavBar from "./components/NavBar";
import useRemoteSync from "./hooks/useRemoteSync";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

function App() {
  // Keeps the queue identical on every device that uses the same sync code.
  const liveStatus = useRemoteSync();

  return (
    <BrowserRouter>
      <NavBar />
      <ToastContainer position="top-right" autoClose={2000} />
      <Routes>
        <Route path="/" element={<Home liveStatus={liveStatus} />} />
        <Route path="/player" element={<PlayerPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
