import { memo } from "react";
import { MdOpenInNew } from "react-icons/md";

/**
 * The tab bar of the home page.
 * tabs: [{ key, label, icon, count?, href?, title? }]. A tab with `href` is a
 * link that opens in a new browser tab (the player); the others switch `active`.
 * On a phone the tabs share one row, each with its icon above a short label.
 */
function AppTabs({ tabs, active, onSelect }) {
  return (
    <ul className="nav app-tabs flex-nowrap mb-3">
      {tabs.map(({ key, label, icon, count, href, title }) => {
        const content = (
          <>
            <span className="tab-icon">{icon}</span>
            <span className="tab-label">
              {label}
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
                title={title}
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
