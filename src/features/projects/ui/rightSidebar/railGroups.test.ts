import { test } from "vitest";
import assert from "node:assert/strict";
import { railGroupsOf } from "./railGroups";

test("プロジェクトのタブのまとまりから、ボード・チャットを除いた列のまとまりを作る（中身がなくなったまとまりは出さない）", () => {
  const groups = railGroupsOf([
    { key: "work", label: "チャット", tabs: [{ tab: "board", label: "ボード", icon: "b" }, { tab: "chats", label: "チャット", icon: "c" }] },
    { key: "notes", label: "ノート", tabs: [{ tab: "notes", label: "ノート", icon: "m" }] },
    {
      key: "code",
      label: "コード",
      tabs: [
        { tab: "files", label: "ファイル", icon: "f" },
        { tab: "history", label: "履歴", icon: "h" },
      ],
    },
    { key: "ci", label: "CI", tabs: [{ tab: "ci", label: "CI", tip: "CI の結果", icon: "i" }] },
  ]);
  assert.deepEqual(
    groups.map((g) => [g.key, g.tabs.map((t) => t.tab)]),
    [
      ["notes", ["notes"]],
      ["code", ["files", "history"]],
      ["ci", ["ci"]],
    ],
  );
  // 乗せたときの名前は、タブの長い名前（tip）があればそれ
  assert.equal(groups[2].tabs[0].label, "CI の結果");
});
