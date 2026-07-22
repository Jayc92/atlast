/**
 * Browser entry point for the Atlast web application (M0 shell per ADR-0003).
 * Mounts the client-rendered SPA; there is no routing, no state library, and
 * no data access beyond the health check — the exploration UI is M2 scope.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

const rootElement: HTMLElement | null = document.getElementById("root");

if (rootElement === null) {
  // Without the mount point nothing can render; fail loudly rather than
  // leaving a silent blank page (GUARDRAILS.md § 2: no swallowed failures).
  throw new Error(
    'Atlast web shell failed to start: mount element "#root" is missing from index.html.',
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
