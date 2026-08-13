/**
 * The M2 routing foundation (ADR-0026 § 2; docs/m2-plan.md § 5) and the
 * M2-B topology application it now routes to — `/`, `/topology`, and
 * `/entities/:entityId`, all URL-addressable with real browser back/forward
 * behavior.
 *
 * `/topology` and `/entities/:entityId` render the M2-B application shell
 * (`TopologyPage`/`EntityDetailPage`): Entity inventory, canonical-identifier
 * search, entity-focused detail, and the bounded M2-C graph workspace. The
 * detailed trust inspector and history playback remain M2-D/M2-E scope.
 */
import type { ReactElement } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from "react-router";
import { App } from "./App.tsx";
import { EntityDetailPage } from "./topology/EntityDetailPage.tsx";
import { TopologyPage } from "./topology/TopologyPage.tsx";

/**
 * Exported separately from `createBrowserRouter` so tests can feed the same
 * route shape into `createMemoryRouter` — `createBrowserRouter` itself
 * requires a real browser `history`, which is not what a unit test drives.
 */
export const topologyRouteDefinitions: readonly RouteObject[] = [
  { path: "/", element: <App /> },
  { path: "/topology", element: <TopologyPage /> },
  { path: "/entities/:entityId", element: <EntityDetailPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
];

const browserRouter = createBrowserRouter([...topologyRouteDefinitions]);

export function AppRouter(): ReactElement {
  return <RouterProvider router={browserRouter} />;
}
