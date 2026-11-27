import { toast } from "react-toastify";
import { decodeEntities } from "./text";

/**
 * Every toast message in the app, grouped by where it comes from.
 * Components call these instead of `toast` directly, so wording, plurals and
 * types (success / info / warning / error) stay the same everywhere.
 * The look of each type lives in App.css ("Toasts").
 */

/** plural(1, "video") -> "1 video", plural(3, "video") -> "3 videos". */
export function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

// Messages from the server are shown as they are; this covers a missing one.
const errorText = (err, fallback = "Something went wrong. Please try again.") =>
  (err && err.message) || fallback;

/** A notice with an Undo button, for changes that are easy to regret. */
function undoable(message, undo) {
  toast(
    ({ closeToast }) => (
      <div className="toast-undo">
        <span>{message}</span>
        <button
          type="button"
          className="toast-undo-btn"
          onClick={() => {
            undo();
            closeToast();
          }}
        >
          Undo
        </button>
      </div>
    ),
    { autoClose: 6000 }
  );
}

export const notify = {
  search: {
    quotaReached: () => toast.warning("Search quota limit reached. Please try again later."),
    failed: () => toast.error("Search failed. Please try again."),
  },

  queue: {
    added: (title) => toast.success(`Added "${decodeEntities(title)}" to the queue`),
    addedMany: (count) => toast.success(`Added ${plural(count, "video")} to the queue`),
    removed: (undo) => undoable("Removed from the queue", undo),
    cleared: (count, undo) => undoable(`Cleared ${plural(count, "video")}`, undo),
    shuffled: (count, undo) => undoable(`Shuffled ${plural(count, "video")}`, undo),
  },

  library: {
    deleted: () => toast.success("Library deleted"),
    deleteFailed: () => toast.error("Could not delete the synced library. Please try again."),
    videosDeleted: (count) => toast.success(`Deleted ${plural(count, "video")}`),
    selectedDeleteFailed: () => toast.error("Could not delete the selected videos. Please try again."),
  },

  playlists: {
    created: (name) => toast.success(`Created the playlist "${name}"`),
    deleted: (name) => toast.success(`Deleted the playlist "${name}"`),
    videosAdded: (count, name) => toast.success(`Added ${plural(count, "video")} to "${name}"`),
    videoRemoved: (undo) => undoable("Removed from the playlist", undo),
    playing: (name, count, undo) => undoable(`Playing "${name}" (${plural(count, "video")})`, undo),
    nothingToPlay: () => toast.info("None of this playlist's videos are in your library anymore."),
    saveFailed: (err) => toast.error(errorText(err, "Could not save the playlist. Please try again.")),
  },

  catalog: {
    loadFailed: (err) => toast.error(errorText(err), { toastId: "catalog-list-error" }),
    added: (count, name) =>
      count === 0
        ? toast.info(`All videos from "${name}" are already in your library`)
        : toast.success(`Added ${plural(count, "video")} from "${name}" to your library`),
    addFailed: (err) => toast.error(errorText(err)),
    // remaining = videos other rooms imported into the list, which stay.
    deleted: (name, deleted, remaining) =>
      deleted === 0
        ? toast.info(`Nothing to delete: "${name}" was already removed`)
        : remaining > 0
          ? toast.success(
              `Deleted your ${plural(deleted, "video")} from "${name}". ` +
                `Other rooms' ${plural(remaining, "video")} stay in the list.`
            )
          : toast.success(`Deleted the list "${name}"`),
    deleteFailed: (err) => toast.error(errorText(err)),
    shared: (name, on) =>
      toast.success(
        on
          ? `Shared "${name}": other rooms can add it to their library`
          : `"${name}" is private to your room again`
      ),
    shareFailed: (err) => toast.error(errorText(err, "Could not change sharing. Please try again.")),
  },

  import: {
    // added = new to the list, existing = matched but already in it;
    // from = the YouTube channel read, when there was one.
    saved: (added, existing, name, from) => {
      const source = from ? ` from "${from}"` : "";
      if (added === 0 && existing === 0) {
        return toast.warning(
          `No videos were saved${source}. None matched: check the title words and the options.`
        );
      }
      if (added === 0) {
        return toast.info(
          `Nothing new${source}: all ${plural(existing, "matching video")} ${
            existing === 1 ? "was" : "were"
          } already in "${name}".`
        );
      }
      return toast.success(
        `Added ${plural(added, existing > 0 ? "new video" : "video")}${source} to "${name}"` +
          (existing > 0 ? ` (${existing.toLocaleString()} already in it)` : "")
      );
    },
    stoppedEarly: () =>
      toast.info("Stopped before the oldest uploads were reached: nothing was saved."),
    failed: (err, savedCount = 0) =>
      toast.error(
        savedCount > 0
          ? `${errorText(err)} (${plural(savedCount, "video")} ${savedCount === 1 ? "was" : "were"} saved)`
          : errorText(err)
      ),
  },

  admin: {
    sessionExpired: () => toast.info("Your admin sign-in expired. Enter the password again."),
    passwordRequired: () => toast.info("Settings need the admin password again. Enter it to continue."),
    passwordChanged: () => toast.success("Admin password changed. It now works in every room."),
    flagFailed: (err) => toast.error(errorText(err)),
  },

  backup: {
    saved: (count) => toast.success(`Backup downloaded (${plural(count, "document")})`),
    restored: (count) =>
      toast.success(`Database restored (${plural(count, "document")}). Reload the app on each device to see it.`, {
        autoClose: 10000,
      }),
    cleared: (count) =>
      toast.success(
        `Database cleared (${plural(count, "document")} deleted; the rooms stay). A backup was downloaded first. Reload the app on each device.`,
        { autoClose: 10000 }
      ),
    failed: (err) => toast.error(errorText(err)),
  },

  player: {
    // The in-app player was behind another tab when another device took over.
    moved: () =>
      toast.info("Playback moved to another device, so the player here stopped.", { toastId: "player-moved" }),
  },

  external: {
    tabMayBeOpen: () =>
      toast.info("The queue moved on. The YouTube tab may still be open; close it there.", {
        toastId: "external-tab-open",
      }),
  },

  share: {
    linkCopied: () => toast.success("Link copied"),
    copyFailed: () => toast.error("Could not copy. Select the link and copy it."),
  },
};
