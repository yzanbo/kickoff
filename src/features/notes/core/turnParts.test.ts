import assert from "node:assert/strict";
import { test } from "vitest";
import { noteSection } from "./turnParts";

test("ノート: どのチャットでも「ノート」が「ノート」タブのノート（フォルダ）のことだと伝え、ノートのチャットはどのノートの横かを伝える", () => {
  const plain = noteSection({ dir: "/tmp/notes/a", file: null, commonDir: null }).lines.join("\n");
  assert.ok(plain.includes("利用者が「ノート」と言ったら、Kickoff の「ノート」タブのノートのことです"));
  assert.ok(plain.includes("ノートフォルダ `/tmp/notes/a`"));
  assert.ok(!plain.includes("の横で話しています"));
  const noteChat = noteSection({ dir: "/tmp/notes/a", file: "/tmp/notes/a/x.md", commonDir: null });
  assert.equal(noteChat.heading, "## ノート");
  assert.ok(noteChat.lines.join("\n").includes("`/tmp/notes/a/x.md` の横で話しています"));
  assert.ok(!noteChat.lines.join("\n").includes("利用者が「ノート」と言ったら"));
});

test("ノート: 共通のノートのフォルダはノートフォルダと分けて伝え、共通のノート自身のチャットではノートフォルダがそれだと伝える", () => {
  const plain = noteSection({ dir: "/tmp/notes/a", file: null, commonDir: "/tmp/notes/_common" }).lines.join("\n");
  assert.ok(plain.includes("「共通のノート」と言ったら"));
  assert.ok(plain.includes("`/tmp/notes/_common`"));
  const noteChat = noteSection({ dir: "/tmp/notes/a", file: "/tmp/notes/a/x.md", commonDir: "/tmp/notes/_common" }).lines.join("\n");
  assert.ok(noteChat.includes("`/tmp/notes/_common`"));
  const inCommon = noteSection({ dir: "/tmp/notes/_common", file: "/tmp/notes/_common/x.md", commonDir: null, inCommon: true }).lines.join("\n");
  assert.ok(inCommon.includes("このノートは「共通のノート」"));
  assert.ok(!inCommon.includes("「共通のノート」と言ったら"));
  assert.ok(!noteSection({ dir: "/tmp/notes/a", file: null, commonDir: null }).lines.join("\n").includes("共通のノート"));
});
