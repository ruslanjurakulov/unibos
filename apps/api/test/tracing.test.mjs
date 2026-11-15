import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { SpanStatusCode } from "@opentelemetry/api";
import { createApplication } from "../dist/application.js";
import { ReadinessTracing, readTracingEnabled } from "../dist/tracing.js";

const config = {
  mode: "test",
  host: "127.0.0.1",
  apiPort: 3001,
  databaseUrl: "postgresql://test:synthetic-test-only@127.0.0.1:1/unibos",
  redisUrl: "redis://:synthetic-test-only@127.0.0.1:1/0",
};

test("readiness failure exports one safe manual span without error/credential data", async () => {
  const exporter = new InMemorySpanExporter();
  const tracing = new ReadinessTracing(true, exporter);
  const app = await createApplication(
    config,
    {
      postgres: async () => {},
      redis: async () => {
        throw new Error(`private-secret ${config.redisUrl}`);
      },
    },
    tracing,
  );
  try {
    await app.listen(0, "127.0.0.1");
    assert.equal(
      (await fetch(`${await app.getUrl()}/health/ready`)).status,
      503,
    );
    await tracing.flush();
    const spans = exporter.getFinishedSpans();
    assert.equal(spans.length, 1);
    const span = spans[0];
    assert.equal(span.name, "api.readiness");
    assert.deepEqual(span.attributes, {
      "service.name": "unibos-api",
      "http.route": "/health/ready",
      "dependency.postgres.status": "up",
      "dependency.redis.status": "down",
    });
    assert.deepEqual(span.status, { code: SpanStatusCode.ERROR });
    assert.deepEqual(span.events, []);
    const safeExport = JSON.stringify({
      name: span.name,
      attributes: span.attributes,
      status: span.status,
      events: span.events,
    });
    assert.ok(!safeExport.includes("private-secret"));
    assert.ok(!safeExport.includes("synthetic-test-only"));
    assert.ok(!safeExport.includes(config.redisUrl));
  } finally {
    await app.close();
  }
});

test("tracing defaults to no export and invalid flags fail without echoing values", async () => {
  assert.equal(readTracingEnabled(undefined), false);
  assert.equal(readTracingEnabled("false"), false);
  assert.equal(readTracingEnabled("true"), true);
  assert.throws(
    () => readTracingEnabled("secret-value"),
    (error) => {
      assert.equal(error.message, "Invalid OTEL_ENABLED");
      return true;
    },
  );
  const exporter = new InMemorySpanExporter();
  const tracing = new ReadinessTracing(false, exporter);
  try {
    tracing.completeReadiness(tracing.startReadiness(), true, true);
    await tracing.flush();
    assert.equal(exporter.getFinishedSpans().length, 0);
  } finally {
    await tracing.onApplicationShutdown();
  }
});
