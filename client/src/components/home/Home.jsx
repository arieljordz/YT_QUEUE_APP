import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { notify } from "../../lib/notify";
import SearchBar from "./SearchBar";
import { FaSearch, FaChevronRight } from "react-icons/fa";
import { MdQueueMusic } from "react-icons/md";
import AppTabs from "../layout/AppTabs";
import useOnlineStatus from "../../hooks/useOnlineStatus";
import { useEmbeddableCache } from "../../hooks/useEmbeddable";
import { TAB_ICONS } from "../../lib/tabIcons";
import VideoList from "../videos/VideoList";
import Queue from "../queue/Queue";
import Library from "../library/Library";
import Playlists from "../playlists/Playlists";
import useFeatureFlags from "../../hooks/useFeatureFlags";
import usePlaylists from "../../hooks/usePlaylists";
import useMediaQuery from "../../hooks/useMediaQuery";

// From this width the queue sits in a panel beside the other tabs instead of in a tab of its own.
const QUEUE_PANEL_QUERY = "(min-width: 992px)"; // laptops, landscape tablets and up (matches App.css)
import PlayerPage from "../player/PlayerPage";
import PlayerBoundary from "../player/PlayerBoundary";
import PlayerChoiceModal from "../player/PlayerChoiceModal";
import { isInstalledApp } from "../../lib/display";
import useLocalStorage from "../../hooks/useLocalStorage";
import { searchVideos, getVideoDetails, QuotaError } from "../../api/youtube";
import { saveSearchedVideo } from "../../api/catalog";

// Queue entries get their own id so the same video can appear more than once
// and still have a stable React / drag-and-drop key.
const newQueueId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const toQueueItem = (video) => ({ ...video, queueId: newQueueId() });

const queueKey = (video) => video.queueId ?? video.id.videoId;

/** Fisher-Yates shuffle of a copy of the list. */
function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** The songs of `current` that were in `snapshot`, in the snapshot's order, then any newer ones. */
function restoreOrder(snapshot, current) {
  const byKey = new Map(current.map((video) => [queueKey(video), video]));
  const snapshotKeys = new Set(snapshot.map(queueKey));
  return [
    ...snapshot.filter((video) => byKey.has(queueKey(video))).map((video) => byKey.get(queueKey(video))),
    ...current.filter((video) => !snapshotKeys.has(queueKey(video))),
  ];
}

function Home({ libraryApi, roomName, onSignedOut }) {
  const [videos, setVideos] = useState([]);
  const [queue, setQueue] = useLocalStorage("videoQueue", []);
  const [isPaused, setIsPaused] = useLocalStorage("isPaused", false);
  const [isRepeat, setIsRepeat] = useLocalStorage("isRepeat", false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [details, setDetails] = useState(() => new Map());
  const [selectedTab, setTab] = useState("library");
  const { flags } = useFeatureFlags();
  const { playlists } = usePlaylists();
  const wideScreen = useMediaQuery(QUEUE_PANEL_QUERY);
  // On a wide screen the queue lives in the queue panel, never in a tab. The
  // user can hide the panel (remembered on this device) and show it again.
  const [panelOpen, setPanelOpen] = useLocalStorage("queuePanelOpen", true);
  const queuePanel = wideScreen && panelOpen;
  const wideScreenRef = useRef(wideScreen);
  wideScreenRef.current = wideScreen;
  // The Playlists tab goes away when its flag is switched off (here or on another device),
  // and the Queue tab on a wide screen.
  const tab =
    (selectedTab === "playlists" && !flags.personalPlaylists) || (selectedTab === "queue" && wideScreen)
      ? "library"
      : selectedTab;
  // The player can run inside this page, in the Player tab. Once opened it
  // stays loaded, hidden, so the music keeps playing while the other tabs are
  // used. The installed app always plays here (a separate window can't be
  // reached with Back); in a browser the Player tab first asks whether to play
  // here or in a new browser tab.
  const [installed] = useState(isInstalledApp);
  const [playerHere, setPlayerHere] = useState(installed);
  const [playerOpened, setPlayerOpened] = useState(false);
  const [choosingPlayer, setChoosingPlayer] = useState(false);
  const openPlayerHere = useCallback(() => {
    setChoosingPlayer(false);
    setPlayerHere(true);
    setPlayerOpened(true);
    setTab("player");
  }, []);
  // The choice is a link that opens /player in a new tab; this only closes the question.
  const openPlayerTab = useCallback(() => setChoosingPlayer(false), []);
  const selectTab = useCallback(
    (key) => {
      if (key === "player") {
        // Already playing here (or the installed app): just show it. Otherwise ask.
        if (!playerHere) {
          setChoosingPlayer(true);
          return;
        }
        setPlayerOpened(true);
      }
      setTab(key);
    },
    [playerHere]
  );
  const online = useOnlineStatus();
  const { record: recordEmbeddable, youtubeOnlyIds } = useEmbeddableCache();
  const { library, addToLibrary, syncCode, clearLibrary, removeFromLibrary, removeManyFromLibrary } = libraryApi;
  const searchAbortRef = useRef(null);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const handleSearch = useCallback(async (query) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    try {
      const results = await searchVideos(query, controller.signal);
      setVideos(results);
      setHasSearched(true);
      setLastQuery(query);
      // Length, views and whether it can play in the player tab (best effort).
      const fresh = await getVideoDetails(
        results.map((v) => v.id.videoId),
        controller.signal
      );
      if (searchAbortRef.current === controller) {
        setDetails((prev) => new Map([...prev, ...fresh]));
        recordEmbeddable([...fresh].map(([id, detail]) => [id, detail.embeddable]));
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      if (err instanceof QuotaError) {
        notify.search.quotaReached();
      } else {
        notify.search.failed();
        console.error("Search Error:", err);
      }
    } finally {
      // An aborted search was replaced by a newer one that owns the spinner.
      if (searchAbortRef.current === controller) setIsSearching(false);
    }
  }, [recordEmbeddable]);

  const addToQueue = useCallback(
    (video) => {
      setQueue((prev) => [...prev, toQueueItem(video)]);
      addToLibrary([video]);
      notify.queue.added(video.snippet.title);
    },
    [setQueue, addToLibrary]
  );

  // From the Search tab: also remember the video in the "My Searches" saved list
  // (needs sync; a failure must not get in the way of queueing).
  const addFromSearch = useCallback(
    (video) => {
      addToQueue(video);
      if (syncCode) saveSearchedVideo(video).catch(() => {});
    },
    [addToQueue, syncCode]
  );

  const addAllToQueue = useCallback(
    (list) => {
      if (list.length === 0) return;
      setQueue((prev) => [...prev, ...list.map(toQueueItem)]);
      notify.queue.addedMany(list.length);
    },
    [setQueue]
  );

  // Move an item between two positions; position 0 is the playing video and is locked.
  const handleMove = useCallback(
    (from, to) => {
      setQueue((prev) => {
        if (from < 1 || to < 1 || from >= prev.length || to >= prev.length) {
          return prev;
        }
        const next = [...prev];
        next.splice(to, 0, next.splice(from, 1)[0]);
        return next;
      });
    },
    [setQueue]
  );

  const handleRemove = useCallback(
    (index) => {
      const removed = queue[index];
      if (!removed) return;
      setQueue((prev) => prev.filter((_, i) => i !== index));
      notify.queue.removed(() =>
        setQueue((prev) => {
          if (prev.some((video) => queueKey(video) === queueKey(removed))) return prev;
          // Back where it was (never in front of the song that is playing).
          const at = prev.length === 0 ? 0 : Math.min(Math.max(index, 1), prev.length);
          return [...prev.slice(0, at), removed, ...prev.slice(at)];
        })
      );
    },
    [queue, setQueue]
  );

  const handleClear = useCallback(() => {
    const cleared = queue;
    setQueue([]);
    setIsPaused(false);
    if (cleared.length > 0) {
      notify.queue.cleared(cleared.length, () =>
        setQueue((prev) => {
          const clearedKeys = new Set(cleared.map(queueKey));
          return [...cleared, ...prev.filter((video) => !clearedKeys.has(queueKey(video)))];
        })
      );
    }
  }, [queue, setQueue, setIsPaused]);

  // Mixes up what is coming next; the song that is playing stays first.
  const handleShuffle = useCallback(() => {
    if (queue.length < 3) return;
    const before = queue;
    setQueue((prev) => (prev.length < 3 ? prev : [prev[0], ...shuffled(prev.slice(1))]));
    notify.queue.shuffled(queue.length - 1, () =>
      setQueue((prev) => restoreOrder(before, prev))
    );
  }, [queue, setQueue]);

  const handleSkip = useCallback(() => {
    const finished = queue[0];
    if (!finished) return;
    setQueue((prev) => prev.slice(1));
  }, [queue, setQueue]);

  const handlePlay = useCallback(
    (index) => {
      if (index === 0) return;
      setQueue((prev) => {
        if (index >= prev.length) return prev;
        const next = [...prev];
        next.unshift(next.splice(index, 1)[0]);
        return next;
      });
      setIsPaused(false);
    },
    [setQueue, setIsPaused]
  );

  const handleClearLibrary = useCallback(async () => {
    const ok = await clearLibrary();
    if (ok) notify.library.deleted();
    else notify.library.deleteFailed();
    return ok;
  }, [clearLibrary]);

  const handleDeleteMatches = useCallback(
    (videos) => {
      removeManyFromLibrary(videos.map((v) => v.id.videoId));
      notify.library.videosDeleted(videos.length);
      return true;
    },
    [removeManyFromLibrary]
  );

  // Play playlist: the queue becomes the playlist's videos, in its order. The
  // queue gets copies (with their own queueIds), so changing the queue later
  // never changes the saved playlist.
  const playPlaylist = useCallback(
    (name, list) => {
      if (list.length === 0) {
        notify.playlists.nothingToPlay();
        return;
      }
      const before = queue;
      setQueue(list.map(toQueueItem));
      setIsPaused(false);
      // On a wide screen the queue is in the panel, not a tab: stay on this tab.
      if (!wideScreenRef.current) setTab("queue");
      notify.playlists.playing(name, list.length, () => setQueue(before));
    },
    [queue, setQueue, setIsPaused]
  );

  const toggleRepeat = useCallback(() => setIsRepeat((repeat) => !repeat), [setIsRepeat]);
  const queuedIds = useMemo(() => new Set(queue.map((v) => v.id.videoId)), [queue]);
  const togglePaused = useCallback(
    () => setIsPaused((paused) => !paused),
    [setIsPaused]
  );

  const queueView = (
    <Queue
      queue={queue}
      isPaused={isPaused}
      isRepeat={isRepeat}
      onToggleRepeat={toggleRepeat}
      onTogglePause={togglePaused}
      onSkip={handleSkip}
      onPlay={handlePlay}
      onMove={handleMove}
      onRemove={handleRemove}
      onClear={handleClear}
      youtubeOnlyIds={youtubeOnlyIds}
      onShuffle={handleShuffle}
    />
  );

  return (
    <div className={`container-xl${wideScreen ? " home-wide" : ""}${queuePanel ? " has-queue-panel" : ""}`}>
      <div className="home-main">
        {!online && (
          <div className="alert alert-warning py-2 small" role="status">
            You are offline. Your library and queue are still here; searching, importing
            and playing videos need a connection.
          </div>
        )}
        <div className="home-tabs-row">
          <AppTabs
            active={tab}
            onSelect={selectTab}
            tabs={[
              { key: "library", label: "Library", icon: TAB_ICONS.library, count: library.length },
              ...(flags.personalPlaylists
                ? [{ key: "playlists", label: "Playlists", icon: TAB_ICONS.playlists, count: playlists.length }]
                : []),
              ...(wideScreen ? [] : [{ key: "queue", label: "Queue", icon: TAB_ICONS.queue, count: queue.length }]),
              { key: "search", label: "Search", icon: TAB_ICONS.search },
              {
                key: "player",
                label: "Player",
                icon: TAB_ICONS.player,
                title: playerHere
                  ? "Watch here; it keeps playing while you use the other tabs"
                  : "Play in a new browser tab or here in this page",
              },
            ]}
          />
          {wideScreen && !panelOpen && (
            <button
              type="button"
              className="btn btn-sm yq-btn-toggle queue-panel-toggle"
              onClick={() => setPanelOpen(true)}
              aria-expanded="false"
              aria-controls="queue-panel"
              title="Show the queue beside the other tabs"
            >
              <MdQueueMusic aria-hidden="true" /> <span>Show queue</span>
            </button>
          )}
        </div>

        {playerHere && playerOpened && (
          <div className={`inapp-player${tab === "player" ? "" : " is-hidden"}`} aria-hidden={tab !== "player"}>
            <PlayerBoundary>
              <PlayerPage roomName={roomName} onSignedOut={onSignedOut} inBackground={tab !== "player"} />
            </PlayerBoundary>
          </div>
        )}

        {/* On wide screens this area scrolls inside its panel (see .home-content). */}
        <div className="home-content">
          {tab === "search" && (
            <>
              <SearchBar onSearch={handleSearch} isLoading={isSearching} />
              {hasSearched && !isSearching && videos.length > 0 && (
                <p className="lib-summary" aria-live="polite">
                  {videos.length} results for “{lastQuery}”
                </p>
              )}
              <VideoList
                videos={videos}
                queuedIds={queuedIds}
                details={details}
                onAdd={addFromSearch}
                isLoading={isSearching}
                hasSearched={hasSearched}
                emptyIcon={<FaSearch aria-hidden="true" />}
                emptyTitle="No results"
                emptyText={`Nothing found for “${lastQuery}”. Try other words or the artist's name.`}
              />
            </>
          )}

          {tab === "library" && (
            <Library
              library={library}
              onAdd={addToQueue}
              onAddAll={addAllToQueue}
              onClearLibrary={handleClearLibrary}
              onDeleteMatches={handleDeleteMatches}
              onRemove={removeFromLibrary}
              queuedIds={queuedIds}
              youtubeOnlyIds={youtubeOnlyIds}
              syncCode={syncCode}
              downloading={libraryApi.downloading}
            />
          )}

          {tab === "playlists" && (
            <Playlists
              library={library}
              queuedIds={queuedIds}
              youtubeOnlyIds={youtubeOnlyIds}
              onPlay={playPlaylist}
              onQueue={addAllToQueue}
            />
          )}

          {tab === "queue" && queueView}
        </div>
      </div>

      {!installed && (
        <PlayerChoiceModal
          show={choosingPlayer}
          onNewTab={openPlayerTab}
          onHere={openPlayerHere}
          onClose={() => setChoosingPlayer(false)}
        />
      )}

      {queuePanel && (
        <aside className="queue-panel" id="queue-panel" aria-label="Queue">
          <div className="queue-panel-bar">
            <h2 className="queue-panel-title">
              <MdQueueMusic aria-hidden="true" /> Queue <span className="lib-chip-count">{queue.length}</span>
            </h2>
            <button
              type="button"
              className="btn btn-sm yq-btn-toggle queue-panel-toggle"
              onClick={() => setPanelOpen(false)}
              aria-expanded="true"
              aria-controls="queue-panel"
              title="Hide the queue panel (Show queue brings it back)"
            >
              <span>Hide</span> <FaChevronRight aria-hidden="true" />
            </button>
          </div>
          {queueView}
        </aside>
      )}
    </div>
  );
}

export default Home;
