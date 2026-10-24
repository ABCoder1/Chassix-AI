import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
// Pull in the design system's tokens explicitly (also re-exported by the package)
// so the page background and type are themed before any component mounts.
import "@chassix/ui/tokens.css";
import "./app.css";
import { App } from "./App";
import { WelcomePage } from "./pages/WelcomePage";
import { CanvasPage } from "./pages/CanvasPage";

/**
 * Routes:
 *   /         Welcome + goal composer (Screen 1, BF-01)
 *   /canvas   Canvas + linear navigation + selection state (Screen 2, Phase 1 exit)
 *   /gallery  The existing component gallery (Step 1.3) — kept reachable.
 */
const router = createBrowserRouter([
  { path: "/", element: <WelcomePage /> },
  { path: "/canvas", element: <CanvasPage /> },
  { path: "/gallery", element: <App /> },
]);

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");
createRoot(el).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
