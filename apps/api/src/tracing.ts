import { SpanStatusCode, type Span } from "@opentelemetry/api";
import {
  TracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace";

/** Local-only manual spans; never registers a global provider or contacts a backend. */
export class ReadinessTracing {
  private readonly provider: TracerProvider;

  constructor(enabled = false, exporter?: SpanExporter) {
    this.provider = new TracerProvider({
      spanProcessors: enabled
        ? [
            new SimpleSpanProcessor({
              exporter: exporter ?? new ConsoleSpanExporter(),
            }),
          ]
        : [],
    });
  }

  startReadiness(): Span {
    return this.provider
      .getTracer("unibos-api", "0.1.0")
      .startSpan("api.readiness", {
        attributes: {
          "service.name": "unibos-api",
          "http.route": "/health/ready",
        },
      });
  }

  completeReadiness(span: Span, postgresUp: boolean, redisUp: boolean): void {
    span.setAttribute("dependency.postgres.status", postgresUp ? "up" : "down");
    span.setAttribute("dependency.redis.status", redisUp ? "up" : "down");
    span.setStatus({
      code: postgresUp && redisUp ? SpanStatusCode.OK : SpanStatusCode.ERROR,
    });
    span.end();
  }

  async flush(): Promise<void> {
    await this.provider.forceFlush();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.provider.shutdown();
  }
}

export function readTracingEnabled(value: string | undefined): boolean {
  if (value !== undefined && value !== "true" && value !== "false") {
    throw new Error("Invalid OTEL_ENABLED");
  }
  return value === "true";
}
