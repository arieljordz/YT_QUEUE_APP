import React, { useRef, useEffect, useState } from "react";
import YouTube from "react-youtube";

const VideoPlayer = ({ video, onEnd, isPaused, setIsPaused, playCount }) => {
  const playerRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [shouldEnterFullscreen, setShouldEnterFullscreen] = useState(false);

  const opts = {
    height: "360",
    width: "100%",
    playerVars: {
      autoplay: 1,
    },
  };

  // Track button clicks to ensure the video is playing and interactable
  const handleButtonClick = (action) => {
    console.log(`${action} button clicked`);

    if (action === "playPause") {
      // Toggle the pause/play state
      setIsPaused((prevIsPaused) => !prevIsPaused);
    } else if (action === "fullscreen") {
      handleFullscreenClick();
    }
  };

  const onReady = (event) => {
    playerRef.current = event.target;

    // Initial play/pause
    if (isPaused) {
      event.target.pauseVideo();
    } else {
      event.target.playVideo();
    }

    setIframeReady(true);

    // Trigger fullscreen if the state is set to enter fullscreen
    if (shouldEnterFullscreen) {
      const iframe = event.target.getIframe();
      requestFullscreen(iframe);
    }
  };

  const requestFullscreen = (element) => {
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  };

  // Fullscreen button click handler
  const handleFullscreenClick = () => {
    const iframe = playerRef.current?.getIframe?.();
    if (iframe) {
      try {
        // Attempt to request fullscreen for the YouTube iframe
        requestFullscreen(iframe);
        // Store fullscreen state in localStorage
        localStorage.setItem("isFullscreen", "true");
      } catch (err) {
        console.warn("Fullscreen request failed:", err);
      }
    }
  };

  // Handle fullscreen status change
  const handleFullscreenChange = () => {
    const iframe = playerRef.current?.getIframe?.();
    if (!iframe) return;

    const fullscreenElement =
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement;

    const isFull = fullscreenElement === iframe;
    console.log("Fullscreen status:", isFull);
    setShouldEnterFullscreen(isFull);

    // Save fullscreen state to localStorage
    localStorage.setItem("isFullscreen", isFull ? "true" : "false");
  };

  useEffect(() => {
    if (!iframeReady) return;

    // Check fullscreen state from localStorage
    const storedFullscreen = localStorage.getItem("isFullscreen");
    if (storedFullscreen === "true") {
      setShouldEnterFullscreen(true);
    }

    // Add event listeners for fullscreen change
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "mozfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "MSFullscreenChange",
        handleFullscreenChange
      );
    };
  }, [iframeReady]);

  useEffect(() => {
    if (!playerRef.current) return;

    const player = playerRef.current;
    if (isPaused) {
      player.pauseVideo?.();
    } else {
      player.playVideo?.();
    }
  }, [isPaused]);

  if (!video) return <div>No video selected</div>;

  return (
    <div>
      <YouTube
        key={`${video.id.videoId}-${playCount}`}
        videoId={video.id.videoId}
        opts={opts}
        onReady={onReady}
        onEnd={onEnd}
      />

      {/* Control buttons */}
      {/* <div className="video-controls">
        <button
          onClick={() => handleButtonClick("playPause")}
          className="btn btn-sm btn-success"
        >
          {isPaused ? "Play" : "Pause"}
        </button>
        <button
          onClick={() => handleButtonClick("fullscreen")}
          className="btn btn-sm btn-primary ms-2"
        >
          Fullscreen
        </button>
      </div> */}
    </div>
  );
};

export default VideoPlayer;
