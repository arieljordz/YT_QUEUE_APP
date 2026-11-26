import { ToastContainer } from "react-toastify";

/** The one place toasts appear. Messages come from lib/notify.jsx; styles from App.css ("Toasts"). */
export default function AppToaster() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={3000}
      newestOnTop
      limit={4}
      closeOnClick={false}
      pauseOnFocusLoss
      className="app-toasts"
    />
  );
}
