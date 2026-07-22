/**
 * Network startup for the Atlast backend API (M0 shell per ADR-0004).
 *
 * The M0 shell binds to the loopback interface only — there is deliberately
 * no configuration path to bind to any other interface, keeping the
 * unauthenticated shell structurally unreachable from the network
 * (GUARDRAILS.md § 1.4, ADR-0004). Widening the bind address requires the
 * separately approved authentication ADR first.
 */
import type { FastifyInstance } from "fastify";
import { buildApplication } from "./app.ts";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_PORT = 3001;

function resolvePort(rawPortValue: string | undefined): number {
  if (rawPortValue === undefined || rawPortValue === "") {
    return DEFAULT_PORT;
  }
  const parsedPort = Number(rawPortValue);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(
      `Invalid ATLAST_API_PORT value "${rawPortValue}": expected an integer between 1 and 65535.`,
    );
  }
  return parsedPort;
}

async function startServer(): Promise<void> {
  const application: FastifyInstance = buildApplication();
  const port = resolvePort(process.env["ATLAST_API_PORT"]);

  // Close cleanly on normal termination so no socket or process is left
  // behind; a second signal during shutdown falls through to default
  // termination rather than hanging.
  for (const terminationSignal of ["SIGINT", "SIGTERM"] as const) {
    process.once(terminationSignal, () => {
      application.close().then(
        () => process.exit(0),
        (closeError: unknown) => {
          console.error(
            `Error while closing on ${terminationSignal}:`,
            closeError,
          );
          process.exit(1);
        },
      );
    });
  }

  await application.listen({ host: LOOPBACK_HOST, port });
  console.log(
    `atlast-api listening on http://${LOOPBACK_HOST}:${String(port)}`,
  );
}

startServer().catch((startupError: unknown) => {
  // Startup failure is fatal and explicit — never swallowed (GUARDRAILS.md § 2).
  console.error("atlast-api failed to start:", startupError);
  process.exit(1);
});
