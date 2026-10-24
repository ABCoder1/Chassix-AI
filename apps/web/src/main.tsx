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
import { GoalReviewPage } from "./pages/GoalReviewPage";
import { HostDiscoveryPage } from "./pages/HostDiscoveryPage";
import { PlanReviewPage } from "./pages/PlanReviewPage";
import { RunMonitorPage } from "./pages/RunMonitorPage";

/**
 * Routes:
 *   /            Welcome + goal composer (Screen 1, BF-01)
 *   /goal        Goal interpretation review (Step 1.6, BF-01/PRD §A)
 *   /hosts       Host discovery screen (Step 2.3, Screen 2/BF-02)
 *   /canvas      Canvas + linear navigation + selection state (Screen 2, Phase 1 exit)
 *   /plan        Plan review + frozen manifest (Step 3.2, Screen 4/BF-05)
 *   /runs/:runId Run monitoring (Step 3.5, Screen 5/BF-06/BF-13)
 *   /run         Run monitoring with the illustrative default run id.
 *   /gallery     The existing component gallery (Step 1.3) — kept reachable.
 */
const router = createBrowserRouter([
  { path: "/", element: <WelcomePage /> },
  { path: "/goal", element: <GoalReviewPage /> },
  { path: "/hosts", element: <HostDiscoveryPage /> },
  { path: "/canvas", element: <CanvasPage /> },
  { path: "/plan", element: <PlanReviewPage /> },
  { path: "/runs/:runId", element: <RunMonitorPage /> },
  { path: "/run", element: <RunMonitorPage /> },
  { path: "/gallery", element: <App /> },
]);

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");
createRoot(el).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
