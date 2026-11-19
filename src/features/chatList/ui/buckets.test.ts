import assert from "node:assert/strict";
import { test } from "vitest";
import type { Chat, ChatGroup } from "@shared/types";
import { makeChat, makeGroup, makeProject, makeWorktree } from "@shared/foundation/testing/factories";
import { approvalIndex } from "@/features/chat/ui/state/chatState";
import { COUNTED_COLUMNS } from "@/features/chat/ui/state/chatState";
import { chatHead, draftHead } from "./bucketHeads";
import { bucketChats, flattenBucketChats, newChatPlaceOf, sortBuckets, type BucketHead, type ChatBucket } from "./buckets";
import { byManual } from "./manualOrder";

// 並び順は id の順（新しいほど大きい）
const chat = (id: number, patch: Partial<Chat> = {}) => makeChat(id, { active_at: `2026-11-${String(id).padStart(2, "0")}T00:00:00Z`, ...patch });
const group = (id: number, position: number, projectId = 1) => makeGroup(id, { position, project_id: projectId });
const project = (id: number) => makeProject(id, { name: `P${id}` });

const pending = approvalIndex([]);
const groups: Record<number, ChatGroup[]> = { 1: [group(5, 2), group(4, 1)], 2: [group(9, 1, 2)] };
const ctx = { pending, groupsOf: (id: number) => groups[id] ?? [] };
/** まとまりのキーと、中のチャットの ID */
const shape = (list: ChatBucket[]) => list.map((b) => [b.key, b.chats.map((c) => c.id)]);

test("bucketChats: nested の固定はグループから抜き出さず、その中の先頭。固定同士・通常同士は選んだ並び順", () => {
  const chats = [
    chat(1, { group_id: 4, pinned: true, position: 0 }),
    chat(2, { group_id: 4, pinned: true, position: 1 }),
    chat(3, { group_id: 4, position: 2 }),
    chat(4, { group_id: 4, position: 3 }),
    chat(5, { group_id: 5, pinned: true }),
    chat(6, { group_id: 77, pinned: true }),
    chat(7),
  ];
  const opts = { ...ctx, by: "group" as const, project: 1, pinned: "nested" as const, archived: "nested" as const };
  const list = bucketChats(chats, opts);
  assert.deepEqual(shape(list), [["p1/g4", [2, 1, 4, 3]], ["p1/g5", [5]], ["p1/ungrouped", [6, 7]]]);
  assert.deepEqual(shape(bucketChats(chats, { ...opts, sort: byManual })), [["p1/g4", [1, 2, 3, 4]], ["p1/g5", [5]], ["p1/ungrouped", [6, 7]]]);
  assert.deepEqual(list[0].counts, { running: 0, needs_input: 0, unread: 0 });
  assert.equal(chats[0].id, 1); // 入力の並びは変えない
  assert.deepEqual(shape(bucketChats(chats.map((c) => ({ ...c, pinned: false })), opts)), [["p1/g4", [4, 3, 2, 1]], ["p1/g5", [5]], ["p1/ungrouped", [7, 6]]]);
});

test("bucketChats: nested の固定はグループ内の状態見出しより前。アーカイブ済みは固定していても末尾", () => {
  const chats = [
    chat(1, { group_id: 4, pinned: true, unread: true }),
    chat(2, { group_id: 4, status: "running" }),
    chat(3, { group_id: 4 }),
    chat(4, { group_id: 4, pinned: true, archived_at: "x" }),
    chat(5, { pinned: true }),
  ];
  const list = bucketChats(chats, { ...ctx, by: ["group", "status"], project: 1, pinned: "nested", archived: "nested" });
  assert.deepEqual(list.map((b) => b.key), ["p1/g4", "p1/ungrouped"]);
  assert.deepEqual(shape(list[0].children!), [["p1/g4/pinned", [1]], ["p1/g4/status:running", [2]], ["p1/g4/status:read", [3]]]);
  assert.deepEqual(shape(list[1].children!), [["p1/ungrouped/pinned", [5]]]);
  assert.deepEqual(list[0].counts, { running: 1, needs_input: 0, unread: 1 });
  assert.deepEqual(list[0].archived?.chats.map((c) => c.id), [4]);
  assert.deepEqual(flattenBucketChats(list).map((c) => c.id), [1, 2, 3, 4, 5]);
});

test("bucketChats: nested の固定は作業場所の中。本体・ワークツリーの並びは変えない。前のブランチが違っても本体", () => {
  const worktreesOf = () => [makeWorktree("/repo", { branch: "main", main: true }), makeWorktree("/wt/a", { branch: "feature" })];
  const chats = [chat(1, { pinned: true }), chat(2), chat(3, { worktree_path: "/wt/a", pinned: true }), chat(4, { worktree_path: "/wt/a", status: "running" }), chat(5, { branch: "old", pinned: true })];
  const opts = { ...ctx, worktreesOf, project: 1, pinned: "nested" as const, archived: "nested" as const };
  const recent = bucketChats(chats, { ...opts, by: "worktree" });
  assert.deepEqual(shape(recent), [["p1/w:main", [5, 1, 2]], ["p1/w:/wt/a", [3, 4]]]);
  const status = bucketChats(chats, { ...opts, by: ["worktree", "status"] });
  assert.deepEqual(shape(status[1].children!), [["p1/w:/wt/a/pinned", [3]], ["p1/w:/wt/a/status:running", [4]]]);
  assert.deepEqual(flattenBucketChats(status).map((c) => c.id), [5, 1, 2, 3, 4]);
});

test("bucketChats: 全プロジェクトでも nested の固定はプロジェクト・グループをまたがない", () => {
  const chats = [chat(1, { group_id: 4, pinned: true }), chat(2, { group_id: 4 }), chat(3, { project_id: 2, group_id: 9, pinned: true }), chat(4, { project_id: 2, group_id: 9 })];
  const list = bucketChats(chats, { ...ctx, by: ["project", "group", "status"], pinned: "nested", projects: [project(2), project(1)] });
  assert.deepEqual(list.map((b) => b.key), ["p2", "p1"]);
  assert.deepEqual(list[0].children?.map((b) => b.key), ["p2/g9"]);
  assert.deepEqual(list[0].children?.[0].children?.map((b) => b.key), ["p2/g9/pinned", "p2/g9/status:read"]);
  assert.deepEqual(flattenBucketChats(list).map((c) => c.id), [3, 4, 1, 2]);
});

test("bucketChats: ピン留めした下書きだけでも、所属する作業場所のまとまりを作る", () => {
  const drafts = [{ projectId: 1, worktree: "/wt/a", pinned: true }];
  const list = bucketChats([], { ...ctx, by: ["worktree", "status"], project: 1, pinned: "nested", drafts });
  assert.equal(list[0].key, "p1/w:/wt/a");
  assert.deepEqual(list[0].drafts, drafts);
  assert.deepEqual(list[0].children, []);
});

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
  assert.equal(list[2].label, "No Group");
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

test("bucketChats: 作業場所は本体 → ワークツリー（名前順）→ フォルダなし。片付けて本体に戻ったチャットは本体。下書きはそのプロジェクトの本体へ", () => {
  const list1 = [makeWorktree("/repo", { branch: "main", main: true }), makeWorktree("/repo-worktrees/b", { branch: "b-feature" }), makeWorktree("/repo-worktrees/a", { branch: "a-feature" })];
  const worktreesOf = (id: number) => (id === 1 ? list1 : id === 2 ? [makeWorktree("/two", { branch: "main", main: true })] : undefined);
  const chats = [
    chat(1, { worktree_path: "/repo-worktrees/b" }),
    chat(2, { worktree_path: "/gone" }),
    chat(3, { branch: "old", finished_worktree_branch: "old" }),
    chat(4, { worktree_path: "/repo-worktrees/a" }),
    chat(5),
  ];
  const list = bucketChats(chats, { ...ctx, worktreesOf, by: "worktree", drafts: [{ projectId: 2 }] });
  assert.deepEqual(shape(list), [
    ["p1/w:main", [5, 3]],
    ["p1/w:/repo-worktrees/a", [4]],
    ["p1/w:/repo-worktrees/b", [1]],
    ["p1/w:/gone", [2]],
    ["p2/w:main", []],
  ]);
  assert.deepEqual(
    list.map((b) => [b.place?.kind, b.label]),
    [
      ["main", "main"],
      ["worktree", "a-feature"],
      ["worktree", "b-feature"],
      ["missing", "gone"],
      ["main", "main"],
    ],
  );
  assert.equal(list[4].drafts.length, 1);
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

test("bucketChats: archived が nested なら、いちばん外の段のまとまりごとにアーカイブ済みを入れる（アーカイブ済みだけのまとまりも作る）", () => {
  const chats = [
    chat(1, { group_id: 4, status: "running" }),
    chat(2, { group_id: 4, archived_at: "x" }),
    chat(3, { archived_at: "x" }),
    chat(4, { group_id: 5, archived_at: "x", pinned: true }),
    chat(5, { pinned: true }),
    chat(6, { group_id: 4, archived_at: "x" }),
  ];
  const list = bucketChats(chats, { ...ctx, by: ["group", "status"], project: 1, pinned: true, archived: "nested" });
  assert.deepEqual(
    list.map((b) => [b.key, b.chats.map((c) => c.id), b.archived?.key ?? null, b.archived?.chats.map((c) => c.id) ?? null]),
    [
      ["p1/pinned", [5], null, null],
      ["p1/g4", [1], "p1/g4/archived", [6, 2]],
      // 固定したアーカイブ済みは、固定ではなくグループのアーカイブ済みへ。チャットのないグループも、アーカイブ済みのために作る
      ["p1/g5", [], "p1/g5/archived", [4]],
      ["p1/ungrouped", [], "p1/ungrouped/archived", [3]],
    ],
  );
  // 中の段（状態）は、アーカイブしていないものだけで分ける
  assert.deepEqual(list[1].children?.map((c) => c.key), ["p1/g4/status:running"]);
  assert.equal(list[1].archived?.kind, "archived");
  // まとめないときは、「アーカイブ済み」に抜き出す
  assert.deepEqual(shape(bucketChats([chat(1), chat(2, { archived_at: "x" })], { pending, by: [], project: 1, archived: "nested" })), [
    ["p1/all", [1]],
    ["p1/archived", [2]],
  ]);
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
  // 作業場所別のまとまりから始めた下書きは、そのワークツリーのまとまり
  assert.equal(draftHead({ projectId: 2, worktree: "/repo-wt/x" }, "worktree", ctx)?.key, "p2/w:/repo-wt/x");
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

test("flattenBucketChats: 画面に並ぶ順の 1 列にする（固定 → まとまりの中の段の順 → まとまりのアーカイブ済み）", () => {
  const chats = [
    chat(1, { group_id: 4, status: "running" }),
    chat(2, { group_id: 4 }),
    chat(3, { group_id: 4, archived_at: "x" }),
    chat(4, { pinned: true }),
    chat(5, { group_id: 5 }),
    chat(6),
  ];
  const nested = bucketChats(chats, { ...ctx, by: ["group", "status"], project: 1, pinned: true, archived: "nested" });
  assert.deepEqual(flattenBucketChats(nested).map((c) => c.id), [4, 1, 2, 3, 5, 6]);
  // まとめないときは、最後に動いた順のあとにアーカイブ済み
  const flat = bucketChats(chats, { ...ctx, by: [], project: 1, pinned: true, archived: "bucket" });
  assert.deepEqual(flattenBucketChats(flat).map((c) => c.id), [4, 6, 5, 2, 1, 3]);
});

test("newChatPlaceOf: グループ・No Group・作業場所のまとまりだけ、そこで始める作成先を返す", () => {
  const group = makeGroup(7, { project_id: 3 });
  const place = (kind: "main" | "worktree" | "missing", key = "") => ({ key, kind, name: "b", title: "" });
  assert.deepEqual(newChatPlaceOf({ key: "g", kind: "group", label: "G", projectId: 3, group }), { projectId: 3, group: 7 });
  assert.deepEqual(newChatPlaceOf({ key: "u", kind: "ungrouped", label: "No Group", projectId: 3 }), { projectId: 3 });
  assert.deepEqual(newChatPlaceOf({ key: "m", kind: "worktree", label: "main", projectId: 3, place: place("main") }), { projectId: 3 });
  assert.deepEqual(newChatPlaceOf({ key: "w", kind: "worktree", label: "b", projectId: 3, place: place("worktree", "/wt/b") }), { projectId: 3, worktree: "/wt/b" });
  // フォルダが見つからない・場所の決まらないまとまり・プロジェクトの分からないまとまりでは始めない
  assert.equal(newChatPlaceOf({ key: "x", kind: "worktree", label: "b", projectId: 3, place: place("missing", "/wt/x") }), null);
  assert.equal(newChatPlaceOf({ key: "s", kind: "pinned", label: "固定", projectId: 3 }), null);
  assert.equal(newChatPlaceOf({ key: "u", kind: "ungrouped", label: "No Group" }), null);
  // プロジェクトを渡せば、まとまりにプロジェクトがなくてもそれを使う
  assert.deepEqual(newChatPlaceOf({ key: "u", kind: "ungrouped", label: "No Group" }, 5), { projectId: 5 });
});
