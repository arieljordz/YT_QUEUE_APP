import { useState, useEffect } from "react";

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

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded / private mode: keep working in memory.
    }
  }, [key, value]);

  return [value, setValue];
}
