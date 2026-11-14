import { test } from "node:test";
import assert from "node:assert/strict";
import { trashCommandEnv } from "./command.js";

test("trashCommandEnv: コマンドのフォルダを PATH の前に足し、置き場・チャット・コマンドの場所を渡す", () => {
  const env = trashCommandEnv({ path: "/data/bin/kickoff-trash", dir: "/data/trash" }, 12, "/usr/bin:/bin");
  assert.deepEqual(env, { PATH: "/data/bin:/usr/bin:/bin", KICKOFF_TRASH_DIR: "/data/trash", KICKOFF_CHAT_ID: "12", KICKOFF_TRASH: "/data/bin/kickoff-trash" });
  assert.equal(trashCommandEnv({ path: "/d/bin/kickoff-trash", dir: "/d/trash" }, 1, "").PATH, "/d/bin");
});
