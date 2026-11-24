import { useCallback, useEffect, useState } from "react";
import { getAdminStatus, logoutAdmin } from "../api/admin";

/**
 * Admin sign-in state from the server. `status` is null while loading:
 * { configured, signedIn, usesFlagsPassword }. Pass `active = false` to skip
 * loading until it is needed (e.g. a closed modal).
 */
export default function useAdmin(active = true) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAdminStatus());
      setError("");
    } catch {
      setError("Could not check the admin sign-in. Check your connection.");
    }
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  const signOut = useCallback(async () => {
    await logoutAdmin();
    await refresh();
  }, [refresh]);

  return { status, error, refresh, signOut, signedIn: Boolean(status?.signedIn) };
}
