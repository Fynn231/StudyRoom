import { test } from "node:test";
import assert from "node:assert/strict";
import { focusWorker, start } from "./helpers/focus-worker.js";

test("consumed expiry retains five finite retries across cold delivery without extending the lease", async () => {
  const w = await focusWorker();
  const active = await start(w);
  const initial = [...w.alarms.values()].sort((a, b) => a.scheduledTime - b.scheduledTime);
  assert.equal(initial.length, 6);
  assert.deepEqual(
    initial.map((alarm) => alarm.scheduledTime - active.endsAt),
    [0, 30000, 90000, 210000, 450000, 930000],
  );
  const creates = () => w.operations.filter((op) => op.op === "alarmCreate").length;
  const preparedCount = creates();
  w.failures.add("rulesUpdate");
  w.failures.add("read");
  for (const [index, alarm] of initial.entries()) {
    await w.consume(alarm.name, true, index % 2 === 0);
    assert.equal(w.rules().length, 1, "failed removal cannot claim blocking is off");
    assert.equal(w.data.active.endsAt, active.endsAt, "never extend the original lease");
    assert.equal(w.alarms.size, initial.length - index - 1);
    assert.equal(creates(), preparedCount, "recovery never recreates a consumed retry");
    for (const remaining of initial.slice(index + 1))
      assert.equal(w.alarms.get(remaining.name)?.scheduledTime, remaining.scheduledTime);
  }
  assert.equal(w.alarms.size, 0, "exhausted slots cannot produce an unlimited retry loop");
  w.boot();
  await w.drain();
  assert.equal(w.alarms.size, 0);
  assert.equal(creates(), preparedCount, "cold initialization cannot reset an exhausted budget");
  w.failures.delete("read");
  const status = await w.send({ type: "status" });
  assert.equal(status.ok, false);
  assert.match(status.error, /disable|remove/i);
  w.failures.delete("rulesUpdate");
  const result = await w.send({ type: "stop" });
  assert.equal(result.ok, true);
  assert.equal(result.active, null);
  assert.deepEqual(w.rules(), []);
  assert.equal(w.data.active, undefined);
  assert.equal(w.data.cleanup, undefined);
  assert.equal(w.alarms.size, 0);
  assert.equal(creates(), preparedCount, "manual recovery after expiry cannot mint another batch");
  assert.equal(w.data.focusGeneration, active.generation, "Stop never resets allocation");
});
