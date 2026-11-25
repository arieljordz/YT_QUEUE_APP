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
    requeued: (count) => toast.success(`Re-queued ${plural(count, "played video")}`),
    removed: (undo) => undoable("Removed from the queue", undo),
    cleared: (count, undo) => undoable(`Cleared ${plural(count, "video")}`, undo),
    shuffled: (count, undo) => undoable(`Shuffled ${plural(count, "video")}`, undo),
  },

  library: {
    deleted: () => toast.success("Library deleted"),
    deleteFailed: () => toast.error("Could not delete the synced library. Please try again."),
    videosDeleted: (count) => toast.success(`Deleted ${plural(count, "video")}`),
  },

  catalog: {
    loadFailed: (err) => toast.error(errorText(err), { toastId: "catalog-list-error" }),
    added: (count, name) =>
      count === 0
        ? toast.info(`All videos from "${name}" are already in your library`)
        : toast.success(`Added ${plural(count, "video")} from "${name}" to your library`),
    addFailed: (err) => toast.error(errorText(err)),
    deleted: (name) => toast.success(`Deleted the list "${name}"`),
    deleteFailed: (err) => toast.error(errorText(err)),
  },

  import: {
    saved: (count, name) => toast.success(`Saved ${plural(count, "video")} to "${name}"`),
    failed: (err, savedCount = 0) =>
      toast.error(
        savedCount > 0
          ? `${errorText(err)} (${plural(savedCount, "video")} ${savedCount === 1 ? "was" : "were"} saved)`
          : errorText(err)
      ),
  },

  admin: {
    sessionExpired: () => toast.info("Your admin sign-in expired. Enter the password again."),
    passwordChanged: () => toast.success("Admin password changed. It now works in every room."),
    flagFailed: (err) => toast.error(errorText(err)),
  },

  share: {
    linkCopied: () => toast.success("Link copied"),
    copyFailed: () => toast.error("Could not copy. Select the link and copy it."),
  },
};
