import assert from "node:assert/strict";
import { test } from "vitest";
import { fileMenuItems, fileMenuLabel, type FileMenuContext, type FileMenuGroup, type FileMenuTarget } from "./fileMenuItems";

/** 押したものを控える操作 */
function context(explorer: boolean) {
  const calls: string[] = [];
  const ctx: FileMenuContext = {
    explorer,
    startCreate: (parent, dir) => calls.push(`create ${parent} ${dir}`),
    startRename: (path) => calls.push(`rename ${path}`),
    trash: (entries) => calls.push(`trash ${entries.map((e) => e.path).join(",")}`),
    runGit: (action, paths) => calls.push(`${action} ${paths.join(",")}`),
    openTab: (path, staged) => calls.push(`tab ${path} ${staged}`),
    openInFilesTab: (path) => calls.push(`files ${path}`),
    onFindInFolder: (folder) => calls.push(`find ${folder}`),
  };
  return { ctx, calls };
}

/** 組ごとの項目の名前（パスの組は "paths:<パス>"） */
const labels = (groups: FileMenuGroup[]) => groups.map((g) => (g.kind === "paths" ? [`paths:${g.paths.join(",")}${g.dir ? "/" : ""}`] : g.items.map((i) => i.label)));
const run = (groups: FileMenuGroup[], label: string) => groups.flatMap((g) => (g.kind === "actions" ? g.items : [])).find((i) => i.label === label)?.run();

const file = (path: string, patch: Partial<NonNullable<FileMenuTarget>> = {}): FileMenuTarget => ({ path, dir: false, ignored: false, many: null, ...patch });

test("fileMenuItems: ファイルタブの木のファイル・フォルダー・空いている所", () => {
  const { ctx, calls } = context(true);
  const one = fileMenuItems(file("src/a.ts"), ctx);
  assert.deepEqual(labels(one), [["新しいファイル…", "新しいフォルダー…"], ["新しいタブで開く"], ["paths:src/a.ts"], ["名前を変更", "ゴミ箱に入れる…"]]);
  run(one, "新しいファイル…");
  run(one, "ゴミ箱に入れる…");
  assert.deepEqual(calls, ["create src false", "trash src/a.ts"]);
  assert.deepEqual(labels(fileMenuItems(file("src", { dir: true }), ctx)), [["新しいファイル…", "新しいフォルダー…"], ["フォルダー内を検索"], ["paths:src/"], ["名前を変更", "ゴミ箱に入れる…"]]);
  // 無視しているフォルダーの中には作らない
  assert.deepEqual(labels(fileMenuItems(file("dist", { dir: true, ignored: true }), ctx))[0], ["フォルダー内を検索"]);
  assert.deepEqual(labels(fileMenuItems(null, ctx)), [["新しいファイル…", "新しいフォルダー…"], ["paths:/"]]);
  assert.equal(fileMenuLabel(null), "ファイルの操作");
});

test("fileMenuItems: 変更の一覧のファイルはファイルタブで開け、作る・ゴミ箱は出さない", () => {
  const { ctx, calls } = context(false);
  for (const staged of [true, false]) {
    const groups = fileMenuItems(file("src/example.ts", { staged }), ctx);
    assert.deepEqual(labels(groups), [["新しいタブで開く", "ファイルタブで開く"], ["paths:src/example.ts"], ["名前を変更"]]);
    run(groups, "新しいタブで開く");
    run(groups, "ファイルタブで開く");
  }
  assert.deepEqual(calls, ["tab src/example.ts true", "files src/example.ts", "tab src/example.ts false", "files src/example.ts"]);
  assert.deepEqual(labels(fileMenuItems(null, ctx)), [["paths:/"]]);
});

test("fileMenuItems: いくつか選んでいれば、すべてに効く組", () => {
  const many = [
    { path: "a.ts", dir: false, staged: false },
    { path: "b.ts", dir: false, staged: true },
    { path: "src", dir: true, staged: false },
  ];
  const changes = context(false);
  const groups = fileMenuItems(file("a.ts", { many }), changes.ctx);
  assert.deepEqual(labels(groups), [["新しいタブで開く（2 件）"], ["ステージする（2 件）", "ステージを取り消す（1 件）", "変更を元に戻す…（2 件）"], ["paths:a.ts,b.ts,src"]]);
  run(groups, "ステージする（2 件）");
  assert.deepEqual(changes.calls, ["stage a.ts,src"]);
  assert.equal(fileMenuLabel(file("a.ts", { many })), "選んだ 3 件の操作");
  const tree = context(true);
  const files = many.map(({ path, dir }) => ({ path, dir }));
  assert.deepEqual(labels(fileMenuItems(file("a.ts", { many: files }), tree.ctx)), [["新しいタブで開く（2 件）"], ["paths:a.ts,b.ts,src"], ["ゴミ箱に入れる…（3 件）"]]);
});
