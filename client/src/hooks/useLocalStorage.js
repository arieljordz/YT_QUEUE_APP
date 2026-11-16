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

/** useState that is persisted to localStorage under `key`. */
export default function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => readStorage(key, initialValue));

  const initialRef = useRef(initialValue);

  // Pick up writes made by other tabs, so the search tab and the player tab
  // always see the same queue.
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.storageArea !== localStorage || event.key !== key) return;
      setValue(readStorage(key, initialRef.current));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [key]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded / private mode: keep working in memory.
    }
  }, [key, value]);

  return [value, setValue];
}
