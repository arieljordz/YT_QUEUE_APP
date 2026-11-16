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
    <form onSubmit={handleSubmit} className="input-group">
      <input
        type="search"
        className="form-control"
        placeholder="Search YouTube..."
        aria-label="Search YouTube"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        autoFocus
      />
      <button
        className="btn btn-primary d-flex align-items-center gap-2"
        type="submit"
        disabled={isLoading || !term.trim()}
      >
        {isLoading ? (
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
        ) : (
          <FaSearch aria-hidden="true" />
        )}
        Search
      </button>
    </form>
  );
}

export default memo(SearchBar);
