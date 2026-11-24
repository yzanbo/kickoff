import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { createSizeObservers, sizeChanged } from "./useSizeObserver";

test("sizeChanged: 0.5px 未満の変化と 0 × 0 は知らせない。初めては知らせる", () => {
  assert.equal(sizeChanged(null, { width: 10, height: 20 }), true);
  assert.equal(sizeChanged(null, { width: 0, height: 0 }), false);
  assert.equal(sizeChanged({ width: 10, height: 20 }, { width: 10.4, height: 20.4 }), false);
  assert.equal(sizeChanged({ width: 10, height: 20 }, { width: 10, height: 20.5 }), true);
  assert.equal(sizeChanged({ width: 10, height: 20 }, { width: 9, height: 20 }), true);
  assert.equal(sizeChanged({ width: 10, height: 20 }, { width: 0, height: 0 }), false);
  // 幅だけ 0（高さはある）は見えているものとして知らせる
  assert.equal(sizeChanged({ width: 10, height: 20 }, { width: 0, height: 20 }), true);
});

/** 偽の ResizeObserver（作った数と、見ている要素。notify で知らせを送る） */
function installFakeObserver() {
  const made: FakeObserver[] = [];
  class FakeObserver {
    observed = new Set<Element>();
    constructor(readonly callback: ResizeObserverCallback) {
      made.push(this);
    }
    observe(el: Element) {
      this.observed.add(el);
    }
    unobserve(el: Element) {
      this.observed.delete(el);
    }
    disconnect() {
      this.observed.clear();
    }
    notify(el: Element, width: number, height: number) {
      const entry = { target: el, borderBoxSize: [{ inlineSize: width, blockSize: height }] } as unknown as ResizeObserverEntry;
      this.callback([entry], this as unknown as ResizeObserver);
    }
  }
  vi.stubGlobal("ResizeObserver", FakeObserver);
  return made;
}

test("createSizeObservers: ResizeObserver は 1 つだけ作り、変わったときだけ知らせる。見えていない間の 0 は捨てる", () => {
  const made = installFakeObserver();
  const sizes = createSizeObservers();
  onTestFinished(sizes.clear);
  const a = {} as Element;
  const b = {} as Element;
  const seen: string[] = [];
  const offA = sizes.observeSize(a, (s) => seen.push(`a ${s.width}x${s.height}`));
  sizes.observeSize(b, (s) => seen.push(`b ${s.width}x${s.height}`));
  assert.equal(made.length, 1);
  const ro = made[0];
  ro.notify(a, 100, 50);
  ro.notify(a, 100, 50.2);
  ro.notify(a, 0, 0);
  ro.notify(a, 100, 50);
  ro.notify(b, 10, 10);
  ro.notify(a, 100, 80);
  assert.deepEqual(seen, ["a 100x50", "b 10x10", "a 100x80"]);
  offA();
  assert.equal(ro.observed.has(a), false);
  assert.equal(ro.observed.has(b), true);
});

test("createSizeObservers: もう見ている要素に足した受け手には、変わっていなくても次の知らせで今の大きさを渡す", () => {
  const made = installFakeObserver();
  const sizes = createSizeObservers();
  onTestFinished(sizes.clear);
  const el = {} as Element;
  const first: number[] = [];
  const second: number[] = [];
  const offFirst = sizes.observeSize(el, (s) => first.push(s.height));
  made[0].notify(el, 100, 40);
  const offSecond = sizes.observeSize(el, (s) => second.push(s.height));
  // 付け直した直後の知らせ（大きさは同じ）
  made[0].notify(el, 100, 40);
  assert.deepEqual(first, [40]);
  assert.deepEqual(second, [40]);
  made[0].notify(el, 100, 60);
  assert.deepEqual(first, [40, 60]);
  assert.deepEqual(second, [40, 60]);
  offFirst();
  assert.equal(made[0].observed.has(el), true);
  offSecond();
  assert.equal(made[0].observed.has(el), false);
});
