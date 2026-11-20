// 作業場所の土台の登録先（git に足す環境変数）
import assert from "node:assert/strict";
import { test } from "vitest";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { git } from "./git";
import { createWorkplaceKit } from "./kit";

test("Kernel.workplace.git は登録した環境変数を足し、手元の git(cwd) は足さない", async () => {
  const { dir } = gitRepo();
  const kit = createWorkplaceKit();
  kit.gitEnv.register(async () => ({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "kickoff.token", GIT_CONFIG_VALUE_0: "yes" }));
  assert.equal(await kit.git(dir).text(["config", "kickoff.token"]), "yes");
  assert.equal(await git(dir).maybe(["config", "kickoff.token"]), "");
  // 登録がなければ何も足さない（ほかの Kernel の登録は混ざらない）
  assert.equal(await createWorkplaceKit().git(dir).maybe(["config", "kickoff.token"]), "");
});
