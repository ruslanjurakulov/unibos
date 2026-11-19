import assert from "node:assert/strict";
import hostedJourney from "../../scripts/staging/hosted-journey.cjs";

// Exercise the Windows runner's exact business requests on the disposable HTTP API.
// Discard one committed response to reproduce a transport failure during settlement.
export async function verifyHostedJourneyReplay(actors, userIds) {
  assert.equal(new Set(Object.values(userIds)).size, 4);
  const bindings = new Map();
  const state = {
    has: (kind) => bindings.has(kind),
    bind(kind, id) {
      if (bindings.has(kind)) assert.equal(id, bindings.get(kind), kind);
      bindings.set(kind, id);
    },
  };
  let interruptSettlement = true;
  let completedReplay = false;
  const replayed = { cashier: 0, kitchen: 0, waiter: 0 };
  const simulatedTimeout = new Error("simulated lost settlement response");
  const sessions = Object.fromEntries(
    Object.entries(actors).map(([role, actor]) => [
      role,
      {
        async request(
          label,
          path,
          { method = "GET", expected = 200, body } = {},
        ) {
          const result = await actor.request(path, { method, body });
          assert.ok(
            [].concat(expected).includes(result.status),
            role + " " + label + ": HTTP " + result.status,
          );
          if (completedReplay && method !== "GET" && result.status !== 403) {
            assert.ok(
              body?.idempotencyKey,
              "completed replay repeated setup: " + label,
            );
            assert.equal(result.status, 200, label);
            assert.equal(result.data?.duplicate, true, label);
            replayed[role]++;
          }
          if (
            interruptSettlement &&
            role === "cashier" &&
            method === "POST" &&
            path.includes("/cash-payments/orders/")
          ) {
            interruptSettlement = false;
            throw simulatedTimeout;
          }
          return result.data;
        },
      },
    ]),
  );
  const run = () => hostedJourney.runJourney(sessions, userIds, state);
  await assert.rejects(run, (error) => error === simulatedTimeout);
  const recovered = await run();
  assert.equal(recovered.settledMinor, "25000");
  assert.equal(recovered.varianceMinor, "0");
  completedReplay = true;
  assert.deepEqual(await run(), recovered);
  assert.deepEqual(replayed, { cashier: 6, kitchen: 3, waiter: 1 });
}
