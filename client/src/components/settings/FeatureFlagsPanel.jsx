import { useState } from "react";
import { notify } from "../../lib/notify";
import useFeatureFlags from "../../hooks/useFeatureFlags";

function Flag({ id, label, description, checked, disabled, onChange }) {
  return (
    <div className="form-check form-switch mb-3">
      <input
        id={id}
        type="checkbox"
        className="form-check-input"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label className="form-check-label fw-semibold" htmlFor={id}>
        {label}
      </label>
      <div className="form-text mt-0">{description}</div>
    </div>
  );
}

const SECTIONS = [
  {
    title: "Appearance",
    flags: [
      { name: "lightMode", label: "Light mode", description: "Users can pick the light theme in Appearance." },
      { name: "darkMode", label: "Dark mode", description: "Users can pick the dark theme in Appearance." },
    ],
  },
  {
    title: "Library",
    flags: [
      { name: "librarySearchAutofocus", label: "Focus the search box", description: "Put the cursor in the Library search box when the Library tab opens. Off: nothing is focused (no keyboard popping up on phones)." },
      { name: "removeButton", label: "Remove button", description: "Show the Remove button on each video in the Library." },
      { name: "deleteAllButton", label: "Delete all button", description: "Show the Delete all button above the Library list." },
      { name: "librarySelection", label: "Library video selection", description: "Show a checkbox on each video in the Library, plus Select all." },
      { name: "deleteSelectedButton", label: "Delete selected button", description: "Show the Delete selected button above the Library list (works with Library video selection)." },
      { name: "deleteListButton", label: "Delete list button", description: "Show the trash button on each saved list in Add Library." },
      { name: "shareSavedLists", label: "Share saved lists across rooms", description: "Every room sees, in Add Library, the lists imported by any room. Off: each room sees only the lists (and the part of a list) it imported itself. Turning it off or on hides or shows lists; nothing is deleted or moved. Each room's Library is always its own." },
    ],
  },
  {
    title: "Security",
    flags: [
      { name: "settingsPassword", label: "Ask for the admin password in Settings", description: "Off: anyone in any room can open Settings without the password, and import videos, delete saved lists, change these flags, and back up or restore (replace) the whole database. Managing rooms and changing the admin password still need it." },
    ],
  },
  {
    title: "Playlists",
    flags: [
      { name: "personalPlaylists", label: "Personal playlists", description: "Show the Playlists tab, where each room makes, edits and plays its own playlists from the Library." },
    ],
  },
];

/**
 * The feature flags, inside Settings (already behind the admin sign-in; the
 * server checks it again). They apply to every room and every device.
 * onAdminRequired() is called when the admin sign-in has expired.
 */
export default function FeatureFlagsPanel({ onAdminRequired }) {
  const { flags, setFlag } = useFeatureFlags();
  const [saving, setSaving] = useState(false);

  const change = async (name, enabled) => {
    setSaving(true);
    try {
      await setFlag(name, enabled);
    } catch (err) {
      notify.admin.flagFailed(err);
      if (err.adminRequired) onAdminRequired?.();
    } finally {
      setSaving(false);
    }
  };

  // At least one theme must stay available.
  const lastTheme = (name) =>
    (name === "lightMode" || name === "darkMode") && flags[name] && !(flags.lightMode && flags.darkMode);

  return (
    <>
      <p className="small text-body-secondary">
        Turned-off features are hidden for everyone, in every room.
      </p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-2">
          <h3 className="fs-6 text-uppercase text-body-secondary mb-3">{section.title}</h3>
          {section.flags.map((f) => (
            <Flag
              key={f.name}
              id={`flag-${f.name}`}
              label={f.label}
              description={lastTheme(f.name) ? `${f.description} (At least one theme must stay on.)` : f.description}
              checked={flags[f.name]}
              disabled={saving || lastTheme(f.name)}
              onChange={(on) => change(f.name, on)}
            />
          ))}
        </section>
      ))}
    </>
  );
}
