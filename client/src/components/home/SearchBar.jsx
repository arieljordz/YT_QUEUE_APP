import { useState, memo } from "react";
import { FaSearch } from "react-icons/fa";

function SearchBar({ onSearch, isLoading }) {
  const [term, setTerm] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const query = term.trim();
    if (query) onSearch(query);
  };

  return (
    <form onSubmit={handleSubmit} className="search-bar" role="search">
      <div className="lib-search">
        <FaSearch aria-hidden="true" />
        <input
          type="search"
          className="form-control"
          placeholder="Search YouTube for a song, artist or karaoke"
          aria-label="Search YouTube"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          autoFocus
        />
      </div>
      <button
        className="btn yq-btn-primary d-flex align-items-center justify-content-center gap-2"
        type="submit"
        disabled={isLoading || !term.trim()}
      >
        {isLoading ? (
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
        ) : null}
        Search
      </button>
    </form>
  );
}

export default memo(SearchBar);
