import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { open, openTargets, type OpenOptions, type OpenTargetHandler } from "./open";
import { popoutKinds } from "./popout";

declare module "./open" {
  interface OpenTargetMap {
    /** テストだけの行き先 */
    sample: { n: number };
  }
}

/** 受け取った行き先を並べる受け手と、別ウィンドウの種類（サイドバー）を入れる */
function installSample() {
  const got: { n: number; options: OpenOptions }[] = [];
  const sample: OpenTargetHandler<"sample"> = { kind: "sample", open: ({ n }, options) => (got.push({ n, options }), true) };
  useTestContributions([openTargets.item(sample), popoutKinds.item({ kind: "sidebar", fields: {} })]);
  return got;
}

test("open: kind の受け手を引いて、行き先と選択肢を渡す", () => {
  vi.stubGlobal("location", { hash: "#/projects/1" });
  const got = installSample();
  assert.equal(open({ kind: "sample", n: 1 }), true);
  assert.equal(open({ kind: "sample", n: 2 }, { replace: true }), true);
  assert.deepEqual(got, [
    { n: 1, options: {} },
    { n: 2, options: { replace: true } },
  ]);
});

test("open: 受け手がなければ投げる（開発中）", () => {
  vi.stubGlobal("location", { hash: "#/projects/1" });
  useTestContributions([]);
  assert.throws(() => open({ kind: "sample", n: 1 }), /行き先 sample の受け手がない/);
});

test("open: 別ウィンドウで真ん中の画面・右の欄を頼まれたらメインのウィンドウへ送り、別ウィンドウ（window）はその場で開く", () => {
  vi.stubGlobal("location", { hash: "#/popout/sidebar" });
  const focusMain = vi.fn(async () => {});
  vi.stubGlobal("window", { kickoff: { windows: { focusMain } } });
  const got = installSample();
  assert.equal(open({ kind: "sample", n: 1 }, { surface: "side" }), true);
  assert.equal(open({ kind: "sample", n: 2 }, { surface: "page" }), true);
  assert.equal(focusMain.mock.calls.length, 2);
  assert.deepEqual(got, []);
  open({ kind: "sample", n: 3 }, { surface: "window" });
  assert.deepEqual(got, [{ n: 3, options: { surface: "window" } }]);
});
