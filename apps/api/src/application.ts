import "reflect-metadata";
import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  Inject,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { RuntimeConfig } from "@unibos/runtime";
import { InfrastructureProbes, type HealthProbes } from "./probes";
import { writeEvent } from "./logging";
import { ReadinessTracing, readTracingEnabled } from "./tracing";

const PROBES = Symbol("health-probes");
const TRACING = Symbol("readiness-tracing");

@Controller("health")
class HealthController {
  constructor(
    @Inject(PROBES) private readonly probes: HealthProbes,
    @Inject(TRACING) private readonly tracing: ReadinessTracing,
  ) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    const span = this.tracing.startReadiness();
    const results = await Promise.allSettled([
      this.probes.postgres(),
      this.probes.redis(),
    ]);
    this.tracing.completeReadiness(
      span,
      results[0]?.status === "fulfilled",
      results[1]?.status === "fulfilled",
    );
    for (const [index, dependency] of ["postgres", "redis"].entries()) {
      if (results[index]?.status === "rejected") {
        writeEvent(
          "api.readiness_failed",
          "failed",
          dependency as "postgres" | "redis",
        );
      }
    }
    if (results.some((result) => result.status === "rejected")) {
      throw new ServiceUnavailableException();
    }
    return { status: "ready" };
  }
}

interface HttpResponse {
  setHeader(name: string, value: string): void;
  status(code: number): HttpResponse;
  json(body: object): void;
}

@Catch()
class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500 && status !== 503)
      writeEvent("api.request_failed", "failed");
    host
      .switchToHttp()
      .getResponse<HttpResponse>()
      .status(status)
      .json({
        status: "error",
        statusCode: status,
        message:
          status === 404
            ? "Not found"
            : status === 503
              ? "Service unavailable"
              : "Request failed",
      });
  }
}

/** Does not listen or provision resources; caller owns startup and app.close(). */
export async function createApplication(
  config: RuntimeConfig,
  probes?: HealthProbes,
  tracing: ReadinessTracing = new ReadinessTracing(
    readTracingEnabled(process.env.OTEL_ENABLED),
  ),
) {
  @Module({
    controllers: [HealthController],
    providers: [
      { provide: PROBES, useValue: probes ?? new InfrastructureProbes(config) },
      { provide: TRACING, useValue: tracing },
    ],
  })
  class ApiModule {}

  const app = await NestFactory.create(ApiModule, {
    logger: false,
    bodyParser: false,
  });
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use((_request: unknown, response: HttpResponse, next: () => void) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
