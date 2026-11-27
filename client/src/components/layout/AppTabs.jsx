import { memo } from "react";
import { MdOpenInNew } from "react-icons/md";

/**
 * The tab bar of the home page.
 * tabs: [{ key, label, shortLabel?, icon, count?, href?, title? }]. A tab with
 * `href` is a link that opens in a new browser tab (the player); the others
 * switch `active`. On a phone the tabs share one row, each with its icon above
 * a label (`shortLabel` there, when given). Also used by Settings.
 */
function AppTabs({ tabs, active, onSelect, className = "", ariaLabel }) {
  return (
    <ul className={`nav app-tabs flex-nowrap mb-3 ${className}`} aria-label={ariaLabel}>
      {tabs.map(({ key, label, shortLabel, icon, count, href, title }) => {
        const content = (
          <>
            <span className="tab-icon">{icon}</span>
            <span className="tab-label">
              {shortLabel ? (
                <>
                  <span className="tab-label-full d-none d-sm-inline">{label}</span>
                  <span className="tab-label-short d-sm-none">{shortLabel}</span>
                </>
              ) : (
                label
              )}
              {href && <MdOpenInNew className="tab-external" size={13} aria-hidden="true" />}
            </span>
            {count !== undefined && (
              <span className="tab-count">{count}</span>
            )}
          </>
        );
        return (
          <li className="nav-item" key={key}>
            {href ? (
              <a className="nav-link" href={href} target="_blank" rel="noopener" title={title}>
                {content}
              </a>
            ) : (
              <button
                className={`nav-link ${active === key ? "active" : ""}`}
                onClick={() => onSelect(key)}
                aria-current={active === key ? "page" : undefined}
                title={title ?? (shortLabel ? label : undefined)}
              >
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default memo(AppTabs);
