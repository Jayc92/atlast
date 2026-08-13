/**
 * Browser entry point for the Atlast web application (M0 shell per ADR-0003;
 * M2-A routing foundation and M2-B topology shell per ADR-0026 § 2). Mounts
 * the client-rendered SPA behind the URL-addressable router; the foundation
 * page remains available at `/`, while the topology application is routed at
 * `/topology` and `/entities/:entityId`.
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
