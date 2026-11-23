import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "react-toastify";
import SearchBar from "./SearchBar";
import VideoList from "./VideoList";
import { searchVideos, getVideoDetails, QuotaError } from "../api/youtube";
import { addGuestSong, getGuestLibrary, getGuestState } from "../api/guest";
import { byTitle } from "../lib/sort";

const POLL_MS = 4000;
const PAGE_SIZE = 100; // library rows shown first; more load as you scroll
const thumbOf = (video) => {
  const { thumbnails } = video.snippet;
  return (thumbnails.medium ?? thumbnails.default).url;
};

/** The host's library, read only: look for a song and add it to the queue. */
function GuestLibrary({ token, queuedIds, onAdd, onInvalid }) {
  const [library, setLibrary] = useState(null); // null = loading
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState("az"); // "az" | "newest"
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Fresh copy every time the tab is opened.
  useEffect(() => {
    let cancelled = false;
    getGuestLibrary(token)
      .then((list) => !cancelled && setLibrary(list))
      .catch((err) => {
        if (cancelled) return;
        setLibrary([]);
        if (err.status === 404) onInvalid();
        else toast.error(err.message, { toastId: "guest-library-error" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, onInvalid]);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matches = (library ?? []).filter(
      (v) =>
        !needle ||
        v.snippet.title.toLowerCase().includes(needle) ||
        v.snippet.channelTitle?.toLowerCase().includes(needle)
    );
    return sort === "newest" ? matches.reverse() : matches.sort(byTitle);
  }, [library, filter, sort]);

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 400) {
      setVisibleCount((count) => (count < shown.length ? count + PAGE_SIZE : count));
    }
  };

  if (library === null) return <p className="text-muted text-center my-4">Loading the library…</p>;

  return (
    <div>
      <div className="d-flex flex-wrap gap-2">
        <input
          type="search"
          className="form-control flex-grow-1 w-auto"
          style={{ flexBasis: "12rem" }}
          placeholder={`Filter ${library.length} songs...`}
          aria-label="Filter library"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
        />
        <select
          className="form-select w-auto"
          aria-label="Sort library"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <option value="az">A–Z</option>
          <option value="newest">Newest first</option>
        </select>
      </div>
      <div className="library-scroll mt-2" onScroll={handleScroll}>
        <VideoList
          videos={shown.slice(0, visibleCount)}
          queuedIds={queuedIds}
          onAdd={onAdd}
          isLoading={false}
          hasSearched
          emptyText={
            library.length === 0
              ? "The host's library is empty. Try the Search tab."
              : "No songs match that filter."
          }
        />
      </div>
      {shown.length > visibleCount && (
        <p className="text-muted small text-center mt-2">
          Showing {visibleCount} of {shown.length}. Scroll down to load more.
        </p>
      )}
    </div>
  );
}

/**
 * What a guest sees after opening an invite link: search for songs and add
 * them to the owner's queue, and watch the queue. Nothing else is possible.
 */
export default function GuestApp({ token, onLeave }) {
  const [tab, setTab] = useState("library");
  const [videos, setVideos] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [details, setDetails] = useState(() => new Map());
  const [state, setState] = useState({ queue: [], isPaused: false });
  const [invalid, setInvalid] = useState(false);
  const searchAbortRef = useRef(null);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  // Follow the queue.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const next = await getGuestState(token);
        if (cancelled) return;
        setState({ queue: next.queue, isPaused: next.isPaused });
        setInvalid(false);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) {
          setInvalid(true);
          return; // the invite is gone; nothing to poll
        }
      }
      timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  const handleSearch = useCallback(async (query) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setIsSearching(true);
    try {
      const results = await searchVideos(query, controller.signal);
      setVideos(results);
      setHasSearched(true);
      const fresh = await getVideoDetails(
        results.map((v) => v.id.videoId),
        controller.signal
      );
      if (searchAbortRef.current === controller) {
        setDetails((prev) => new Map([...prev, ...fresh]));
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      toast.error(
        err instanceof QuotaError
          ? "Search quota limit reached. Please try again later."
          : "Search failed. Please try again."
      );
    } finally {
      if (searchAbortRef.current === controller) setIsSearching(false);
    }
  }, []);

  const handleAdd = useCallback(
    async (video) => {
      try {
        const result = await addGuestSong(token, video);
        if (result.added) {
          toast.success(`Added "${video.snippet.title}" to the queue`);
          setState((prev) => ({ ...prev, queue: [...prev.queue, video] }));
        } else {
          toast.info("That song is already in the queue");
        }
      } catch (err) {
        if (err.status === 404) setInvalid(true);
        toast.error(err.message);
      }
    },
    [token]
  );

  const markInvalid = useCallback(() => setInvalid(true), []);

  const queuedIds = useMemo(
    () => new Set(state.queue.map((v) => v.id.videoId)),
    [state.queue]
  );
  const [nowPlaying, ...upNext] = state.queue;

  return (
    <>
      <nav data-bs-theme="dark" className="navbar bg-dark px-3 py-1">
        <span className="navbar-brand py-0 fs-6">🎬 YouTube Queueing App · Guest</span>
        <button className="btn btn-sm btn-outline-light ms-auto" onClick={onLeave}>
          Leave
        </button>
      </nav>

      <div className="container-xl py-3">
        {invalid && (
          <div className="alert alert-warning">
            This invite is not valid any more. Ask the host for a new link.
          </div>
        )}

        <ul className="nav nav-tabs mb-3">
          {[
            ["library", "📚 Library"],
            ["queue", `🎵 Queue (${state.queue.length})`],
            ["search", "🔍 Search"],
          ].map(([key, label]) => (
            <li className="nav-item" key={key}>
              <button
                className={`nav-link ${tab === key ? "active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        {tab === "library" && (
          <GuestLibrary
            token={token}
            queuedIds={queuedIds}
            onAdd={handleAdd}
            onInvalid={markInvalid}
          />
        )}

        {tab === "search" && (
          <>
            <SearchBar onSearch={handleSearch} isLoading={isSearching} />
            <VideoList
              videos={videos}
              queuedIds={queuedIds}
              details={details}
              onAdd={handleAdd}
              isLoading={isSearching}
              hasSearched={hasSearched}
            />
          </>
        )}

        {tab === "queue" &&
          (nowPlaying ? (
            <>
              <div className="card mb-3 border-primary">
                <div className="card-body d-flex flex-wrap align-items-center gap-3">
                  <img src={thumbOf(nowPlaying)} alt="" className="result-thumb rounded" />
                  <div className="now-playing-info min-w-0">
                    <small className="text-primary text-uppercase fw-bold">
                      {state.isPaused ? "Paused" : "Now playing"}
                    </small>
                    <div className="fw-semibold text-truncate-2">{nowPlaying.snippet.title}</div>
                  </div>
                </div>
              </div>
              {upNext.length > 0 && (
                <>
                  <div className="text-muted small text-uppercase mb-1">Up next</div>
                  <ul className="list-group">
                    {upNext.map((video, i) => (
                      <li
                        key={video.queueId ?? `${video.id.videoId}-${i}`}
                        className="list-group-item d-flex align-items-center gap-2"
                      >
                        <span className="text-muted small queue-position">{i + 1}</span>
                        <img src={thumbOf(video)} alt="" className="queue-thumb rounded" />
                        <span className="min-w-0 text-truncate-2">{video.snippet.title}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="text-muted text-center my-4">
              The queue is empty. Search for a song and add it!
            </p>
          ))}
      </div>
    </>
  );
}
