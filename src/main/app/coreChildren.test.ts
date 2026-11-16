import assert from "node:assert/strict";
import { test } from "vitest";
import { parsePs } from "../../core/platform/macos/processes.js";
import { applyChildNote, childrenToStop, type CoreChildren } from "./coreChildren.js";

test("コアの子: 起こしたものを覚え、終わったものは外す。止めるのは、いまもあって親が落ちたコア・DB ワーカー・launchd のものだけ（グループの頭はグループで）", () => {
  const children: CoreChildren = new Map();
  applyChildNote(children, { pid: 610, group: false, kind: "agent", state: "started" });
  applyChildNote(children, { pid: 620, group: true, kind: "dbWorkerChild", state: "started" });
  applyChildNote(children, { pid: 630, group: false, kind: "agent", state: "started" });
  applyChildNote(children, { pid: 630, group: false, kind: "agent", state: "exited" });
  applyChildNote(children, { pid: 640, group: false, kind: "agent", state: "started" });
  applyChildNote(children, { pid: 650, group: false, kind: "agent", state: "started" });
  // 610 は launchd に引き取られた・620 は DB ワーカー（700）の子・640 は番号を使い回したほかのプロセス・650 はもうない
  const table = parsePs(`    1     0 10:00 /sbin/launchd
  610     1 01:00 /Users/me/.local/bin/claude --output-format stream-json
  620   700 01:00 ssh -N -L 127.0.0.1:5000:db:5432 bastion
  640   900 00:01 /usr/bin/some-other`);
  assert.deepEqual(childrenToStop(children, table, [500, 700]), [
    { pid: 610, group: false },
    { pid: 620, group: true },
  ]);
});
