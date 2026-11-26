import assert from "node:assert/strict";
import { test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { TurnContributor } from "@/features/chat/core/index";
import { makeProject } from "@shared/projects/testing";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { noteSection, noteTurnParts } from "./turnParts";

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

test("ノート: 共通のチャットには、ノートは頼まれたときだけ読み書きし、始めに読みにいかないよう伝える（共通のノートのチャットはノートの横の説明のまま）", () => {
  const plain = noteSection({ dir: "/tmp/notes/_common", file: null, commonDir: null, inCommon: true }).lines.join("\n");
  assert.ok(plain.includes("共通のノートのフォルダ `/tmp/notes/_common`"));
  assert.ok(plain.includes("頼まれたときだけ読み書きしてください"));
  assert.ok(plain.includes("会話の始めにノートの一覧や中身を読みにいかないでください"));
  assert.ok(plain.includes("get_project_note_dir"));
  assert.ok(!plain.includes("このノートは「共通のノート」"));
  const noteChat = noteSection({ dir: "/tmp/notes/_common", file: "/tmp/notes/_common/x.md", commonDir: null, inCommon: true }).lines.join("\n");
  assert.ok(noteChat.includes("このノートは「共通のノート」"));
  assert.ok(!noteChat.includes("get_project_note_dir"));
});

test("ノート: 共通のチャットはアーカイブしていない利用者のプロジェクトのノートのフォルダ（あるものだけ）を読むだけで足し、書く場所は共通のノートだけ。プロジェクトのチャットには足さない", async () => {
  const root = tempDir();
  const common = makeProject(1, { kind: "common" });
  const projects = [common, makeProject(2), makeProject(3, { archived_at: "2026-01-01T00:00:00.000Z" }), makeProject(4)];
  const dirOf = (p: { id: number }) => path.join(root, p.id === 1 ? "_common" : `n${p.id}`);
  for (const id of [2, 3]) fs.mkdirSync(dirOf({ id }), { recursive: true });
  const parts = noteTurnParts({ dirOf, peekDirsOf: (list) => list.map(dirOf), projects: () => projects, commonProject: () => common, publish: () => {} });
  const contextOf = (project: (typeof projects)[number]) => ({ chat: { note_path: null, project_id: project.id }, project, perTurn: <T,>(_key: string, init: () => T) => init() }) as unknown as Parameters<TurnContributor["contribute"]>[0];
  const inCommon = (await parts.contribute(contextOf(common)))!;
  assert.deepEqual(inCommon.writableDirs, [dirOf(common)]);
  assert.deepEqual(inCommon.readOnlyDirs, [dirOf({ id: 2 })]);
  assert.deepEqual(inCommon.readableDirs, [dirOf(common), dirOf({ id: 2 })]);
  // まだないフォルダは作らない
  assert.equal(fs.existsSync(dirOf({ id: 4 })), false);
  const inProject = (await parts.contribute(contextOf(projects[1])))!;
  assert.deepEqual(inProject.readOnlyDirs, []);
  assert.deepEqual(inProject.readableDirs, [dirOf({ id: 2 }), dirOf(common)]);
});

