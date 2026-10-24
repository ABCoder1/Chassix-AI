import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Pull in the design system's tokens explicitly (also re-exported by the package)
// so the page background and type are themed before any component mounts.
import "@chassix/ui/tokens.css";
import "./app.css";
import { App } from "./App";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
