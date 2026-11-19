import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { Store } from "@/foundation/core/db/store";
import { DB_FILE } from "@/foundation/core/db/open";
import { appDataDir } from "@/foundation/core/system/appEnv";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { siblingSessionCheck } from "./siblingSessions";

test("ほかの Kickoff の DB が使っているセッションだけを返す（自分の保存先は見ない。DB がなければ空）", () => {
  const root = tempDir();
  const prod = appDataDir(root, "production");
  const dev = appDataDir(root, "development");
  fs.mkdirSync(prod, { recursive: true });
  fs.mkdirSync(dev, { recursive: true });
  const store = new Store(path.join(prod, DB_FILE), () => {});
  const project = store.projects.create({ name: "p", repo_path: "/work/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, title: "c", provider: "claude", status: "completed" });
  store.chats.update(chat.id, { session_id: "s-chat" });
  store.chatProviderSessions.save(chat.id, "codex", "s-other-ai", null);
  store.events.add(chat.id, { type: "init", session_id: "s-init", model: "m", cwd: "/work/p", tools: [] } as never);
  store.close();

  const fromDev = siblingSessionCheck(dev, root);
  assert.deepEqual([...fromDev(["s-chat", "s-init", "s-other-ai", "s-none"])].sort(), ["s-chat", "s-init", "s-other-ai"]);
  // 製品版から見ると、開発版の DB はないので空（自分の DB は見ない）
  assert.equal(siblingSessionCheck(prod, root)(["s-chat"]).size, 0);
});
