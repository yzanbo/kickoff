import assert from "node:assert/strict";
import { test } from "vitest";
import { describeView, viewDescribers } from "@/foundation/ui/shell/viewDescribers";
import { installMemoryStorage } from "@/foundation/ui/storage/memoryStorage";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { selectGitHubItem } from "./openGitHubItem";
import { githubDescriber } from "./viewDescriber";

installMemoryStorage();

test("GitHub の画面の説明（get_user_view）: プロジェクトで開いている issue・PR（開いていなければ null）。持ち主のいない画面は null", () => {
  useTestContributions([viewDescribers.item(githubDescriber)]);
  assert.deepEqual(describeView("github", { projectId: 7, surface: "project-7" }), { kind: "github", item: null, project_id: 7 });
  selectGitHubItem(7, { kind: "pr", number: 12 });
  assert.deepEqual(describeView("github", { projectId: 7, surface: "chat-3" }), { kind: "github", item: { kind: "pr", number: 12 }, project_id: 7 });
  assert.equal(describeView("files", { projectId: 7, surface: "project-7" }), null);
});
