import React from 'react';
import { FaPlus } from 'react-icons/fa';

function VideoList({ videos, onAdd }) {
  return (
    <ul className="list-group">
      {videos.map((video) => (
        <li key={video.id.videoId} className="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <img src={video.snippet.thumbnails.default.url} alt="" className="me-2" />
            {video.snippet.title}
          </div>
          <button className="btn btn-sm btn-success" onClick={() => onAdd(video)}>
            <FaPlus />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default VideoList;
