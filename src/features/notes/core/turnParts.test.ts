import assert from "node:assert/strict";
import { test } from "vitest";
import { noteSection } from "./turnParts";

test("ノート: どのチャットでも「ノート」が「ノート」タブのノート（フォルダ）のことだと伝え、ノートのチャットはどのノートの横かを伝える", () => {
  const plain = noteSection({ dir: "/tmp/notes/a", file: null }).lines.join("\n");
  assert.ok(plain.includes("利用者が「ノート」と言ったら、Kickoff の「ノート」タブのノートのことです"));
  assert.ok(plain.includes("ノートフォルダ `/tmp/notes/a`"));
  assert.ok(!plain.includes("の横で話しています"));
  const noteChat = noteSection({ dir: "/tmp/notes/a", file: "/tmp/notes/a/x.md" });
  assert.equal(noteChat.heading, "## ノート");
  assert.ok(noteChat.lines.join("\n").includes("`/tmp/notes/a/x.md` の横で話しています"));
  assert.ok(!noteChat.lines.join("\n").includes("利用者が「ノート」と言ったら"));
});
