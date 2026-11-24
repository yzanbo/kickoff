import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { DB_FILE } from "@/foundation/core/db/db";
import { appDataDir } from "@/foundation/core/system/appEnv";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { siblingSessionCheck } from "./siblingSessions";

test("ほかの Kickoff の DB が使っているセッションだけを返す（自分の保存先は見ない。DB がなければ空）", () => {
  const root = tempDir();
  const prod = appDataDir(root, "production");
  const dev = appDataDir(root, "development");
  fs.mkdirSync(prod, { recursive: true });
  fs.mkdirSync(dev, { recursive: true });
  const store = testStore({ file: path.join(prod, DB_FILE) });
  const project = store.projects.create({ name: "p", repo_path: "/work/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, title: "c", provider: "claude", status: "completed" });
  store.chats.update(chat.id, { session_id: "s-chat" });
  store.chatProviderSessions.save(chat.id, "codex", "s-other-ai", null);
  store.events.add(chat.id, { type: "init", session_id: "s-init", model: "m", cwd: "/work/p", tools: [] } as never);
  store.close();

  const fromDev = siblingSessionCheck(dev, root);
  const remembered = store.chatProviderSessions.remembered;
  assert.deepEqual([...fromDev(["s-chat", "s-init", "s-other-ai", "s-none"], remembered)].sort(), ["s-chat", "s-init", "s-other-ai"]);
  // 製品版から見ると、開発版の DB はないので空（自分の DB は見ない）
  assert.equal(siblingSessionCheck(prod, root)(["s-chat"], remembered).size, 0);
});

test("ほかの Kickoff の DB が読めない（版が違って表がない・壊れている）ときは、すべて使っている扱い（会話記録を片付けない）", () => {
  const root = tempDir();
  const prod = appDataDir(root, "production");
  const dev = appDataDir(root, "development");
  fs.mkdirSync(prod, { recursive: true });
  fs.writeFileSync(path.join(prod, DB_FILE), "Kickoff のデータベースではない");
  assert.deepEqual([...siblingSessionCheck(dev, root)(["s1", "s2"], () => new Set())].sort(), ["s1", "s2"]);
});
