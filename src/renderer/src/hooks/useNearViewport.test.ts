import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createViewportWatchers } from "./useNearViewport";

/** 偽の IntersectionObserver（作ったものを覚え、fire で知らせる） */
class FakeObserver {
  static made: FakeObserver[] = [];
  targets = new Set<Element>();
  disconnected = false;
  constructor(
    readonly callback: (entries: { target: Element; isIntersecting: boolean }[]) => void,
    readonly options: IntersectionObserverInit & { scrollMargin?: string },
  ) {
    FakeObserver.made.push(this);
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire(target: Element, isIntersecting: boolean) {
    this.callback([{ target, isIntersecting }]);
  }
}

/** 偽の要素（parentElement と、data-near-root を持つか） */
function el(parent: Element | null = null, root = false): Element {
  const node = {
    parentElement: parent,
    matches: () => root,
    closest(selector: string): Element | null {
      for (let at: Element | null = node as unknown as Element; at; at = at.parentElement) if (at.matches(selector)) return at;
      return null;
    },
  };
  return node as unknown as Element;
}

test("createViewportWatchers: 枠（いちばん外側の data-near-root）と余白の組ごとに見張りを 1 つ使い回し、入れ子の枠は scrollMargin で広げる", () => {
  FakeObserver.made = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const watchers = createViewportWatchers();
  const timeline = el(null, true);
  const card = el(timeline, true);
  const a = el(card);
  const b = el(timeline);
  const seen: string[] = [];
  const stopA = watchers.watch(a, 1200, (near) => seen.push(`a:${near}`));
  const stopB = watchers.watch(b, 1200, (near) => seen.push(`b:${near}`));
  assert.equal(FakeObserver.made.length, 1);
  const io = FakeObserver.made[0];
  assert.equal(io.options.root, timeline);
  assert.equal(io.options.rootMargin, "1200px");
  assert.equal(io.options.scrollMargin, "1200px");
  io.fire(a, true);
  io.fire(b, false);
  assert.deepEqual(seen, ["a:true", "b:false"]);
  // 余白が違えば別の見張り・枠の外（画面）は root が null
  watchers.watch(el(), 200, () => {});
  assert.equal(FakeObserver.made.length, 2);
  assert.equal(FakeObserver.made[1].options.root, null);
  // 使う要素がなくなった見張りは捨てる
  stopA();
  assert.equal(io.disconnected, false);
  stopB();
  assert.equal(io.disconnected, true);
});
