import { NavLink } from "react-router-dom";
import "./brandbar.css";

/**
 * Brand + primary navigation. The brand mark returns to the welcome screen
 * (per the Design Guide walkthrough). Nav links are keyboard-operable by
 * default and expose the current route via aria-current.
 */
export function BrandBar() {
  return (
    <header className="brandbar">
      <a href="#main" className="brandbar__skip bf-focusable">
        Skip to content
      </a>
      <NavLink to="/" className="brandbar__brand bf-focusable" aria-label="Chassix AI — home">
        <span className="brandbar__mark" aria-hidden="true" />
        <span className="brandbar__name">Chassix AI</span>
      </NavLink>
      <nav className="brandbar__nav" aria-label="Primary">
        <NavLink to="/" end className="brandbar__link bf-focusable">
          Welcome
        </NavLink>
        <NavLink to="/canvas" className="brandbar__link bf-focusable">
          Canvas
        </NavLink>
        <NavLink to="/gallery" className="brandbar__link bf-focusable">
          Components
        </NavLink>
      </nav>
    </header>
  );
}
