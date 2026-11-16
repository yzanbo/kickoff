import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorkplaceRef } from "@shared/types";
import { eventSequence } from "@shared/testing/factories";
import {
  isBeforeWorkplaceMove,
  latestWorkplaceMove,
  workplaceAt,
  workplaceBoundaries,
  workplaceLabel,
  workplaceMoveLine,
  workplaceMoveNote,
} from "./workplaceMoves";

const main: WorkplaceRef = { project_id: 1, worktree_path: null, branch: "main", dir: "/repo" };
const wtA: WorkplaceRef = { project_id: 1, worktree_path: "/repo-worktrees/feat-a", branch: "feat/a", dir: "/repo-worktrees/feat-a" };
const wtB: WorkplaceRef = { project_id: 1, worktree_path: "/repo-worktrees/feat-b", branch: null, dir: "/repo-worktrees/feat-b" };

/** 本体で 1 回 → A へ移す → 1 回 → B へ移す → 1 回 */
function twoMoves() {
  const ev = eventSequence();
  const u1 = ev("user", { text: "本体で" });
  const r1 = ev("result", { status: "completed", session_id: "s1", message_id: "m1" });
  const m1 = ev("workplace_moved", { from: main, to: wtA, reason: "user", session_id: "s2", message_id: "m1" });
  const u2 = ev("user", { text: "A で" });
  const r2 = ev("result", { status: "completed", session_id: "s2", message_id: "m2" });
  const m2 = ev("workplace_moved", { from: wtA, to: wtB, reason: "ai" });
  const u3 = ev("user", { text: "B で" });
  return { events: [u1, r1, m1, u2, r2, m2, u3], u1, r1, m1, u2, r2, m2, u3 };
}

test("区切りより前の記録だけが「移す前」で、区切りそのものと後ろは違う", () => {
  const { events, u1, r1, m1, u2, m2, u3 } = twoMoves();
  assert.equal(isBeforeWorkplaceMove(events, u1.id), true);
  assert.equal(isBeforeWorkplaceMove(events, r1.id), true);
  // いちばん新しい区切りで決める（A での発言も、B へ移したあとは移す前）
  assert.equal(isBeforeWorkplaceMove(events, u2.id), true);
  assert.equal(isBeforeWorkplaceMove(events, m2.id), false);
  assert.equal(isBeforeWorkplaceMove(events, u3.id), false);
  assert.equal(isBeforeWorkplaceMove([u1, r1], u1.id), false);
  assert.equal(latestWorkplaceMove(events)?.id, m2.id);
  assert.equal(m1.type, "workplace_moved");
});

test("その発言のときの作業場所は、区間ごとにそのときの場所（何度移しても）", () => {
  const { events, u1, u2, u3 } = twoMoves();
  const current = { project_id: 1, worktree_path: wtB.worktree_path };
  assert.deepEqual(workplaceAt(events, u1.id, current), { project_id: 1, worktree_path: null, moved: true });
  assert.deepEqual(workplaceAt(events, u2.id, current), { project_id: 1, worktree_path: wtA.worktree_path, moved: true });
  assert.deepEqual(workplaceAt(events, u3.id, current), { ...current, moved: false });
  // 並びが入れ替わっていても ID の順で見る（索引と末尾を重ねたもの）
  assert.deepEqual(workplaceBoundaries([...events].reverse()).map((b) => b.id), workplaceBoundaries(events).map((b) => b.id));
});

test("呼び名・区切りの 1 行・AI への知らせ", () => {
  assert.equal(workplaceLabel(main), "本体");
  assert.equal(workplaceLabel(wtA), "ワークツリー（feat/a）");
  assert.equal(workplaceLabel(wtB), "ワークツリー（feat-b）");
  assert.equal(workplaceMoveLine({ from: main, to: wtA, reason: "user", carried: true }), "作業場所を移しました: 本体 → ワークツリー（feat/a）（コミットしていない変更も持っていきました）");
  assert.match(workplaceMoveLine({ from: wtA, to: main, reason: "worktree_finished", backed_up: true }), /片付けた.*控えに入れました/);
  assert.equal(workplaceMoveLine({ from: { ...main, dir: "/old" }, to: { ...main, dir: "/new" }, reason: "folder_moved" }), "プロジェクトのフォルダを変えたので、作業フォルダが変わりました: /old → /new");
  // 別のプロジェクトへ移したときは、どちらも本体になりうるのでフォルダの名前を添える
  assert.equal(
    workplaceMoveLine({ from: main, to: { project_id: 2, worktree_path: null, branch: "main", dir: "/site" }, reason: "project_moved" }),
    "チャットを別のプロジェクトへ移したので、作業場所が変わりました: 本体（repo） → 本体（site）",
  );
  const note = workplaceMoveNote({ from: main, to: wtA, reason: "user" });
  assert.match(note, /本体（\/repo）→ ワークツリー（feat\/a）（\/repo-worktrees\/feat-a）/);
  assert.match(note, /元の場所に残っていて/);
  assert.doesNotMatch(workplaceMoveNote({ from: main, to: wtA, reason: "ai", carried: true }), /残っていて/);
});
