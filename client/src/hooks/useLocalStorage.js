import { useState, useEffect, useRef } from "react";

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : JSON.parse(saved);
  } catch {
    // Corrupt JSON or storage unavailable: fall back instead of crashing the app.
    return fallback;
  }
}

// The browser's "storage" event only fires in OTHER tabs, so writes made by one
// hook instance would never reach another instance in the same tab. This event
// covers that case.
export const LOCAL_CHANGE_EVENT = "local-storage-change";

/** useState that is persisted to localStorage under `key`, shared across hooks and tabs. */
export default function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => readStorage(key, initialValue));

  const initialRef = useRef(initialValue);
  // What this hook last wrote. Its own write announcing itself must not reload
  // the state: a newer update may already be queued, and reloading the older
  // stored value would undo it.
  const writtenRef = useRef(null);

  // Pick up writes made by other tabs and by other hooks in this tab, so every
  // view of the queue stays in step.
  useEffect(() => {
    const reload = () => {
      const raw = localStorage.getItem(key);
      if (raw === writtenRef.current) return;
      setValue((prev) =>
        JSON.stringify(prev) === raw ? prev : readStorage(key, initialRef.current)
      );
    };
    const handleStorage = (event) => {
      if (event.storageArea === localStorage && event.key === key) reload();
    };
    const handleLocalChange = (event) => {
      if (event.detail === key) reload();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(LOCAL_CHANGE_EVENT, handleLocalChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LOCAL_CHANGE_EVENT, handleLocalChange);
    };
  }, [key]);

  useEffect(() => {
    try {
      const raw = JSON.stringify(value);
      writtenRef.current = raw;
      // Nothing to write (for example on mount, when the state was just read from
      // storage). Announcing it anyway made other hooks reload and drop a change
      // they had not applied yet.
      if (localStorage.getItem(key) === raw) return;
      localStorage.setItem(key, raw);
      window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, { detail: key }));
    } catch {
      // Quota exceeded / private mode: keep working in memory.
    }
  }, [key, value]);

  return [value, setValue];
}
