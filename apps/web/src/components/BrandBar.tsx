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
      <NavLink to="/" className="brandbar__brand bf-focusable" aria-label="ChassiX AI — home">
        <svg className="brandbar__monogram" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 4a16 16 0 0 0 0 32M20 10a10 10 0 0 0 0 20" />
          <g transform="translate(18 5) scale(.77 1)">
            <path d="M3 3C3 11 21 19 21 27M21 3C21 11 3 19 3 27" />
            <path className="brandbar__rungs" d="M4 6H20M7 10H17M7 20H17M4 24H20" />
          </g>
        </svg>
        <span className="brandbar__name">
          Chassi
          <svg className="brandbar__dna" viewBox="0 0 24 30" aria-hidden="true">
            <path d="M3 3C3 11 21 19 21 27M21 3C21 11 3 19 3 27" />
            <path className="brandbar__rungs" d="M4 6H20M7 10H17M7 20H17M4 24H20" />
          </svg>
          <span className="brandbar__ai">AI</span>
        </span>
      </NavLink>
      <nav className="brandbar__nav" aria-label="Primary">
        <NavLink to="/" end className="brandbar__link bf-focusable">
          Welcome
        </NavLink>
        <NavLink to="/goal" className="brandbar__link bf-focusable">
          Goal
        </NavLink>
        <NavLink to="/hosts" className="brandbar__link bf-focusable">
          Hosts
        </NavLink>
        <NavLink to="/canvas" className="brandbar__link bf-focusable">
          Canvas
        </NavLink>
        <NavLink to="/plan" className="brandbar__link bf-focusable">
          Plan
        </NavLink>
        <NavLink to="/run" className="brandbar__link bf-focusable">
          Runs
        </NavLink>
        <NavLink to="/gallery" className="brandbar__link bf-focusable">
          Components
        </NavLink>
      </nav>
    </header>
  );
}
