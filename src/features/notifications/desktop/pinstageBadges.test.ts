import assert from "node:assert/strict";
import { test } from "vitest";
import { deferred } from "@shared/foundation/testing/async";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { until } from "@/foundation/core/testing/until";
import { createPinstageBadgePublisher } from "./pinstageBadges";
import type { PinstageBadge } from "./pinstageBadgesModel";

function snapshot(running: number): readonly PinstageBadge[] {
  return [{ corner: "topLeft", count: running, label: "作業中" }];
}

const running = (json: string): number => JSON.parse(json).badges[0]?.count ?? 0;

test("書き出しは直列に行い、待っている間に来た複数の値のうち最後だけを残す", async () => {
  const clock = manualClock();
  const first = deferred<void>();
  const writes: number[] = [];
  const publisher = createPinstageBadgePublisher({
    clock, pid: 300, log: assert.fail,
    file: {
      async write(json) {
        writes.push(running(json));
        if (writes.length === 1) await first.promise;
      },
      async remove() {},
    },
  });
  publisher.publish(snapshot(1));
  publisher.publish(snapshot(2));
  publisher.publish(snapshot(3));
  assert.deepEqual(writes, [1]);
  first.resolve();
  await until(() => writes.length === 2);
  publisher.publish(snapshot(3));
  await publisher.close();
  assert.deepEqual(writes, [1, 3]);
});

test("件数が同じでも色の変更は書き出し、同じ内容を再送しても書き直さない", async () => {
  const clock = manualClock();
  const writes: PinstageBadge[][] = [];
  const publisher = createPinstageBadgePublisher({
    clock, pid: 300, log: assert.fail,
    file: {
      async write(json) { writes.push(JSON.parse(json).badges); },
      async remove() {},
    },
  });
  const original = snapshot(3);
  const recolored = original.map((badge) => ({ ...badge, color: "#65ACEE" }));
  publisher.publish(original);
  publisher.publish(recolored);
  await until(() => writes.length === 2);
  publisher.publish(recolored);
  await publisher.close();
  assert.deepEqual(writes, [original, recolored]);
});

test("空配列の置き換えに一度失敗しても、再送なしで再試行して反映する", async () => {
  const clock = manualClock();
  const writes: number[] = [];
  const failures: string[] = [];
  let failOnce = true;
  const publisher = createPinstageBadgePublisher({
    clock, pid: 300, log: (op) => failures.push(op),
    file: {
      async write(json) {
        const value = running(json);
        if (value === 0 && failOnce) {
          failOnce = false;
          throw new Error("一時的な失敗");
        }
        writes.push(value);
      },
      async remove() {},
    },
  });
  publisher.publish(snapshot(2));
  publisher.publish([]);
  await until(() => clock.pending === 1);
  assert.deepEqual(writes, [2]);
  await clock.advance(999);
  assert.deepEqual(writes, [2]);
  await clock.advance(1);
  await publisher.close();
  assert.deepEqual(writes, [2, 0]);
  assert.deepEqual(failures, ["write"]);
});

test("古い内容の再試行を取りやめ、新しい内容だけを最大 3 回再試行する", async () => {
  const clock = manualClock();
  const attempts: number[] = [];
  const failures: string[] = [];
  const publisher = createPinstageBadgePublisher({
    clock, pid: 300, log: (op) => failures.push(op),
    file: {
      async write(json) {
        attempts.push(running(json));
        throw new Error("書き出せない");
      },
      remove: assert.fail,
    },
  });
  publisher.publish(snapshot(1));
  await until(() => clock.pending === 1);
  publisher.publish(snapshot(2));
  await until(() => attempts.length === 2 && clock.pending === 1);
  for (let i = 1; i <= 3; i++) {
    await clock.advance(1000);
    await until(() => attempts.length === i + 2);
    if (i < 3) await until(() => clock.pending === 1);
  }
  await clock.advance(1000);
  await publisher.close();
  assert.deepEqual(attempts, [1, 2, 2, 2, 2]);
  assert.deepEqual(failures, ["write"]);
  assert.equal(clock.pending, 0);
});

test("終了時は進行中の置き換えの後に削除し、未着手・終了確定後の更新では復活させない", async () => {
  const clock = manualClock();
  const replace = deferred<void>();
  const calls: (string | number)[] = [];
  const publisher = createPinstageBadgePublisher({
    clock, pid: 300, log: assert.fail,
    file: {
      async write(json) {
        await replace.promise;
        calls.push(running(json));
      },
      async remove() { calls.push("削除"); },
    },
  });
  publisher.publish(snapshot(1));
  publisher.publish(snapshot(2));
  const stopped = publisher.close();
  publisher.publish([]);
  assert.deepEqual(calls, []);
  replace.resolve();
  await stopped;
  publisher.publish(snapshot(3));
  await publisher.close();
  assert.deepEqual(calls, [1, "削除"]);
});
