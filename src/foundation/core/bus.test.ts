import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent, BusInput } from "@shared/types";
import { Bus, type BusStage } from "./bus";

const event = (id: number): BusInput => ({ type: "project_deleted", id });

test("Bus: 段は登録の順に通り、受け取った段があとで流したものは次の段から通って配られる", () => {
  const bus = new Bus();
  const seen: BusEvent[] = [];
  const order: string[] = [];
  bus.subscribe((e) => seen.push(e));
  let held: BusInput | null = null;
  let emitHeld: ((e: BusInput) => void) | null = null;
  const holder: BusStage = {
    accept(e, later) {
      order.push(`holder:${e.type}`);
      if (e.type !== "project_deleted" || e.id !== 1) return false;
      held = e;
      emitHeld = later;
      return true;
    },
    flush() {
      if (held) emitHeld?.(held);
      held = null;
    },
  };
  const counter: BusStage = {
    accept(e) {
      order.push(`counter:${e.type}`);
      return false;
    },
    track: (e) => (e.type === "project_deleted" ? { ...e, id: e.id * 10 } : (e as BusEvent)),
  };
  bus.use(holder);
  bus.use(counter);
  bus.publish(event(1));
  bus.publish(event(2));
  assert.deepEqual(seen, [{ type: "project_deleted", id: 20 }]);
  bus.flush();
  assert.deepEqual(seen, [
    { type: "project_deleted", id: 20 },
    { type: "project_deleted", id: 10 },
  ]);
  // 受け取ったものを流すときは、受け取った段の次（counter）から通す
  assert.deepEqual(order, ["holder:project_deleted", "holder:project_deleted", "counter:project_deleted", "counter:project_deleted"]);
});

test("Bus: 段がなければそのまま配り、購読をやめたら届かない", () => {
  const bus = new Bus();
  const seen: BusEvent[] = [];
  const off = bus.subscribe((e) => seen.push(e));
  assert.equal(bus.listenerCount(), 1);
  bus.publish(event(3));
  off();
  bus.publish(event(4));
  assert.deepEqual(seen, [{ type: "project_deleted", id: 3 }]);
  assert.equal(bus.listenerCount(), 0);
});
