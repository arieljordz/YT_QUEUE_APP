import { useCallback, useEffect, useState } from "react";

/**
 * Lets the app offer "Install app". Chrome, Edge and Android browsers announce
 * when the app can be installed; the event is kept until the user asks for it.
 * (iPhone Safari has no such event: there it is Share > Add to Home Screen.)
 * `canInstall` is false once the app is installed or running as an installed app.
 */
export default function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault(); // keep it for our own button instead of the browser's mini bar
      setPromptEvent(event);
    };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice; // accepted or dismissed: either way the event is spent
    setPromptEvent(null);
  }, [promptEvent]);

  return { canInstall: Boolean(promptEvent), install };
}
