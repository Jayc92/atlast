/**
 * Browser entry point for the Atlast web application (M0 shell per ADR-0003;
 * M2-A routing foundation per ADR-0026 § 2). Mounts the client-rendered SPA
 * behind the URL-addressable router; the foundation page itself is
 * unchanged, and no M2-B topology feature content exists yet.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./router.tsx";
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
    <AppRouter />
  </StrictMode>,
);
