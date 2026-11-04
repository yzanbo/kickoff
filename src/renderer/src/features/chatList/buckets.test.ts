import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat, ChatGroup, GitWorktree, Project } from "@shared/types";
import { approvalIndex } from "@/features/chat/chatState";
import { COUNTED_COLUMNS } from "@/features/chat/chatState";
import { chatHead, draftHead } from "./bucketHeads";
import { bucketChats, sortBuckets, type BucketHead, type ChatBucket } from "./buckets";

const chat = (id: number, patch: Partial<Chat> = {}): Chat =>
  ({
    id,
    project_id: 1,
    group_id: null,
    worktree_path: null,
    branch: null,
    status: "completed",
    unread: false,
    pinned: false,
    archived_at: null,
    active_at: `2026-11-${String(id).padStart(2, "0")}T00:00:00Z`,
    ...patch,
  }) as Chat;
const group = (id: number, position: number, projectId = 1): ChatGroup => ({ id, project_id: projectId, name: `G${id}`, position, hue: 0, created_at: "" });
const project = (id: number): Project => ({ id, name: `P${id}` }) as Project;
const worktree = (path: string, branch: string, main = false): GitWorktree => ({ path, branch, head: "abc1234", main, locked: false, prunable: false });

const pending = approvalIndex([]);
const groups: Record<number, ChatGroup[]> = { 1: [group(5, 2), group(4, 1)], 2: [group(9, 1, 2)] };
const ctx = { pending, groupsOf: (id: number) => groups[id] ?? [] };
/** まとまりのキーと、中のチャットの ID */
const shape = (list: ChatBucket[]) => list.map((b) => [b.key, b.chats.map((c) => c.id)]);

test("bucketChats: グループはサイドバーの並び、もうないグループはグループなしに入れる。中は最後に動いた順", () => {
  const list = bucketChats([chat(1, { group_id: 5 }), chat(2, { group_id: 4 }), chat(3, { group_id: 77 }), chat(4), chat(6, { group_id: 5 })], { ...ctx, by: "group" });
  assert.deepEqual(shape(list), [
    ["p1/g4", [2]],
    ["p1/g5", [6, 1]],
    ["p1/ungrouped", [4, 3]],
  ]);
  assert.equal(list[0].kind, "group");
  assert.equal(list[0].label, "G4");
  assert.equal(list[2].kind, "ungrouped");
  assert.equal(list[2].label, "グループなし");
});

test("bucketChats: 下書きは作成先のグループへ（もうないグループはグループなし）。keepEmpty ならチャットのないグループも出す", () => {
  const drafts = [{ projectId: 1, group: 5 }, { projectId: 1, group: 77 }, { projectId: 1 }];
  const list = bucketChats([chat(1, { group_id: 4 })], { ...ctx, by: "group", drafts, project: 1, keepEmpty: (h) => h.kind === "group" });
  assert.deepEqual(
    list.map((b) => [b.key, b.chats.length, b.drafts.length]),
    [
      ["p1/g4", 1, 0],
      ["p1/g5", 0, 1],
      ["p1/ungrouped", 0, 2],
    ],
  );
  // keepEmpty がなければ、チャットも下書きもないまとまりは出さない
  assert.deepEqual(shape(bucketChats([chat(1, { group_id: 4 })], { ...ctx, by: "group" })), [["p1/g4", [1]]]);
  // keepEmpty が true なら、グループなしも出す
  assert.deepEqual(shape(bucketChats([], { ...ctx, by: "group", project: 1, keepEmpty: true })), [
    ["p1/g4", []],
    ["p1/g5", []],
    ["p1/ungrouped", []],
  ]);
});

test("bucketChats: 作業場所は本体 → ワークツリー（名前順）→ フォルダなし → 以前のブランチ。下書きはそのプロジェクトの本体へ", () => {
  const list1 = [worktree("/repo", "main", true), worktree("/repo-worktrees/b", "b-feature"), worktree("/repo-worktrees/a", "a-feature")];
  const worktreesOf = (id: number) => (id === 1 ? list1 : id === 2 ? [worktree("/two", "main", true)] : undefined);
  const chats = [
    chat(1, { worktree_path: "/repo-worktrees/b" }),
    chat(2, { worktree_path: "/gone" }),
    chat(3, { branch: "old" }),
    chat(4, { worktree_path: "/repo-worktrees/a" }),
    chat(5),
  ];
  const list = bucketChats(chats, { ...ctx, worktreesOf, by: "worktree", drafts: [{ projectId: 2 }] });
  assert.deepEqual(shape(list), [
    ["p1/w:main", [5]],
    ["p1/w:/repo-worktrees/a", [4]],
    ["p1/w:/repo-worktrees/b", [1]],
    ["p1/w:/gone", [2]],
    ["p1/w:branch:old", [3]],
    ["p2/w:main", []],
  ]);
  assert.deepEqual(
    list.map((b) => [b.place?.kind, b.label]),
    [
      ["main", "main"],
      ["worktree", "a-feature"],
      ["worktree", "b-feature"],
      ["missing", "gone"],
      ["past", "old"],
      ["main", "main"],
    ],
  );
  assert.equal(list[5].drafts.length, 1);
});

test("bucketChats: 状態はカンバンの列の順。keepEmpty ならすべての列、columns にない列のチャットは入れない", () => {
  const states = approvalIndex([{ chat_id: 2 }]);
  const chats = [chat(1, { status: "running" }), chat(2, { status: "running" }), chat(3, { unread: true }), chat(4, { status: "failed", unread: true }), chat(5)];
  const all = bucketChats(chats, { pending: states, by: "status", keepEmpty: true });
  assert.deepEqual(shape(all), [
    ["status:running", [1]],
    ["status:needs_input", [2]],
    ["status:unread", [4, 3]],
    ["status:read", [5]],
  ]);
  assert.deepEqual(
    all.map((b) => b.label),
    ["作業中", "回答待ち", "未読", "既読"],
  );
  // 数を出す列だけ（既読は入れない）。チャットのない列は出さない
  assert.deepEqual(shape(bucketChats([chat(1, { status: "running" }), chat(5)], { pending: states, by: "status", columns: COUNTED_COLUMNS })), [["status:running", [1]]]);
});

test("bucketChats: アーカイブ済みは keep = 列に入れたまま / bucket = いちばん後ろに抜き出す / drop = 入れない", () => {
  const chats = [chat(1), chat(2, { archived_at: "x" }), chat(3, { status: "running", archived_at: "x" })];
  assert.deepEqual(shape(bucketChats(chats, { pending, by: "status" })), [
    ["status:running", [3]],
    ["status:read", [2, 1]],
  ]);
  assert.deepEqual(shape(bucketChats(chats, { pending, by: "status", archived: "bucket" })), [
    ["status:read", [1]],
    ["archived", [3, 2]],
  ]);
  assert.deepEqual(shape(bucketChats(chats, { pending, by: "status", archived: "drop" })), [["status:read", [1]]]);
});

test("bucketChats: 固定はプロジェクトごとにいちばん前、アーカイブ済みはすべてのプロジェクトのあと（固定したアーカイブ済みはアーカイブ済みへ）", () => {
  const chats = [
    chat(1, { pinned: true }),
    chat(2, { group_id: 4 }),
    chat(3, { project_id: 2, pinned: true }),
    chat(4, { project_id: 2, archived_at: "x" }),
    chat(5, { pinned: true, archived_at: "x" }),
    chat(6, { project_id: 2 }),
  ];
  const list = bucketChats(chats, { ...ctx, by: "group", pinned: true, archived: "bucket", projects: [project(2), project(1)] });
  assert.deepEqual(shape(list), [
    ["p2/pinned", [3]],
    ["p2/ungrouped", [6]],
    ["p1/pinned", [1]],
    ["p1/g4", [2]],
    ["p2/archived", [4]],
    ["p1/archived", [5]],
  ]);
});

test("bucketChats: 中の段のキーは親につなぐ。固定は中を分けず、アーカイブ済みの中はグループを除いた段で分ける", () => {
  const chats = [chat(1, { group_id: 4, status: "running" }), chat(2, { group_id: 4 }), chat(3, { pinned: true }), chat(4, { archived_at: "x", group_id: 4 })];
  const list = bucketChats(chats, { ...ctx, by: ["group", "status"], project: 1, pinned: true, archived: "bucket" });
  assert.deepEqual(
    list.map((b) => [b.key, b.children?.map((c) => c.key)]),
    [
      ["p1/pinned", undefined],
      ["p1/g4", ["p1/g4/status:running", "p1/g4/status:read"]],
      ["p1/archived", ["p1/archived/status:read"]],
    ],
  );
  assert.deepEqual(list[1].counts, { running: 1, needs_input: 0, unread: 0 });
  // プロジェクトの中だけを分けるときは、状態のまとまりもプロジェクトの下に置く（ほかのプロジェクトのものは入れない）
  assert.deepEqual(shape(bucketChats([chat(1), chat(2, { project_id: 2 })], { pending, by: "status", project: 1 })), [["p1/status:read", [1]]]);
});

test("bucketChats: まとめない（by が空）なら見出しのないまとまり 1 つ", () => {
  assert.deepEqual(shape(bucketChats([chat(1), chat(2, { pinned: true })], { pending, by: [], project: 1, pinned: true })), [
    ["p1/pinned", [2]],
    ["p1/all", [1]],
  ]);
});

test("bucketChats: プロジェクトは渡した並びの順で、並びにないプロジェクトの段は作らない（並びがなければ出てきた順）", () => {
  const chats = [chat(1, { project_id: 3 }), chat(2, { project_id: 1 }), chat(3, { project_id: 2 })];
  const byProject = bucketChats(chats, { pending, by: "project", projects: [project(2), project(1)] });
  assert.deepEqual(shape(byProject), [
    ["p2", [3]],
    ["p1", [2]],
  ]);
  assert.equal(byProject[0].label, "P2");
  assert.deepEqual(
    bucketChats(chats, { pending, by: "project" }).map((b) => b.key),
    ["p3", "p1", "p2"],
  );
  // 下書きだけのプロジェクトも出し、keepEmpty なら渡したプロジェクトをすべて出す
  assert.deepEqual(shape(bucketChats([], { pending, by: "project", projects: [project(2), project(5)], drafts: [{ projectId: 5 }, { projectId: 7 }] })), [["p5", []]]);
  assert.deepEqual(shape(bucketChats([], { pending, by: "project", projects: [project(2), project(1)], keepEmpty: true })), [
    ["p2", []],
    ["p1", []],
  ]);
});

test("chatHead / draftHead: パネルのタブと同じ決め方（アーカイブ済み → 固定 → 分け方）。状態で分けるときの下書きはどこにも入れない", () => {
  const opts = { pinned: true, archived: "bucket" as const };
  assert.equal(chatHead(chat(1, { archived_at: "x", pinned: true }), "group", ctx, opts)?.key, "p1/archived");
  assert.equal(chatHead(chat(1, { pinned: true }), "group", ctx, opts)?.key, "p1/pinned");
  assert.equal(chatHead(chat(1, { group_id: 9, project_id: 2 }), "group", ctx, opts)?.key, "p2/g9");
  assert.equal(draftHead({ projectId: 2, group: 1 }, "group", ctx)?.key, "p2/ungrouped");
  assert.equal(draftHead({ projectId: 2 }, "worktree", ctx)?.key, "p2/w:main");
  assert.equal(draftHead({ projectId: 2 }, "status", ctx), undefined);
});

test("sortBuckets: アーカイブ済み・その他はいちばん後ろ。プロジェクトの順のあと、同じプロジェクトの中は 固定 → まとまり → グループなし", () => {
  const head = (key: string, kind: BucketHead["kind"], projectId?: number): BucketHead => ({ key, kind, label: key, projectId });
  const list = sortBuckets(
    [head("other", "other"), head("p1/archived", "archived", 1), head("p1/ungrouped", "ungrouped", 1), head("p2/w:main", "worktree", 2), head("p1/pinned", "pinned", 1), head("p1/g4", "group", 1)],
    [2],
  );
  assert.deepEqual(
    list.map((b) => b.key),
    ["p2/w:main", "p1/pinned", "p1/g4", "p1/ungrouped", "p1/archived", "other"],
  );
});
