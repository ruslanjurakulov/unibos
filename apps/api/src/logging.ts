type EventName =
  | "api.started"
  | "api.stopped"
  | "api.startup_failed"
  | "api.readiness_failed"
  | "api.request_failed"
  | "api.connection_failed";
type Status = "ok" | "failed";

/** Intentionally accepts only enumerated operational fields, never error objects or URLs. */
export function writeEvent(
  event: EventName,
  status: Status,
  dependency?: "postgres" | "redis",
): void {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "unibos-api",
      event,
      status,
      ...(dependency ? { dependency } : {}),
    })}\n`,
  );
}
