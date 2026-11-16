import { useRef, memo } from "react";
import { FaFileUpload } from "react-icons/fa";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

// A video is usable if it has the fields the UI reads: an id, a title and a thumbnail.
function isValidVideo(video) {
  const thumbs = video?.snippet?.thumbnails;
  return (
    typeof video?.id?.videoId === "string" &&
    video.id.videoId !== "" &&
    typeof video.snippet?.title === "string" &&
    Boolean(thumbs?.medium?.url || thumbs?.default?.url)
  );
}

/**
 * Lets the user pick a .json file containing an array of YouTube search
 * results (the same shape as the search API's `items`) and hands the valid
 * entries to `onImport(videos, skippedCount)`. `onError(message)` reports
 * files that cannot be used at all.
 */
function ImportQueueButton({ onImport, onError }) {
  const inputRef = useRef(null);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires onChange.
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      onError("That file is too large (max 5 MB).");
      return;
    }

    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      onError("That file is not valid JSON.");
      return;
    }

    if (!Array.isArray(data)) {
      onError("The JSON must be a list of videos.");
      return;
    }

    const videos = data.filter(isValidVideo);
    if (videos.length === 0) {
      onError("No valid videos found in that file.");
      return;
    }
    onImport(videos, data.length - videos.length);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="d-none"
        onChange={handleFile}
      />
      <button
        className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
        onClick={() => inputRef.current?.click()}
        title="Add videos from a saved JSON file"
      >
        <FaFileUpload /> Import JSON
      </button>
    </>
  );
}

export default memo(ImportQueueButton);
