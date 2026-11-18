import { test } from "vitest";
import assert from "node:assert/strict";
import { railGroupsOf } from "./railGroups";

test("ブラウザだけのまとまりが先頭で、プロジェクトのタブのまとまりを並べた順のまま続ける（ボード・チャットだけのまとまりは出さない）", () => {
  const groups = railGroupsOf(
    [
      { key: "work", label: "チャット", tabs: [{ tab: "board", label: "ボード", icon: "b" }, { tab: "chats", label: "チャット", icon: "c" }] },
      { key: "memos", label: "メモ", tabs: [{ tab: "memos", label: "メモ", icon: "m" }] },
      {
        key: "code",
        label: "コード",
        tabs: [
          { tab: "files", label: "ファイル", icon: "f" },
          { tab: "history", label: "履歴", icon: "h" },
        ],
      },
      { key: "ci", label: "CI", tabs: [{ tab: "ci", label: "CI", tip: "CI の結果", icon: "i" }] },
    ],
    { label: "ブラウザ", icon: "g" },
  );
  assert.deepEqual(
    groups.map((g) => [g.key, g.items.map((i) => i.view)]),
    [
      ["browser", ["browser"]],
      ["memos", ["memos"]],
      ["code", ["files", "history"]],
      ["ci", ["ci"]],
    ],
  );
  // 乗せたときの名前は、タブの長い名前（tip）があればそれ
  assert.equal(groups[3].items[0].label, "CI の結果");
});
