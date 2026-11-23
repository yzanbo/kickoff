import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import { groupLinkedChats } from "./linkedChats";

test("groupLinkedChats: そのリポジトリの issue・PR に結び付いたチャットを「種類:番号」ごとに並びのまま（大文字・小文字は区別しない）", () => {
  const a = makeChat(1, { github_kind: "pr", github_number: 5, github_repo: "Acme/Alpha" });
  const b = makeChat(2, { github_kind: "pr", github_number: 5, github_repo: "acme/alpha" });
  const c = makeChat(3, { github_kind: "issue", github_number: 5, github_repo: "acme/alpha" });
  const other = makeChat(4, { github_kind: "pr", github_number: 5, github_repo: "acme/beta" });
  const none = makeChat(5);
  const map = groupLinkedChats([a, b, c, other, none], "acme/alpha");
  assert.deepEqual([...map.entries()].map(([k, v]) => [k, v.map((x) => x.id)]), [["pr:5", [1, 2]], ["issue:5", [3]]]);
});
