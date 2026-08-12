/**
 * The M2-A routing foundation (ADR-0026 § 2; docs/m2-plan.md § 5). This adds
 * the router mechanics and the three canonical M2 routes — `/`,
 * `/topology`, and `/entities/:entityId` — so URL-addressable navigation and
 * browser back/forward are real and testable now.
 *
 * `/topology` and `/entities/:entityId` deliberately render only a static,
 * clearly labeled placeholder: no inventory, search, entity data, or graph
 * viewport exists here. Building that content is M2-B/M2-C/M2-D scope,
 * released separately; this file adds only the addressable route shape they
 * will later fill in, never their content.
 */
import type { ReactElement } from "react";
import {
  createBrowserRouter,
  Link,
  Navigate,
  RouterProvider,
  useParams,
  type RouteObject,
} from "react-router";
import { App } from "./App.tsx";

interface ReservedRouteNoticeProps {
  readonly heading: string;
  readonly detail?: string;
}

/**
 * A static, inert placeholder — no data fetching, no query-client call, no
 * inventory/search/entity rendering. It exists only to prove the route is
 * addressable and reachable via back/forward, not to deliver M2-B content.
 */
function ReservedRouteNotice({
  heading,
  detail,
}: ReservedRouteNoticeProps): ReactElement {
  return (
    <main aria-labelledby="reserved-route-heading">
      <h1 id="reserved-route-heading">{heading}</h1>
      <p>
        This route is reserved by the M2-A routing foundation. Its content is
        M2-B and later scope and is not implemented yet.
        {detail !== undefined ? ` ${detail}` : ""}
      </p>
      <Link to="/">Return to the foundation page</Link>
    </main>
  );
}

function ReservedEntityRoute(): ReactElement {
  const { entityId } = useParams<{ entityId: string }>();
  return (
    <ReservedRouteNotice
      heading="Entity detail (reserved for M2-B)"
      {...(entityId !== undefined
        ? { detail: `Requested identifier: ${entityId}.` }
        : {})}
    />
  );
}

/**
 * Exported separately from `createBrowserRouter` so tests can feed the same
 * route shape into `createMemoryRouter` — `createBrowserRouter` itself
 * requires a real browser `history`, which is not what a unit test drives.
 */
export const topologyRouteDefinitions: readonly RouteObject[] = [
  { path: "/", element: <App /> },
  {
    path: "/topology",
    element: (
      <ReservedRouteNotice heading="Topology exploration (reserved for M2-B)" />
    ),
  },
  { path: "/entities/:entityId", element: <ReservedEntityRoute /> },
  { path: "*", element: <Navigate to="/" replace /> },
];

const browserRouter = createBrowserRouter([...topologyRouteDefinitions]);

export function AppRouter(): ReactElement {
  return <RouterProvider router={browserRouter} />;
}
